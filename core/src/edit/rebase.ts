/**
 * Update from my subscription (PLAN.md Q32): the user's edits, worked out by
 * meaning between the old original (O) and their edited config (E), applied
 * to the provider's new config (N).
 *
 * - Settings are compared by name, lists of words (DNS servers, fake-IP
 *   exceptions) by what was added and removed.
 * - Servers and groups are matched by name; renames are found by content.
 * - Rules are matched by kind and value (DOMAIN-SUFFIX,example.com), so a
 *   rule sent somewhere else is one change, wherever it sits.
 *
 * Where only one side changed something, it's taken. Where both did, it's a
 * conflict: nothing of the user's is overwritten without asking. Each
 * conflict has a suggested answer by kind: what the connection needs
 * (server details, per-site DNS, DNS for finding servers, hosts, proxy
 * providers) suggests the provider's; preferences suggest the user's.
 *
 * The result is a list of changes for the new config, in order, each
 * worked out against the config as it is at that point (CLAUDE.md).
 */
import type { Document } from 'yaml';
import { intake, LIMITS, type Refusal } from '../intake';
import { applyChange, type Change, type Value } from './changes';
import { groupUses, removeGroupChanges } from './groups';
import { BUILT_IN_TARGETS, renameChanges } from './references';
import { insertPosition, readRule } from './rules';
import { removeManyBlockers, removeManyChanges } from './servers';

type Config = Record<string, unknown>;
type Path = (string | number)[];

export type Category = 'critical' | 'preference';
export type Choice = 'mine' | 'theirs';

export interface Conflict {
  /** Stable id, used to answer it. */
  id: string;
  kind: 'setting' | 'server' | 'group' | 'rule';
  /** What it's about, for the page: a setting's name, "Server: field", a rule. */
  label: string;
  original: Value | undefined;
  mine: Value | undefined;
  theirs: Value | undefined;
  category: Category;
}

export type Note =
  | { kind: 'server-gone'; server: string }
  | { kind: 'group-gone'; group: string }
  | { kind: 'rule-gone'; rule: string }
  | { kind: 'name-taken'; name: string }
  | { kind: 'cannot-remove'; name: string }
  | { kind: 'group-order'; group: string }
  | { kind: 'rule-order' };

export type RebaseResult =
  | { ok: true; changes: Change[]; notes: Note[]; applied: number }
  | { ok: false; reason: 'result'; refusal: Refusal };

export interface RebasePlan {
  conflicts: Conflict[];
  /** Applies the edits to the new config; unanswered conflicts take their suggested answer. */
  apply(choices?: Readonly<Record<string, Choice>>): RebaseResult;
}

const isObject = (v: unknown): v is Config => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isWords = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const nameOf = (v: unknown): string | undefined => (isObject(v) && typeof v['name'] === 'string' ? v['name'] : undefined);
const plain = (doc: Document): Config => {
  const d = doc.toJS({ maxAliasCount: LIMITS.maxAliasCount }) as unknown;
  return isObject(d) ? d : {};
};

/** The structured parts handled by name; everything else is a setting. */
const STRUCTURED = new Set(['proxies', 'proxy-groups', 'rules']);

/** What the connection needs: the provider's answer is suggested. */
export function categoryOf(path: readonly (string | number)[]): Category {
  const [a, b] = path;
  if (a === 'proxies' || a === 'hosts' || a === 'proxy-providers') return 'critical';
  if (a === 'dns' && (b === 'nameserver-policy' || b === 'proxy-server-nameserver' || b === 'default-nameserver')) return 'critical';
  return 'preference';
}

const suggested = (c: Category): Choice => (c === 'critical' ? 'theirs' : 'mine');

function get(c: unknown, path: readonly string[]): unknown {
  let cur: unknown = c;
  for (const k of path) {
    if (!isObject(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

/** Pairs renamed items: the same thing under a new name (servers by content, groups by type and members). */
function renames<T>(gone: T[], fresh: T[], similar: (a: T, b: T) => number): [T, T][] {
  const out: [T, T][] = [];
  const left = [...fresh];
  for (const g of gone) {
    let best = -1;
    let score = 0;
    left.forEach((f, i) => {
      const s = similar(g, f);
      if (s > score) {
        score = s;
        best = i;
      }
    });
    if (best !== -1 && score >= 0.5) {
      out.push([g, left[best] as T]);
      left.splice(best, 1);
    }
  }
  return out;
}

export function planRebase(oldOriginal: Config, edited: Config, newText: string): RebasePlan | { ok: false; refusal: Refusal } {
  const start = intake(newText);
  if (!start.ok) return { ok: false, refusal: start.refusal };
  const N0 = start.data;
  const O = oldOriginal;
  const E = edited;
  const conflicts: Conflict[] = [];
  const conflict = (c: Omit<Conflict, 'category'> & { path: readonly (string | number)[] }) => {
    const { path, ...rest } = c;
    conflicts.push({ ...rest, category: categoryOf(path) });
  };

  // ---- Servers: matched by name; renames found by content. ----
  const oServers = list(O['proxies']).filter(isObject);
  const eServers = list(E['proxies']).filter(isObject);
  const eNames = new Set(eServers.map((s) => nameOf(s)));
  const oNames = new Set(oServers.map((s) => nameOf(s)));
  const noName = (s: Config) => JSON.stringify({ ...s, name: undefined });
  const serverRenames = renames(
    oServers.filter((s) => !eNames.has(nameOf(s))),
    eServers.filter((s) => !oNames.has(nameOf(s))),
    (a, b) => (noName(a) === noName(b) ? 1 : 0),
  ).map(([a, b]) => ({ from: nameOf(a) ?? '', to: nameOf(b) ?? '' }));
  const renamedFrom = new Map(serverRenames.map((r) => [r.from, r.to]));
  const renamedTo = new Set(serverRenames.map((r) => r.to));
  const nServerNames = new Set(list(N0['proxies']).map((s) => nameOf(s)));

  // Field changes to servers both sides have (after a rename, by its old name in N).
  const serverFieldConflicts = new Map<string, Conflict[]>();
  for (const o of oServers) {
    const oName = nameOf(o) ?? '';
    const eName = renamedFrom.get(oName) ?? oName;
    const e = eServers.find((s) => nameOf(s) === eName);
    if (!e) continue;
    const n = list(N0['proxies']).find((s) => nameOf(s) === oName);
    if (!isObject(n)) continue;
    for (const field of new Set([...Object.keys(o), ...Object.keys(e)])) {
      if (field === 'name' || same(o[field], e[field])) continue;
      if (same(n[field], o[field]) || same(n[field], e[field])) continue;
      const c: Conflict = {
        id: `server:${eName}:${field}`,
        kind: 'server',
        label: `${eName}: ${field}`,
        original: o[field] as Value,
        mine: e[field] as Value,
        theirs: n[field] as Value,
        category: 'critical',
      };
      conflicts.push(c);
      serverFieldConflicts.set(eName, [...(serverFieldConflicts.get(eName) ?? []), c]);
    }
  }

  // ---- Groups: by name; renames by type and members. ----
  const oGroups = list(O['proxy-groups']).filter(isObject);
  const eGroups = list(E['proxy-groups']).filter(isObject);
  const eGroupNames = new Set(eGroups.map((g) => nameOf(g)));
  const oGroupNames = new Set(oGroups.map((g) => nameOf(g)));
  const mapMember = (m: string) => renamedFrom.get(m) ?? m;
  const groupRenames = renames(
    oGroups.filter((g) => !eGroupNames.has(nameOf(g))),
    eGroups.filter((g) => !oGroupNames.has(nameOf(g))),
    (a, b) => {
      if (a['type'] !== b['type']) return 0;
      const am = new Set(list(a['proxies']).map((m) => (typeof m === 'string' ? mapMember(m) : '')));
      const bm = list(b['proxies']);
      if (am.size === 0 && bm.length === 0) return 1;
      const shared = bm.filter((m) => typeof m === 'string' && am.has(m)).length;
      return shared / Math.max(am.size, bm.length);
    },
  ).map(([a, b]) => ({ from: nameOf(a) ?? '', to: nameOf(b) ?? '' }));
  const groupFrom = new Map(groupRenames.map((r) => [r.from, r.to]));
  const allRenames = new Map([...renamedFrom, ...groupFrom]);
  const mapName = (m: string) => allRenames.get(m) ?? m;

  for (const o of oGroups) {
    const oName = nameOf(o) ?? '';
    const eName = groupFrom.get(oName) ?? oName;
    const e = eGroups.find((g) => nameOf(g) === eName);
    const n = list(N0['proxy-groups']).find((g) => nameOf(g) === oName);
    if (!e || !isObject(n)) continue;
    for (const field of new Set([...Object.keys(o), ...Object.keys(e)])) {
      if (field === 'name' || field === 'proxies' || same(o[field], e[field])) continue;
      if (same(n[field], o[field]) || same(n[field], e[field])) continue;
      conflict({
        id: `group:${eName}:${field}`,
        kind: 'group',
        label: `${eName}: ${field}`,
        original: o[field] as Value,
        mine: e[field] as Value,
        theirs: n[field] as Value,
        path: ['proxy-groups', eName, field],
      });
    }
  }

  // ---- Rules: by kind and value. ----
  const keyOf = (r: string) => {
    const v = readRule(r, 0);
    return v.type === 'MATCH' ? 'MATCH' : `${v.type},${v.payload}`;
  };
  const mapRule = (r: string) => {
    const v = readRule(r, 0);
    const target = mapName(v.target);
    return target === v.target ? r : r.replace(new RegExp(`(^|,)\\s*${v.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?=,|$)`), `$1${target}`);
  };
  const keyed = (rules: unknown[], map: (r: string) => string = (r) => r) => {
    const m = new Map<string, string>();
    const dup = new Set<string>();
    for (const r of rules) {
      if (typeof r !== 'string') continue;
      const k = keyOf(r);
      if (m.has(k)) dup.add(k);
      else m.set(k, map(r));
    }
    return { m, dup };
  };
  const oRules = keyed(list(O['rules']), mapRule);
  const eRules = keyed(list(E['rules']));
  const nRules0 = keyed(list(N0['rules']), mapRule);
  for (const [k, oText] of oRules.m) {
    if (oRules.dup.has(k) || eRules.dup.has(k) || nRules0.dup.has(k)) continue;
    const eText = eRules.m.get(k);
    const nText = nRules0.m.get(k);
    if (eText === oText || nText === undefined || nText === oText || nText === eText) continue;
    conflict({ id: `rule:${k}`, kind: 'rule', label: eText ?? oText, original: oText, mine: eText, theirs: nText, path: ['rules'] });
  }
  for (const [k, eText] of eRules.m) {
    if (oRules.m.has(k) || eRules.dup.has(k) || nRules0.dup.has(k)) continue;
    const nText = nRules0.m.get(k);
    if (nText !== undefined && nText !== eText) {
      conflict({ id: `rule:${k}`, kind: 'rule', label: eText, original: undefined, mine: eText, theirs: nText, path: ['rules'] });
    }
  }

  // ---- Settings: everything else, by name. ----
  type SettingOp = { path: string[]; kind: 'leaf'; mine: unknown } | { path: string[]; kind: 'words'; added: string[]; removed: string[] };
  const settingOps: SettingOp[] = [];
  const walk = (o: unknown, e: unknown, path: string[]) => {
    if (same(o, e)) return;
    if (isObject(o) && isObject(e)) {
      for (const k of new Set([...Object.keys(o), ...Object.keys(e)])) {
        if (path.length === 0 && STRUCTURED.has(k)) continue;
        walk(o[k], e[k], [...path, k]);
      }
      return;
    }
    // Lists of separate items (extra DNS servers, fake-IP exceptions) merge
    // what each side added and removed. What the connection needs (a
    // per-site DNS answer, the DNS for finding servers) is one answer: asked.
    if (categoryOf(path) === 'preference' && isWords(o) && isWords(e) && isWords(get(N0, path) ?? [])) {
      settingOps.push({ path, kind: 'words', added: e.filter((x) => !o.includes(x)), removed: o.filter((x) => !e.includes(x)) });
      return;
    }
    const n = get(N0, path);
    if (same(n, o) || same(n, e)) {
      if (!same(n, e)) settingOps.push({ path, kind: 'leaf', mine: e });
      return;
    }
    conflict({ id: `setting:${path.join('.')}`, kind: 'setting', label: path.join('.'), original: o as Value, mine: e as Value, theirs: n as Value, path });
    settingOps.push({ path, kind: 'leaf', mine: e });
  };
  walk(O, E, []);

  return {
    conflicts,
    apply(choices = {}): RebaseResult {
      const fresh = intake(newText);
      if (!fresh.ok) return { ok: false, reason: 'result', refusal: fresh.refusal };
      const doc = fresh.doc;
      const changes: Change[] = [];
      const notes: Note[] = [];
      let applied = 0;
      const answer = (id: string, category: Category) => choices[id] ?? suggested(category);
      const take = (c: Change[]) => {
        for (const x of c) applyChange(doc, x);
        changes.push(...c);
      };
      let N = plain(doc);
      const refresh = () => (N = plain(doc));

      // 1. Renames first, so everything after sees the user's names.
      for (const { from, to } of [...serverRenames, ...groupRenames]) {
        const isServer = renamedTo.has(to);
        const present = isServer ? list(N['proxies']).some((s) => nameOf(s) === from) : list(N['proxy-groups']).some((g) => nameOf(g) === from);
        if (!present) {
          notes.push(isServer ? { kind: 'server-gone', server: to } : { kind: 'group-gone', group: to });
          continue;
        }
        try {
          take(renameChanges(N, from, to));
          applied++;
          refresh();
        } catch {
          notes.push({ kind: 'name-taken', name: to });
        }
      }

      // 2. Servers: the user's field changes, then the servers they added.
      const nServers = () => list(N['proxies']);
      for (const o of oServers) {
        const oName = nameOf(o) ?? '';
        const eName = renamedFrom.get(oName) ?? oName;
        const e = eServers.find((s) => nameOf(s) === eName);
        if (!e) continue; // removed by the user: handled at the end
        const idx = nServers().findIndex((s) => nameOf(s) === eName);
        const changedFields = [...new Set([...Object.keys(o), ...Object.keys(e)])].filter((f) => f !== 'name' && !same(o[f], e[f]));
        if (idx === -1) {
          if (changedFields.length > 0) notes.push({ kind: 'server-gone', server: eName });
          continue;
        }
        const n = nServers()[idx] as Config;
        for (const f of changedFields) {
          if (same(n[f], e[f])) continue;
          const c = (serverFieldConflicts.get(eName) ?? []).find((x) => x.id === `server:${eName}:${f}`);
          if (c && answer(c.id, c.category) === 'theirs') continue;
          take(e[f] === undefined ? [{ op: 'delete', path: ['proxies', idx, f] }] : [{ op: 'set', path: ['proxies', idx, f], value: e[f] as Value }]);
          applied++;
        }
      }
      for (const e of eServers) {
        const name = nameOf(e) ?? '';
        if (oNames.has(name) || renamedTo.has(name)) continue;
        if (nServerNames.has(name) || list(N['proxy-groups']).some((g) => nameOf(g) === name)) {
          if (!same(nServers().find((s) => nameOf(s) === name), e)) notes.push({ kind: 'name-taken', name });
          continue;
        }
        take([{ op: 'insert', path: ['proxies'], value: e as Value }]);
        applied++;
      }
      refresh();

      // 3. Groups: fields, members, and the groups the user added.
      const exists = (m: string) =>
        BUILT_IN_TARGETS.has(m) || list(N['proxies']).some((s) => nameOf(s) === m) || list(N['proxy-groups']).some((g) => nameOf(g) === m);
      for (const o of oGroups) {
        const oName = nameOf(o) ?? '';
        const eName = groupFrom.get(oName) ?? oName;
        const e = eGroups.find((g) => nameOf(g) === eName);
        if (!e) continue; // removed by the user: handled at the end
        const gi = list(N['proxy-groups']).findIndex((g) => nameOf(g) === eName);
        if (gi === -1) {
          if (!same({ ...o, name: eName }, e)) notes.push({ kind: 'group-gone', group: eName });
          continue;
        }
        const n = list(N['proxy-groups'])[gi] as Config;
        for (const f of new Set([...Object.keys(o), ...Object.keys(e)])) {
          if (f === 'name' || f === 'proxies' || same(o[f], e[f]) || same(n[f], e[f])) continue;
          const id = `group:${eName}:${f}`;
          if (conflicts.some((c) => c.id === id) && answer(id, 'preference') === 'theirs') continue;
          take(e[f] === undefined ? [{ op: 'delete', path: ['proxy-groups', gi, f] }] : [{ op: 'set', path: ['proxy-groups', gi, f], value: e[f] as Value }]);
          applied++;
        }
        const oM = list(o['proxies']).filter((m): m is string => typeof m === 'string').map(mapName);
        const eM = list(e['proxies']).filter((m): m is string => typeof m === 'string');
        const nM = list(n['proxies']).filter((m): m is string => typeof m === 'string');
        if (same(oM, eM)) continue;
        let next: string[];
        if (same(nM, oM)) {
          next = eM.filter(exists);
        } else {
          const removed = oM.filter((m) => !eM.includes(m));
          const added = eM.filter((m) => !oM.includes(m) && !nM.includes(m) && exists(m));
          next = [...nM.filter((m) => !removed.includes(m)), ...added];
          // The first member is what a pick-by-hand group starts on: keep the user's.
          const first = eM[0];
          if (first && first !== oM[0] && next.includes(first)) next = [first, ...next.filter((m) => m !== first)];
          // Other order changes can't be laid onto a list the provider changed too.
          const kept = eM.filter((m) => oM.includes(m) && m !== first);
          if (!same(kept, oM.filter((m) => kept.includes(m)))) notes.push({ kind: 'group-order', group: eName });
        }
        const hasOther = list(n['use']).length > 0 || n['include-all'] === true;
        if (next.length === 0 && !hasOther) {
          notes.push({ kind: 'group-gone', group: eName });
          continue;
        }
        if (!same(next, nM)) {
          take([{ op: 'set', path: ['proxy-groups', gi, 'proxies'], value: next }]);
          applied++;
        }
      }
      for (const e of eGroups) {
        const name = nameOf(e) ?? '';
        if (oGroupNames.has(name) || [...groupFrom.values()].includes(name)) continue;
        if (exists(name)) {
          notes.push({ kind: 'name-taken', name });
          continue;
        }
        const members = list(e['proxies']).filter((m): m is string => typeof m === 'string' && exists(m));
        if (members.length === 0 && list(e['use']).length === 0) {
          notes.push({ kind: 'group-gone', group: name });
          continue;
        }
        take([{ op: 'insert', path: ['proxy-groups'], value: { ...e, proxies: members } as Value }]);
        applied++;
        refresh();
      }
      refresh();

      // 4. Rules, on a copy of the list kept in step with the document.
      const rules = list(N['rules']).map((r) => (typeof r === 'string' ? r : ''));
      const indexOfKey = (k: string) => rules.findIndex((r) => r !== '' && keyOf(r) === k);
      for (const [k, oText] of oRules.m) {
        if (oRules.dup.has(k) || eRules.dup.has(k)) continue;
        const eText = eRules.m.get(k);
        if (eText === oText) continue;
        const i = indexOfKey(k);
        if (i === -1) {
          if (eText !== undefined) notes.push({ kind: 'rule-gone', rule: eText });
          continue;
        }
        const nText = rules[i] ?? '';
        if (nText === eText) continue;
        if (nText !== oText && answer(`rule:${k}`, 'preference') === 'theirs') continue;
        if (eText === undefined) {
          take([{ op: 'delete', path: ['rules', i] }]);
          rules.splice(i, 1);
        } else {
          take([{ op: 'set', path: ['rules', i], value: eText }]);
          rules[i] = eText;
        }
        applied++;
      }
      const eList = list(E['rules']).filter((r): r is string => typeof r === 'string');
      eList.forEach((eText, ei) => {
        const k = keyOf(eText);
        if (oRules.m.has(k) || eRules.dup.has(k)) return;
        const i = indexOfKey(k);
        if (i !== -1) {
          if (rules[i] !== eText && answer(`rule:${k}`, 'preference') === 'mine') {
            take([{ op: 'set', path: ['rules', i], value: eText }]);
            rules[i] = eText;
            applied++;
          }
          return;
        }
        // Before the next rule (in the user's list) that the new config has, else above MATCH.
        let at = -1;
        for (const later of eList.slice(ei + 1)) {
          at = indexOfKey(keyOf(later));
          if (at !== -1) break;
        }
        if (at === -1) at = insertPosition({ rules });
        take([{ op: 'insert', path: ['rules'], index: at, value: eText }]);
        rules.splice(at, 0, eText);
        applied++;
      });
      const oCommon = [...oRules.m.keys()].filter((k) => eRules.m.has(k));
      const eCommon = eList.map(keyOf).filter((k) => oRules.m.has(k));
      if (!same(oCommon, [...new Set(eCommon)])) notes.push({ kind: 'rule-order' });

      // 5. Settings.
      for (const op of settingOps) {
        if (op.kind === 'words') {
          const cur = list(get(N, op.path)).filter((x): x is string => typeof x === 'string');
          let next = cur.filter((x) => !op.removed.includes(x));
          next = [...next, ...op.added.filter((x) => !next.includes(x))];
          if (!same(next, cur)) {
            take([{ op: 'set', path: op.path, value: next }]);
            applied++;
          }
          continue;
        }
        const id = `setting:${op.path.join('.')}`;
        const c = conflicts.find((x) => x.id === id);
        if (c && answer(id, c.category) === 'theirs') continue;
        if (op.mine === undefined) {
          if (get(N, op.path) !== undefined) take([{ op: 'delete', path: op.path }]);
        } else take([{ op: 'set', path: op.path, value: op.mine as Value }]);
        applied++;
      }
      refresh();

      // 6. What the user removed: servers, then groups.
      const goneServers = oServers
        .map((s) => nameOf(s) ?? '')
        .filter((n) => !eNames.has(n) && !renamedFrom.has(n) && list(N['proxies']).some((s) => nameOf(s) === n));
      if (goneServers.length > 0) {
        const blocked = removeManyBlockers(N, goneServers);
        if (blocked.length === 0) {
          take(removeManyChanges(N, goneServers));
          applied++;
        } else {
          for (const n of goneServers) notes.push({ kind: 'cannot-remove', name: n });
        }
        refresh();
      }
      for (const o of oGroups) {
        const name = nameOf(o) ?? '';
        if (eGroupNames.has(name) || groupFrom.has(name) || !list(N['proxy-groups']).some((g) => nameOf(g) === name)) continue;
        if (groupUses(N, name).length > 0) {
          notes.push({ kind: 'cannot-remove', name });
          continue;
        }
        take(removeGroupChanges(N, name));
        applied++;
        refresh();
      }

      const out = intake(doc.toString({ lineWidth: 0 }));
      if (!out.ok) return { ok: false, reason: 'result', refusal: out.refusal };
      return { ok: true, changes, notes, applied };
    },
  };
}

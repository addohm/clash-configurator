/**
 * Linking servers to the subscription they came from (PLAN.md Q8, Q28): the
 * saved config gets its servers from the subscription URL (a mihomo proxy
 * provider) instead of listing them, so they keep updating, and keeps as
 * many of the user's server edits as a provider allows:
 *
 * - which subscription servers they kept: a name filter;
 * - renames: the provider's `override.proxy-name`;
 * - servers they added themselves: left in `proxies`;
 * - groups: the subscription servers they listed become `use` (with a name
 *   filter when they listed only some).
 *
 * What can't carry over is reported as a loss (the order of servers inside
 * a group, a server's own settings), and what would break makes linking
 * impossible (a rule or setting naming a subscription server directly).
 * This works on a copy; the user's session is untouched.
 */
import type { Document } from 'yaml';
import { LIMITS } from '../intake';
import { applyChange, type Change, type Value } from './changes';
import { ruleTargetOf } from './references';

type Config = Record<string, unknown>;
type Server = Record<string, unknown>;

export const PROVIDER_NAME = 'subscription';
/** Twice a day (PLAN.md Q36). */
const INTERVAL = 43_200;
const USER_AGENT = 'Clash-Verge/1.0 (clash-verge-rev; mihomo)';

const isObject = (v: unknown): v is Config => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const servers = (c: Config): Server[] => list(c['proxies']).filter((p): p is Server => isObject(p) && typeof p['name'] === 'string');
const withoutName = (s: Server): string => JSON.stringify({ ...s, name: undefined });

/** A regular expression matching exactly these names. */
export function exactNames(names: readonly string[]): string {
  const escaped = [...new Set(names)].map((n) => n.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&'));
  return `^(?:${escaped.join('|')})$`;
}

export type LinkLoss =
  /** A pick-by-hand group would start on a different member. */
  | { kind: 'first'; group: string; was: string; now: string }
  /** A first-that-works group's order (its priority) would change. */
  | { kind: 'order'; group: string }
  | { kind: 'server-settings'; server: string }
  | { kind: 'new-servers-hidden' };

export type LinkBlocker =
  | { kind: 'rule'; index: number; server: string }
  | { kind: 'setting'; path: string; server: string }
  | { kind: 'no-servers' }
  /** The subscription is in a form mihomo can't read as a provider (SIP008). */
  | { kind: 'format' };

export interface LinkPlan {
  /** True when linking is possible. */
  ok: boolean;
  blockers: LinkBlocker[];
  /** Edits that won't carry over if linked. */
  losses: LinkLoss[];
  /** The changes that link the servers, applied to a copy of the edited config. */
  changes: Change[];
}

/**
 * Works out how to link the edited config `cur` to the subscription `url`,
 * given the subscription's own config `orig` (what was fetched).
 */
export function planLink(orig: Config, cur: Config, url: string, opts: { intervalSeconds?: number; format?: string } = {}): LinkPlan {
  if (opts.format === 'sip008') return { ok: false, blockers: [{ kind: 'format' }], losses: [], changes: [] };
  const origServers = servers(orig);
  const origByName = new Map(origServers.map((s) => [String(s['name']), s]));
  const origByContent = new Map<string, string>();
  for (const s of origServers) if (!origByContent.has(withoutName(s))) origByContent.set(withoutName(s), String(s['name']));

  // Each of the edited config's servers: from the subscription (perhaps
  // renamed or edited), or added by the user.
  const fromSub = new Map<string, string>(); // current name -> name in the subscription
  const renames: { from: string; to: string }[] = [];
  const losses: LinkLoss[] = [];
  const own: number[] = []; // positions in `proxies` of the user's own servers
  servers(cur).forEach((s, i) => {
    const name = String(s['name']);
    const same = origByName.get(name);
    if (same) {
      fromSub.set(name, name);
      if (JSON.stringify(same) !== JSON.stringify(s)) losses.push({ kind: 'server-settings', server: name });
      return;
    }
    const was = origByContent.get(withoutName(s));
    if (was !== undefined && !servers(cur).some((x) => x['name'] === was)) {
      fromSub.set(name, was);
      renames.push({ from: was, to: name });
      return;
    }
    own.push(i);
  });

  const blockers: LinkBlocker[] = [];
  if (fromSub.size === 0) blockers.push({ kind: 'no-servers' });
  // Rules and settings can't name a provider's servers.
  list(cur['rules']).forEach((r, index) => {
    const target = typeof r === 'string' ? ruleTargetOf(r) : undefined;
    if (target !== undefined && fromSub.has(target)) blockers.push({ kind: 'rule', index, server: target });
  });
  servers(cur).forEach((s) => {
    const via = s['dialer-proxy'];
    if (typeof via === 'string' && fromSub.has(via)) blockers.push({ kind: 'setting', path: `${String(s['name'])}: dialer-proxy`, server: via });
  });
  list(cur['listeners']).forEach((l) => {
    if (isObject(l) && typeof l['proxy'] === 'string' && fromSub.has(l['proxy'])) blockers.push({ kind: 'setting', path: 'listeners', server: l['proxy'] });
  });
  if (blockers.length > 0) return { ok: false, blockers, losses: [], changes: [] };

  // Keep only the subscription servers the user kept (both names, for
  // renamed ones: the filter works whichever order mihomo applies it in).
  const kept = [...fromSub.entries()];
  const removedSome = origServers.length > kept.length;
  if (removedSome) losses.push({ kind: 'new-servers-hidden' });
  const provider: Record<string, unknown> = {
    type: 'http',
    url,
    interval: opts.intervalSeconds && opts.intervalSeconds >= 3600 && opts.intervalSeconds <= 30 * 86400 ? Math.round(opts.intervalSeconds) : INTERVAL,
    path: `./proxy_providers/${PROVIDER_NAME}.yaml`,
    header: { 'User-Agent': [USER_AGENT] },
  };
  if (removedSome) provider['filter'] = exactNames(kept.flatMap(([now, was]) => (now === was ? [now] : [was, now])));
  if (renames.length > 0) {
    provider['override'] = { 'proxy-name': renames.map((r) => ({ pattern: exactNames([r.from]), target: r.to })) };
  }

  const changes: Change[] = [];
  // The provider. A new proxy-providers section goes in with the other
  // settings, above the servers and groups (see applyChange).
  changes.push(
    isObject(cur['proxy-providers'])
      ? { op: 'set', path: ['proxy-providers', PROVIDER_NAME], value: provider as Value }
      : { op: 'set', path: ['proxy-providers'], value: { [PROVIDER_NAME]: provider } as Value },
  );

  // Groups: subscription servers out of `proxies`, the provider into `use`.
  const subOrder = origServers.map((s) => String(s['name'])).filter((n) => [...fromSub.values()].includes(n));
  const nowName = new Map(kept.map(([now, was]) => [was, now]));
  list(cur['proxy-groups']).forEach((g, gi) => {
    if (!isObject(g)) return;
    const members = list(g['proxies']).filter((m): m is string => typeof m === 'string');
    const linked = members.filter((m) => fromSub.has(m));
    if (linked.length === 0) return;
    const others = members.filter((m) => !fromSub.has(m));
    // What the app will show: the other members, then the provider's servers in its order.
    const providerPart = subOrder.map((n) => nowName.get(n) ?? n).filter((n) => linked.includes(n));
    const after = [...others, ...providerPart];
    const type = typeof g['type'] === 'string' ? g['type'] : 'select';
    if (type === 'select' && after[0] !== members[0]) {
      losses.push({ kind: 'first', group: String(g['name']), was: members[0] ?? '', now: after[0] ?? '' });
    } else if (type === 'fallback' && after.join('\n') !== members.join('\n')) {
      losses.push({ kind: 'order', group: String(g['name']) });
    }
    const uses = list(g['use']).filter((u): u is string => typeof u === 'string');
    const value: Record<string, unknown> = { ...g, use: uses.includes(PROVIDER_NAME) ? uses : [...uses, PROVIDER_NAME] };
    if (others.length > 0) value['proxies'] = others;
    else delete value['proxies'];
    if (linked.length < kept.length) {
      const names = linked.flatMap((n) => {
        const was = fromSub.get(n);
        return was && was !== n ? [was, n] : [n];
      });
      value['filter'] = exactNames(names);
    }
    changes.push({ op: 'set', path: ['proxy-groups', gi], value: value as Value });
  });

  // Servers: only the user's own stay listed.
  if (own.length === 0) changes.push({ op: 'delete', path: ['proxies'] });
  else {
    const all = servers(cur).length;
    for (let i = all - 1; i >= 0; i--) if (!own.includes(i)) changes.push({ op: 'delete', path: ['proxies', i] });
  }
  return { ok: true, blockers: [], losses, changes };
}

/** The edited document with the servers linked: a copy, the original document untouched. */
export function linkedCopy(doc: Document, plan: LinkPlan): Document {
  const copy = doc.clone();
  for (const c of plan.changes) applyChange(copy, c);
  return copy;
}

/** The plain-object view of a document (for planning). */
export function plain(doc: Document): Config {
  const d = doc.toJS({ maxAliasCount: LIMITS.maxAliasCount }) as unknown;
  return isObject(d) ? d : {};
}

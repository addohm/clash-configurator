/**
 * Adding and removing servers, as changes that keep the config working:
 * a new server joins the groups the user picks (a server in no group can't
 * be chosen), and a removed one leaves every group that lists it. Removal is
 * refused where it would break something: a rule or another server that
 * names it, or a group left with no members.
 */
import type { Server } from '../links';
import { type Change, ChangeError } from './changes';
import { namesInUse, ruleTargetOf } from './references';

type Config = Record<string, unknown>;

const isObject = (v: unknown): v is Config => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const nameOf = (v: unknown): string | undefined => (isObject(v) && typeof v['name'] === 'string' ? v['name'] : undefined);

export interface Group {
  name: string;
  type: string;
  members: string[];
  /** Index in proxy-groups. */
  index: number;
}

export function groupsOf(config: Config): Group[] {
  return list(config['proxy-groups']).flatMap((g, index) => {
    const name = nameOf(g);
    if (!name || !isObject(g)) return [];
    const members = list(g['proxies']).filter((m): m is string => typeof m === 'string');
    return [{ name, type: typeof g['type'] === 'string' ? g['type'] : 'select', members, index }];
  });
}

export function serverNames(config: Config): string[] {
  return list(config['proxies']).flatMap((p) => {
    const n = nameOf(p);
    return n ? [n] : [];
  });
}

/**
 * The groups a new server most likely belongs in: those that already list
 * every server (a provider's main selector and its auto group, usually).
 * Read from the config itself, so nothing is invented.
 */
export function groupsWithAllServers(config: Config): string[] {
  const servers = serverNames(config);
  if (servers.length === 0) return [];
  return groupsOf(config)
    .filter((g) => servers.every((s) => g.members.includes(s)))
    .map((g) => g.name);
}

/** A name not yet in use: the name itself, or "name 2", "name 3", ... */
export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Changes that add servers at the end of `proxies` and to the end of each
 * named group. Names are made unique against the config and each other.
 * Returns the names used.
 */
export function addServersChanges(config: Config, servers: readonly Server[], groups: readonly string[]): { changes: Change[]; names: string[] } {
  const taken = namesInUse(config);
  const known = groupsOf(config);
  const changes: Change[] = [];
  const names: string[] = [];
  for (const s of servers) {
    const name = uniqueName(String(s['name']), taken);
    taken.add(name);
    names.push(name);
    changes.push({ op: 'insert', path: ['proxies'], value: { ...s, name } });
  }
  for (const g of groups) {
    const group = known.find((k) => k.name === g);
    if (!group) throw new ChangeError(`no such group: ${g}`);
    for (const name of names) changes.push({ op: 'insert', path: ['proxy-groups', group.index, 'proxies'], value: name });
  }
  return { changes, names };
}

export type RemoveBlocker =
  | { kind: 'rule'; index: number }
  | { kind: 'dialer'; server: string }
  | { kind: 'last-member'; group: string };

/** What stops a server from being removed safely; empty if nothing does. */
export function removeBlockers(config: Config, name: string): RemoveBlocker[] {
  const out: RemoveBlocker[] = [];
  list(config['rules']).forEach((r, index) => {
    if (typeof r === 'string' && ruleTargetOf(r) === name) out.push({ kind: 'rule', index });
  });
  for (const p of list(config['proxies'])) {
    if (isObject(p) && p['dialer-proxy'] === name) out.push({ kind: 'dialer', server: nameOf(p) ?? '' });
  }
  for (const g of groupsOf(config)) {
    const raw = list(config['proxy-groups'])[g.index];
    // Groups that also take servers from providers (`use`) don't end up empty.
    const usesProviders = isObject(raw) && list(raw['use']).length > 0;
    if (!usesProviders && g.members.length === 1 && g.members[0] === name) out.push({ kind: 'last-member', group: g.name });
  }
  return out;
}

/** Changes that remove a server and take it out of every group. */
export function removeServerChanges(config: Config, name: string): Change[] {
  if (removeBlockers(config, name).length > 0) throw new ChangeError('server in use');
  const index = list(config['proxies']).findIndex((p) => nameOf(p) === name);
  if (index === -1) throw new ChangeError('no such server');
  const changes: Change[] = [];
  list(config['proxy-groups']).forEach((g, gi) => {
    if (!isObject(g)) return;
    // Highest first, so earlier positions stay valid while deleting.
    const positions = list(g['proxies']).flatMap((m, i) => (m === name ? [i] : [])).reverse();
    for (const i of positions) changes.push({ op: 'delete', path: ['proxy-groups', gi, 'proxies', i] });
  });
  changes.push({ op: 'delete', path: ['proxies', index] });
  return changes;
}

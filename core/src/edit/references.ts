/**
 * Renaming a server or group: its own name, plus every place that refers to
 * it by name, so the config keeps working (mihomo refuses a group that lists
 * a name that doesn't exist). Returns changes for the session; nothing is
 * edited here.
 */
import type { Path } from '../intake';
import { type Change, ChangeError } from './changes';

type Config = Record<string, unknown>;

/** Names mihomo has built in; a server or group can't take them. */
export const BUILT_IN_TARGETS: ReadonlySet<string> = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE']);

const isObject = (v: unknown): v is Config => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const nameOf = (v: unknown): string | undefined => (isObject(v) && typeof v['name'] === 'string' ? v['name'] : undefined);

/** Splits a rule on its top-level commas (logical rules nest theirs in brackets). */
export function splitRule(rule: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < rule.length; i++) {
    const c = rule[i];
    if (c === '(') depth++;
    else if (c === ')' && depth > 0) depth--;
    else if (c === ',' && depth === 0) {
      parts.push(rule.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(rule.slice(start));
  return parts;
}

/** Which field of a rule names where traffic goes: MATCH,target or TYPE,payload,target. */
function targetIndex(parts: string[]): number {
  return parts[0]?.trim().toUpperCase() === 'MATCH' ? 1 : 2;
}

/** Where a rule sends traffic: the group or server it names (trimmed). */
export function ruleTargetOf(rule: string): string | undefined {
  const parts = splitRule(rule);
  return parts[targetIndex(parts)]?.trim();
}

/** The rule with its target renamed, or null if it targets something else. */
export function renameRuleTarget(rule: string, from: string, to: string): string | null {
  const parts = splitRule(rule);
  const i = targetIndex(parts);
  const field = parts[i];
  if (field === undefined || field.trim() !== from) return null;
  // Keep any spaces the original had around the name.
  parts[i] = field.replace(from, () => to);
  return parts.join(',');
}

/** Every name in use: servers, groups and the built-in ones. */
export function namesInUse(config: Config): Set<string> {
  const names = new Set(BUILT_IN_TARGETS);
  for (const p of list(config['proxies'])) {
    const n = nameOf(p);
    if (n) names.add(n);
  }
  for (const g of list(config['proxy-groups'])) {
    const n = nameOf(g);
    if (n) names.add(n);
  }
  return names;
}

/**
 * The changes that rename the server or group called `from` to `to`
 * everywhere: its definition, group member lists, rules (and sub-rules),
 * dialer-proxy, listeners, tunnels, providers' download proxy, and DNS servers that
 * dial through it (`https://dns.example/dns-query#Name`).
 */
export function renameChanges(config: Config, from: string, to: string): Change[] {
  const name = to.trim();
  // Rules separate their parts with commas, so a name with one can't be a target.
  if (name === '' || name !== to || to.includes(',')) throw new ChangeError('bad name');
  if (BUILT_IN_TARGETS.has(from)) throw new ChangeError('built-in name');
  if (from === to) return [];
  if (namesInUse(config).has(to)) throw new ChangeError('name in use');

  const changes: Change[] = [];
  const set = (path: Path, value: string) => changes.push({ op: 'set', path, value });

  let defined = false;
  for (const section of ['proxies', 'proxy-groups'] as const) {
    list(config[section]).forEach((item, i) => {
      if (nameOf(item) === from) {
        set([section, i, 'name'], to);
        defined = true;
      }
      if (isObject(item) && item['dialer-proxy'] === from) set([section, i, 'dialer-proxy'], to);
    });
  }
  if (!defined) throw new ChangeError('no such name');

  list(config['proxy-groups']).forEach((g, gi) => {
    if (!isObject(g)) return;
    list(g['proxies']).forEach((member, mi) => {
      if (member === from) set(['proxy-groups', gi, 'proxies', mi], to);
    });
  });

  const renameRules = (rules: unknown, path: Path) =>
    list(rules).forEach((r, ri) => {
      if (typeof r !== 'string') return;
      const renamed = renameRuleTarget(r, from, to);
      if (renamed !== null) set([...path, ri], renamed);
    });
  renameRules(config['rules'], ['rules']);
  const subRules = config['sub-rules'];
  if (isObject(subRules)) for (const [key, rules] of Object.entries(subRules)) renameRules(rules, ['sub-rules', key]);

  list(config['listeners']).forEach((l, i) => {
    if (isObject(l) && l['proxy'] === from) set(['listeners', i, 'proxy'], to);
  });
  // Tunnels: "network,address,target,proxy", or a map with a proxy key.
  list(config['tunnels']).forEach((t, i) => {
    if (isObject(t)) {
      if (t['proxy'] === from) set(['tunnels', i, 'proxy'], to);
      return;
    }
    if (typeof t !== 'string') return;
    const parts = t.split(',');
    if (parts.length === 4 && parts[3]?.trim() === from) {
      parts[3] = (parts[3] ?? '').replace(from, () => to);
      set(['tunnels', i], parts.join(','));
    }
  });
  for (const section of ['proxy-providers', 'rule-providers'] as const) {
    const providers = config[section];
    if (!isObject(providers)) continue;
    for (const [key, p] of Object.entries(providers)) {
      if (isObject(p) && p['proxy'] === from) set([section, key, 'proxy'], to);
    }
  }

  const dns = config['dns'];
  if (isObject(dns)) {
    const suffix = `#${from}`;
    const renameServer = (v: unknown, path: Path) => {
      if (typeof v === 'string' && v.endsWith(suffix)) set(path, `${v.slice(0, -suffix.length)}#${to}`);
    };
    for (const key of ['nameserver', 'fallback', 'proxy-server-nameserver', 'direct-nameserver', 'default-nameserver'] as const) {
      list(dns[key]).forEach((v, i) => renameServer(v, ['dns', key, i]));
    }
    const policy = dns['nameserver-policy'];
    if (isObject(policy)) {
      for (const [pattern, servers] of Object.entries(policy)) {
        if (Array.isArray(servers)) servers.forEach((v, i) => renameServer(v, ['dns', 'nameserver-policy', pattern, i]));
        else renameServer(servers, ['dns', 'nameserver-policy', pattern]);
      }
    }
  }
  return changes;
}

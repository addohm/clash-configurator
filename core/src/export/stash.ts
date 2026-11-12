/**
 * The config as Stash reads it (PLAN.md Q6, Q7), from stash.wiki
 * (checked 2026-11-12): mihomo-style YAML, with a few differences.
 *
 * - Settings Stash doesn't have are left out: ports, LAN sharing, the
 *   remote control and dashboard, TUN, sniffing, geo data files, listeners
 *   and tunnels (Stash runs as an iPhone/Mac network extension and sets
 *   these itself).
 * - Its DNS takes default-nameserver, nameserver, fallback,
 *   nameserver-policy, fake-ip-filter, proxy-server-nameserver.
 * - Hysteria2's password is `auth`; VLESS and VMess name the server's
 *   certificate with `sni` (mihomo: `servername`).
 * - mihomo-only rule types (SUB-RULE, IN-*, UID, DSCP, ...) are left out.
 *
 * Everything else is written exactly as it was, like the mihomo output.
 */
import type { Document } from 'yaml';
import { applyChange, type Change } from '../edit/changes';
import { writeYaml } from '../edit/output';
import { readRule } from '../edit/rules';
import { LIMITS } from '../intake';

type Config = Record<string, unknown>;

export type Dropped =
  | { kind: 'setting'; key: string }
  | { kind: 'rule'; rule: string }
  | { kind: 'server'; name: string; reason: string }
  /** A group written differently: `nested` auto group made pick-by-hand, `filter` it couldn't carry. */
  | { kind: 'group'; name: string; reason: 'nested' | 'filter' };

/** Top-level settings only mihomo apps use. */
export const MIHOMO_ONLY = new Set([
  'port', 'socks-port', 'mixed-port', 'redir-port', 'tproxy-port',
  'allow-lan', 'bind-address', 'lan-allowed-ips', 'lan-disallowed-ips', 'authentication', 'skip-auth-prefixes',
  'external-controller', 'external-controller-tls', 'external-controller-unix', 'external-controller-pipe',
  'external-controller-cors', 'external-doh-server', 'secret', 'external-ui', 'external-ui-name', 'external-ui-url',
  'tun', 'sniffer', 'geodata-mode', 'geodata-loader', 'geosite-matcher', 'geo-auto-update', 'geo-update-interval', 'geox-url',
  'listeners', 'tunnels', 'ntp', 'experimental', 'iptables', 'ebpf', 'auto-redir', 'profile',
  'unified-delay', 'tcp-concurrent', 'find-process-mode', 'global-client-fingerprint', 'global-ua', 'etag-support',
  'keep-alive-interval', 'keep-alive-idle', 'disable-keep-alive', 'interface-name', 'routing-mark',
  'inbound-tfo', 'inbound-mptcp', 'sub-rules', 'clash-for-android', 'use-hosts', 'use-system-hosts',
]);

/** The DNS settings Stash reads. */
export const STASH_DNS = new Set(['default-nameserver', 'nameserver', 'fallback', 'fallback-filter', 'nameserver-policy', 'fake-ip-filter', 'proxy-server-nameserver', 'skip-cert-verify']);

/** Rule types mihomo has and Stash doesn't. */
const NOT_IN_STASH = new Set([
  'SUB-RULE', 'IN-TYPE', 'IN-PORT', 'IN-USER', 'IN-NAME', 'UID', 'DSCP', 'SRC-GEOIP', 'SRC-IP-ASN', 'SRC-IP-SUFFIX',
  'SRC-IP-CIDR', 'IP-SUFFIX', 'PROCESS-NAME-REGEX', 'PROCESS-PATH-REGEX', 'PROCESS-NAME-WILDCARD', 'PROCESS-PATH-WILDCARD',
]);

const isObject = (v: unknown): v is Config => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** The changes that make a mihomo config Stash's, and what they leave out. */
export function stashChanges(config: Config): { changes: Change[]; dropped: Dropped[] } {
  const changes: Change[] = [];
  const dropped: Dropped[] = [];
  for (const key of Object.keys(config)) {
    if (!MIHOMO_ONLY.has(key)) continue;
    changes.push({ op: 'delete', path: [key] });
    dropped.push({ kind: 'setting', key });
  }
  const dns = config['dns'];
  if (isObject(dns)) {
    for (const key of Object.keys(dns)) {
      if (STASH_DNS.has(key)) continue;
      changes.push({ op: 'delete', path: ['dns', key] });
      dropped.push({ kind: 'setting', key: `dns.${key}` });
    }
  }
  list(config['proxies']).forEach((p, i) => {
    if (!isObject(p)) return;
    if (p['type'] === 'hysteria2' && 'password' in p && !('auth' in p)) {
      changes.push({ op: 'set', path: ['proxies', i, 'auth'], value: p['password'] as string });
      changes.push({ op: 'delete', path: ['proxies', i, 'password'] });
    }
    if ((p['type'] === 'vless' || p['type'] === 'vmess') && 'servername' in p && !('sni' in p)) {
      changes.push({ op: 'set', path: ['proxies', i, 'sni'], value: p['servername'] as string });
      changes.push({ op: 'delete', path: ['proxies', i, 'servername'] });
    }
  });
  const rules = list(config['rules']);
  const gone = rules.flatMap((r, i) => (typeof r === 'string' && NOT_IN_STASH.has(readRule(r, i).type) ? [i] : []));
  // Deleted highest first, so the earlier positions stay put.
  for (const i of [...gone].reverse()) changes.push({ op: 'delete', path: ['rules', i] });
  for (const i of gone) dropped.push({ kind: 'rule', rule: String(rules[i]) });
  return { changes, dropped };
}

/** The edited config as a Stash file, laid out like the original. */
export function toStash(doc: Document, original: string): { text: string; dropped: Dropped[] } {
  const config = doc.toJS({ maxAliasCount: LIMITS.maxAliasCount }) as Config;
  const { changes, dropped } = stashChanges(config);
  const copy = doc.clone();
  for (const c of changes) applyChange(copy, c);
  return { text: writeYaml(copy, original), dropped };
}

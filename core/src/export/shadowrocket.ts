/**
 * The config as Shadowrocket reads it (PLAN.md Q6): two files, as on
 * addohm.net's Clash tab, whose device-tested notes this follows (and
 * Shadowrocket's manual, github.com/LOWERTOP/Shadowrocket):
 *
 * - a `.conf` with [General], [Proxy Group], [Rule] and [Host]: groups name
 *   servers, rules end in FINAL (mihomo's MATCH). Its `proxy-dns-server` is
 *   the DNS that resolves the servers' own names, as in the mihomo config;
 * - a server list: share links, base64, as a subscription is. Shadowrocket
 *   runs VLESS Reality only from share links, not from a .conf.
 *
 * What Shadowrocket can't do is left out and listed: rule types it lacks
 * (GEOSITE, DOMAIN-REGEX, PROCESS-*, SRC-*, SUB-RULE, ...), rule lists in
 * mihomo's own formats, and servers that can't be written as a share link.
 */
import { splitRule } from '../edit/references';
import { readRule } from '../edit/rules';
import type { Server } from '../links/parse';
import { writeLink } from '../links/write';
import type { Dropped } from './stash';

type Config = Record<string, unknown>;

const isObject = (v: unknown): v is Config => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** Rule types Shadowrocket runs (its manual), besides FINAL. */
const SHADOWROCKET_RULES = new Set([
  'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-WILDCARD', 'USER-AGENT', 'URL-REGEX', 'IP-CIDR', 'IP-CIDR6',
  'IP-ASN', 'GEOIP', 'DST-PORT', 'PROTOCOL', 'AND', 'OR', 'NOT', 'RULE-SET', 'DOMAIN-SET',
]);
const AUTO = new Set(['url-test', 'fallback', 'load-balance']);
/** mihomo's policies Shadowrocket has no use for in a group. */
const NOT_MEMBERS = new Set(['PASS', 'COMPATIBLE']);

/** One DNS server as Shadowrocket writes it, or '' if it has no form there. */
function dnsServer(v: unknown): string {
  const s = str(v).trim();
  // `#...` sends the lookup through a server or adds options: mihomo's own.
  if (s === '' || s.includes('#') || s.includes(',')) return '';
  if (/^(https|h3|quic|tls):\/\/\S+$/i.test(s)) return s;
  const plain = s.replace(/^udp:\/\//i, '');
  return /^[\d.]+$/.test(plain) || /^[0-9a-f:]+$/i.test(plain) ? plain : '';
}
const dnsServers = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).map(dnsServer).filter((s) => s !== '');

/** Does a mihomo per-site DNS pattern (+.x, *.x, x) cover this name? */
function covers(pattern: string, host: string): boolean {
  const p = pattern.trim().toLowerCase();
  const h = host.trim().toLowerCase();
  if (p.includes(':')) return false; // geosite:, rule-set: can't be judged here
  if (p.startsWith('+.')) return h === p.slice(2) || h.endsWith(p.slice(1));
  if (p.startsWith('*.')) return h.endsWith(p.slice(1)) && h.split('.').length === p.split('.').length;
  return h === p;
}

/** The per-site entry covering the most of these names: one entry's servers, never a mix. */
function bestEntry(policy: unknown, hosts: string[]): string[] {
  let best: string[] = [];
  let bestCount = 0;
  for (const [key, value] of Object.entries(isObject(policy) ? policy : {})) {
    const count = hosts.filter((h) => key.split(',').some((p) => covers(p, h))).length;
    const servers = dnsServers(value);
    if (count > bestCount && servers.length > 0) {
      best = servers;
      bestCount = count;
    }
  }
  return best;
}

/**
 * The DNS for the servers' own names, as mihomo picks it: the
 * proxy-server-nameserver-policy entry, then proxy-server-nameserver, then
 * the per-site DNS entry that covers the most of them. Shadowrocket has one
 * list for every server name and races it (first answer wins), so a public
 * resolver from another entry must not join the provider's own DNS there.
 */
export function proxyDns(config: Config): string[] {
  const dns = isObject(config['dns']) ? config['dns'] : {};
  const hosts = list(config['proxies'])
    .filter(isObject)
    .map((p) => str(p['server']))
    .filter((h) => h !== '' && !/^[\d.]+$/.test(h) && !h.includes(':'));
  if (hosts.length === 0) return [];
  const fromPolicy = bestEntry(dns['proxy-server-nameserver-policy'], hosts);
  if (fromPolicy.length > 0) return fromPolicy;
  const forServers = dnsServers(dns['proxy-server-nameserver'] ?? []);
  return forServers.length > 0 ? forServers : bestEntry(dns['nameserver-policy'], hosts);
}

/** mihomo's NETWORK rule is Shadowrocket's PROTOCOL. */
const network = (r: string) => r.replace(/(^|\(\s*)NETWORK\s*,\s*(\w+)/gi, (_m, pre: string, p: string) => `${pre}PROTOCOL,${p.toUpperCase()}`);

/** One mihomo rule as Shadowrocket's, or null if it has no equivalent. */
function rule(r: string, providers: Config): string | null {
  const v = readRule(network(r), 0);
  if (v.target === 'PASS') return null;
  const target = v.target === 'REJECT-DROP' ? 'REJECT' : v.target;
  if (v.type === 'MATCH') return `FINAL,${target}`;
  if (v.type === 'RULE-SET') {
    const p = providers[v.payload];
    if (!isObject(p) || str(p['type']) !== 'http' || !/^https?:\/\/[^,\s]+$/.test(str(p['url']))) return null;
    // Shadowrocket reads plain-text lists; mihomo's YAML and binary ones it can't.
    if (str(p['format']) !== 'text') return null;
    const kind = str(p['behavior']) === 'domain' ? 'DOMAIN-SET' : 'RULE-SET';
    return [kind, str(p['url']), target, ...v.options].join(',');
  }
  if (!SHADOWROCKET_RULES.has(v.type)) return null;
  if (['AND', 'OR', 'NOT'].includes(v.type)) {
    const inner = [...v.payload.matchAll(/\(\s*([A-Za-z0-9-]+)\s*,/g)].map((m) => (m[1] ?? '').toUpperCase());
    if (inner.some((t) => !SHADOWROCKET_RULES.has(t))) return null;
  }
  return [v.type, v.payload, target, ...v.options].join(',');
}

function group(g: Config, groupNames: Set<string>, dropped: Dropped[]): string[] {
  const name = str(g['name']);
  const members = list(g['proxies'])
    .map(str)
    .filter((m) => m !== '' && !m.includes(',') && !NOT_MEMBERS.has(m))
    .map((m) => (m === 'REJECT-DROP' ? 'REJECT' : m));
  const params: string[] = [];
  // Servers from a provider or "every server": Shadowrocket picks them from
  // the server list by name, with the same pattern.
  if (list(g['use']).length > 0 || g['include-all'] === true || g['include-all-proxies'] === true) {
    const filter = str(g['filter']) || '.*';
    if (filter.includes(',')) dropped.push({ kind: 'group', name, reason: 'filter' });
    else params.push(`policy-regex-filter=${filter}`);
  }
  const type = str(g['type']) || 'select';
  const nested = members.some((m) => groupNames.has(m));
  const fill = members.length > 0 || params.length > 0 ? members : ['DIRECT'];
  if (AUTO.has(type) && !nested) {
    const url = str(g['url']);
    if (url && !url.includes(',')) params.push(`url=${url}`);
    for (const key of ['interval', 'tolerance'] as const) {
      const n = Number(g[key]);
      if (g[key] !== undefined && Number.isInteger(n) && n >= 0) params.push(`${key}=${n}`);
    }
    // Seconds in Shadowrocket, milliseconds in mihomo.
    const ms = Number(g['timeout']);
    if (Number.isFinite(ms) && ms > 0) params.push(`timeout=${Math.max(1, Math.ceil(ms / 1000))}`);
    return [[`${name} = ${type}`, ...fill, ...params].join(', ')];
  }
  // Shadowrocket's manual warns against groups inside auto-test groups.
  if (AUTO.has(type)) dropped.push({ kind: 'group', name, reason: 'nested' });
  return [[`${name} = select`, ...fill, ...params].join(', ')];
}

export interface ShadowrocketFiles {
  conf: string;
  /** The server list: share links, one per line, base64 as a subscription is. */
  nodes: string;
  /** The same links, readable. */
  links: string[];
  dropped: Dropped[];
}

export function toShadowrocket(config: Config): ShadowrocketFiles {
  const dropped: Dropped[] = [];
  const dns = isObject(config['dns']) ? config['dns'] : {};

  const general = ['bypass-system = true', 'skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, localhost, *.local'];
  const main = dnsServers(dns['nameserver'] ?? []);
  general.push(`dns-server = ${main.length > 0 ? main.join(', ') : 'system'}`);
  const fallback = dnsServers(dns['fallback'] ?? []);
  if (fallback.length > 0) general.push(`fallback-dns-server = ${fallback.join(', ')}`);
  const forServers = proxyDns(config);
  if (forServers.length > 0) general.push(`proxy-dns-server = ${forServers.join(', ')}`);
  general.push(`ipv6 = ${config['ipv6'] === true ? 'true' : 'false'}`);

  const groups = list(config['proxy-groups']).filter(isObject);
  const groupNames = new Set(groups.map((g) => str(g['name'])));
  const groupLines = groups.flatMap((g) => group(g, groupNames, dropped));

  const providers = isObject(config['rule-providers']) ? config['rule-providers'] : {};
  const ruleLines: string[] = [];
  for (const r of list(config['rules'])) {
    if (typeof r !== 'string') continue;
    const out = rule(r, providers);
    if (out === null) dropped.push({ kind: 'rule', rule: r });
    else ruleLines.push(out);
  }

  const hosts = isObject(config['hosts']) ? config['hosts'] : {};
  const hostLines = Object.entries(hosts).flatMap(([domain, ip]) => {
    const value = Array.isArray(ip) ? str(ip[0]) : str(ip);
    return value && !/[=\s]/.test(domain) ? [`${domain} = ${value}`] : [];
  });

  const links: string[] = [];
  for (const p of list(config['proxies']).filter(isObject)) {
    const w = writeLink(p as Server);
    if (w.ok) links.push(w.link);
    else dropped.push({ kind: 'server', name: str(p['name']), reason: w.detail });
  }
  // A provider's servers come from adding its subscription in Shadowrocket.
  if (isObject(config['proxy-providers'])) dropped.push({ kind: 'setting', key: 'proxy-providers' });

  const conf = [
    '# Made by Clash Configurator for Shadowrocket. Its groups name the servers',
    '# in the server list made with it.',
    '[General]',
    ...general,
    '',
    '[Proxy Group]',
    ...groupLines,
    '',
    '[Rule]',
    ...ruleLines,
    ...(hostLines.length > 0 ? ['', '[Host]', ...hostLines] : []),
    '',
  ].join('\n');
  return { conf, nodes: base64(links.join('\n')), links, dropped };
}

/** UTF-8 text as base64, in pieces: spreading a long list into one call overflows the stack. */
function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

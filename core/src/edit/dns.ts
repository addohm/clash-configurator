/**
 * DNS: how names are looked up. Checks for the values the DNS card takes
 * (servers, fake-IP exceptions, per-site DNS patterns) and the changes for
 * the lists and the per-site map. No defaults are filled in: the card edits
 * what the config has (PLAN.md Q10).
 */
import type { Path } from '../intake';
import { type Change, ChangeError } from './changes';
import { namesInUse } from './references';

type Config = Record<string, unknown>;

/** The DNS server lists the card shows, in the order it shows them. */
export const DNS_LISTS = ['nameserver', 'proxy-server-nameserver', 'default-nameserver', 'fallback', 'direct-nameserver'] as const;
export type DnsList = (typeof DNS_LISTS)[number];

const isObject = (v: unknown): v is Config => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const BAD = /[\s,\u0000-\u001F\u007F]/;

export function dnsOf(config: Config): Config {
  return isObject(config['dns']) ? config['dns'] : {};
}

const IPV4 = /^(\d{1,3})(\.\d{1,3}){3}$/;
const okIpv4 = (h: string) => IPV4.test(h) && h.split('.').every((o) => Number(o) <= 255);

/**
 * Checks a DNS server: a plain IP (with an optional port), a URL
 * (https://, tls://, quic://, udp://, tcp://, dhcp://), or "system". A
 * `#Name` after it sends lookups through that group or server, which must
 * exist. Returns the value tidied; throws ChangeError.
 */
export function checkDnsServer(raw: string, config: Config): string {
  const v = raw.trim();
  if (v === '' || v.length > 512 || /[,\u0000-\u001F\u007F]/.test(v)) throw new ChangeError('bad value');
  if (v === 'system' || v === 'system://') return v;
  const hash = v.indexOf('#');
  const main = hash === -1 ? v : v.slice(0, hash);
  const extra = hash === -1 ? undefined : v.slice(hash + 1);
  // Group names can have spaces and emoji (mihomo reads them after the #); the address can't.
  if (/\s/.test(main)) throw new ChangeError('bad value');
  if (extra !== undefined) {
    const via = extra.split('&')[0] ?? '';
    if (via !== '' && !via.includes('=') && !namesInUse(config).has(decodeURIComponent(via))) throw new ChangeError('no such target');
  }
  const m = /^(https|tls|quic|udp|tcp|dhcp|h3):\/\/(.+)$/i.exec(main);
  if (m) {
    if ((m[1] ?? '').toLowerCase() === 'dhcp') return v;
    try {
      const url = new URL(`https://${m[2] ?? ''}`);
      if (url.hostname === '') throw new Error();
    } catch {
      throw new ChangeError('bad value');
    }
    return v;
  }
  // A plain address: 1.2.3.4, 1.2.3.4:53, [2001:db8::1]:53 or 2001:db8::1.
  const v4 = /^([\d.]+)(:(\d{1,5}))?$/.exec(main);
  if (v4 && okIpv4(v4[1] ?? '') && (v4[3] === undefined || Number(v4[3]) <= 65535)) return v;
  if (/^\[[0-9a-f:]+\](:\d{1,5})?$/i.test(main) || /^[0-9a-f]*:[0-9a-f:]+$/i.test(main)) return v;
  throw new ChangeError('bad value');
}

/** Only plain addresses: default-nameserver looks up the other DNS servers' own names. */
export function checkPlainDnsServer(raw: string, config: Config): string {
  const v = checkDnsServer(raw, config);
  if (/^(https|tls|quic|h3):\/\//i.test(v) && !okIpv4(new URL(`https://${v.split('://')[1] ?? ''}`).hostname)) {
    throw new ChangeError('needs an address');
  }
  return v;
}

/**
 * A fake-IP exception or per-site pattern: a site with wildcards (*.lan,
 * +.example.com, example.com), or geosite:name, rule-set:name.
 */
export function checkDomainPattern(raw: string): string {
  const v = raw.trim();
  if (v === '' || v.length > 253 || BAD.test(v)) throw new ChangeError('bad value');
  if (/^(geosite|rule-set):[a-z0-9!@_-]+$/i.test(v)) return v.toLowerCase();
  if (!/^[a-z0-9*+?._-]+$/i.test(v) || /\.\./.test(v)) throw new ChangeError('bad value');
  return v.toLowerCase();
}

/** Per-site DNS keys may list several patterns, separated by commas. */
export function checkPolicyPattern(raw: string): string {
  const parts = raw.split(',').map((p) => checkDomainPattern(p));
  return parts.join(',');
}

function dnsListPath(name: DnsList | 'fake-ip-filter'): Path {
  return ['dns', name];
}

export function addToDnsList(config: Config, name: DnsList | 'fake-ip-filter', raw: string): Change[] {
  const value =
    name === 'fake-ip-filter'
      ? checkDomainPattern(raw)
      : name === 'default-nameserver'
        ? checkPlainDnsServer(raw, config)
        : checkDnsServer(raw, config);
  if (list(dnsOf(config)[name]).includes(value)) throw new ChangeError('already a member');
  return [{ op: 'insert', path: dnsListPath(name), value }];
}

export function removeFromDnsList(config: Config, name: DnsList | 'fake-ip-filter', index: number): Change[] {
  if (index >= list(dnsOf(config)[name]).length) throw new ChangeError('no such member');
  return [{ op: 'delete', path: [...dnsListPath(name), index] }];
}

export function moveInDnsList(config: Config, name: DnsList, from: number, to: number): Change[] {
  const n = list(dnsOf(config)[name]).length;
  if (from >= n || to >= n || to < 0) throw new ChangeError('index past the end');
  return from === to ? [] : [{ op: 'move', path: dnsListPath(name), from, to }];
}

export interface PolicyView {
  pattern: string;
  servers: string[];
}

export function policiesOf(config: Config): PolicyView[] {
  const p = dnsOf(config)['nameserver-policy'];
  if (!isObject(p)) return [];
  return Object.entries(p).map(([pattern, s]) => ({
    pattern,
    servers: Array.isArray(s) ? s.filter((x): x is string => typeof x === 'string') : typeof s === 'string' ? [s] : [],
  }));
}

/** Sets which DNS servers a pattern uses (adding the pattern if it's new). */
export function setPolicyChanges(config: Config, rawPattern: string, rawServers: readonly string[]): Change[] {
  const pattern = checkPolicyPattern(rawPattern);
  const servers = rawServers.map((s) => checkDnsServer(s, config));
  if (servers.length === 0) throw new ChangeError('last member');
  return [{ op: 'set', path: ['dns', 'nameserver-policy', pattern], value: servers.length === 1 ? (servers[0] ?? '') : servers }];
}

export function removePolicyChanges(config: Config, pattern: string): Change[] {
  const p = dnsOf(config)['nameserver-policy'];
  if (!isObject(p) || !(pattern in p)) throw new ChangeError('no such member');
  return [{ op: 'delete', path: ['dns', 'nameserver-policy', pattern] }];
}

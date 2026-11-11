/**
 * Share links (vless://, trojan://, ss://, hysteria2://, vmess://) turned
 * into mihomo server entries. A link is untrusted input like a config
 * (PLAN.md Q4): every field is checked, unknown options are refused rather
 * than guessed, and the result is plain data, written out by the YAML
 * library like any other change.
 */
import type { Value } from '../edit/changes';

export type Server = { [key: string]: Value };

export const LINK_ERRORS = [
  'not-a-link',
  'unsupported-type',
  'bad-address',
  'bad-port',
  'bad-id',
  'missing-password',
  'unsupported-option',
] as const;

export type LinkErrorCode = (typeof LINK_ERRORS)[number];

export class LinkError extends Error {
  constructor(
    readonly code: LinkErrorCode,
    readonly detail = '',
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

const CONTROL = /[\u0000-\u001F\u007F]/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)$/i;
const NETWORKS = new Set(['tcp', 'ws', 'grpc', 'h2', 'http', 'httpupgrade', 'xhttp']);
const MAX_LINK = 8192;

function text(v: string, what: string): string {
  if (CONTROL.test(v)) throw new LinkError('unsupported-option', what);
  return v;
}

function decode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    throw new LinkError('not-a-link');
  }
}

function base64(v: string): string {
  const clean = v.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  try {
    const bin = atob(clean + '='.repeat((4 - (clean.length % 4)) % 4));
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    throw new LinkError('not-a-link');
  }
}

/** A bare IPv6 address (some apps write them without brackets). */
const BARE_V6 = /^[0-9a-f]{0,4}(:[0-9a-f]{0,4}){2,7}$/i;

function host(v: string): string {
  const h = v.trim();
  if (BARE_V6.test(h)) return h.toLowerCase();
  if (h === '' || !HOST.test(h)) throw new LinkError('bad-address', h);
  return h.startsWith('[') ? h.slice(1, -1) : h;
}

function port(v: string | number): number {
  const n = typeof v === 'number' ? v : /^\d{1,5}$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new LinkError('bad-port', String(v));
  return n;
}

/** Splits "user@host:port" from a URL-like link (`new URL` mangles unknown schemes). */
function authority(rest: string): { user: string; host: string; port: number; query: URLSearchParams; name: string } {
  const hashAt = rest.indexOf('#');
  const name = hashAt === -1 ? '' : decode(rest.slice(hashAt + 1));
  const beforeHash = hashAt === -1 ? rest : rest.slice(0, hashAt);
  const qAt = beforeHash.indexOf('?');
  const query = new URLSearchParams(qAt === -1 ? '' : beforeHash.slice(qAt + 1));
  let main = qAt === -1 ? beforeHash : beforeHash.slice(0, qAt);
  if (main.endsWith('/')) main = main.slice(0, -1);
  const at = main.lastIndexOf('@');
  if (at === -1) throw new LinkError('not-a-link');
  const user = decode(main.slice(0, at));
  const hostPort = main.slice(at + 1);
  const colon = hostPort.lastIndexOf(':');
  if (colon === -1 || (hostPort.startsWith('[') && !hostPort.slice(0, colon).endsWith(']'))) {
    throw new LinkError('bad-port', '');
  }
  return { user, host: host(hostPort.slice(0, colon)), port: port(hostPort.slice(colon + 1)), query, name };
}

/** The transport options (ws, grpc, ...) shared by vless, trojan and vmess links. */
function transport(server: Server, network: string, q: { path?: string; host?: string; service?: string }): void {
  if (!NETWORKS.has(network)) throw new LinkError('unsupported-option', `type=${network}`);
  if (network === 'tcp') return;
  server['network'] = network === 'http' ? 'h2' : network;
  if (network === 'ws' || network === 'httpupgrade') {
    const opts: { [key: string]: Value } = {};
    if (q.path) opts['path'] = text(q.path, 'path');
    if (q.host) opts['headers'] = { Host: text(q.host, 'host') };
    if (network === 'httpupgrade') opts['v2ray-http-upgrade'] = true;
    server['network'] = 'ws';
    server['ws-opts'] = opts;
  } else if (network === 'grpc') {
    server['grpc-opts'] = { 'grpc-service-name': text(q.service ?? '', 'serviceName') };
  } else if (network === 'h2' || network === 'http') {
    const opts: { [key: string]: Value } = {};
    if (q.path) opts['path'] = text(q.path, 'path');
    if (q.host) opts['host'] = [text(q.host, 'host')];
    server['h2-opts'] = opts;
  } else if (network === 'xhttp') {
    const opts: { [key: string]: Value } = {};
    if (q.path) opts['path'] = text(q.path, 'path');
    if (q.host) opts['host'] = text(q.host, 'host');
    server['xhttp-opts'] = opts;
  }
}

const isTrue = (v: string | null) => v === '1' || v === 'true';

function vless(rest: string): Server {
  const a = authority(rest);
  if (!UUID.test(a.user)) throw new LinkError('bad-id');
  const q = a.query;
  const enc = q.get('encryption');
  if (enc && enc !== 'none') throw new LinkError('unsupported-option', `encryption=${enc}`);
  const s: Server = { name: a.name, type: 'vless', server: a.host, port: a.port, uuid: a.user.toLowerCase(), udp: true };
  const security = q.get('security') ?? 'none';
  if (security === 'tls' || security === 'reality') {
    s['tls'] = true;
    const sni = q.get('sni');
    if (sni) s['servername'] = text(sni, 'sni');
    const fp = q.get('fp');
    if (fp) s['client-fingerprint'] = text(fp, 'fp');
    const alpn = q.get('alpn');
    if (alpn) s['alpn'] = alpn.split(',').map((x) => text(x, 'alpn'));
    if (isTrue(q.get('allowInsecure')) || isTrue(q.get('insecure'))) s['skip-cert-verify'] = true;
  } else if (security !== 'none') {
    throw new LinkError('unsupported-option', `security=${security}`);
  }
  if (security === 'reality') {
    const pbk = q.get('pbk');
    if (!pbk) throw new LinkError('unsupported-option', 'reality without pbk');
    const opts: { [key: string]: Value } = { 'public-key': text(pbk, 'pbk') };
    const sid = q.get('sid');
    if (sid) opts['short-id'] = text(sid, 'sid');
    s['reality-opts'] = opts;
  }
  const flow = q.get('flow');
  if (flow) s['flow'] = text(flow, 'flow');
  const opts: { path?: string; host?: string; service?: string } = {};
  const path = q.get('path');
  const h = q.get('host');
  const service = q.get('serviceName');
  if (path) opts.path = path;
  if (h) opts.host = h;
  if (service) opts.service = service;
  transport(s, q.get('type') ?? 'tcp', opts);
  return s;
}

function trojan(rest: string): Server {
  const a = authority(rest);
  if (a.user === '') throw new LinkError('missing-password');
  const q = a.query;
  const s: Server = { name: a.name, type: 'trojan', server: a.host, port: a.port, password: text(a.user, 'password'), udp: true };
  const sni = q.get('sni') ?? q.get('peer');
  if (sni) s['sni'] = text(sni, 'sni');
  const fp = q.get('fp');
  if (fp) s['client-fingerprint'] = text(fp, 'fp');
  const alpn = q.get('alpn');
  if (alpn) s['alpn'] = alpn.split(',').map((x) => text(x, 'alpn'));
  if (isTrue(q.get('allowInsecure')) || isTrue(q.get('insecure'))) s['skip-cert-verify'] = true;
  const security = q.get('security');
  if (security && security !== 'tls') throw new LinkError('unsupported-option', `security=${security}`);
  const opts: { path?: string; host?: string; service?: string } = {};
  const path = q.get('path');
  const h = q.get('host');
  const service = q.get('serviceName');
  if (path) opts.path = path;
  if (h) opts.host = h;
  if (service) opts.service = service;
  transport(s, q.get('type') ?? 'tcp', opts);
  return s;
}

const SS_CIPHERS = new Set([
  'aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm', 'chacha20-ietf-poly1305', 'xchacha20-ietf-poly1305',
  '2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm', '2022-blake3-chacha20-poly1305',
  'aes-128-cfb', 'aes-192-cfb', 'aes-256-cfb', 'aes-128-ctr', 'aes-192-ctr', 'aes-256-ctr',
  'rc4-md5', 'chacha20-ietf', 'xchacha20', 'none',
]);

function ss(rest: string): Server {
  const hashAt = rest.indexOf('#');
  const name = hashAt === -1 ? '' : decode(rest.slice(hashAt + 1));
  let body = hashAt === -1 ? rest : rest.slice(0, hashAt);
  const qAt = body.indexOf('?');
  if (qAt !== -1) {
    const q = new URLSearchParams(body.slice(qAt + 1));
    if (q.has('plugin')) throw new LinkError('unsupported-option', 'plugin');
    body = body.slice(0, qAt);
  }
  if (body.endsWith('/')) body = body.slice(0, -1);
  // SIP002 is base64(method:password)@host:port; the old form is base64 of all of it.
  if (!body.includes('@')) body = base64(body);
  const at = body.lastIndexOf('@');
  if (at === -1) throw new LinkError('not-a-link');
  let user = body.slice(0, at);
  user = user.includes(':') ? decode(user) : base64(decode(user));
  const colon = user.indexOf(':');
  if (colon === -1) throw new LinkError('missing-password');
  const cipher = user.slice(0, colon).toLowerCase();
  const password = user.slice(colon + 1);
  if (!SS_CIPHERS.has(cipher)) throw new LinkError('unsupported-option', `cipher=${cipher}`);
  if (password === '') throw new LinkError('missing-password');
  const hp = body.slice(at + 1);
  const pc = hp.lastIndexOf(':');
  if (pc === -1) throw new LinkError('bad-port', '');
  return {
    name,
    type: 'ss',
    server: host(hp.slice(0, pc)),
    port: port(hp.slice(pc + 1)),
    cipher,
    password: text(password, 'password'),
    udp: true,
  };
}

function hysteria2(rest: string): Server {
  // Port hopping can sit in the port itself (host:443,20000-30000); the first
  // number is the port, the whole range goes to `ports`.
  let hopping: string | null = null;
  const hp = /@[^#?/]+:([\d,-]+)(?=[/?#]|$)/.exec(rest);
  let link = rest;
  if (hp && /[,-]/.test(hp[1] ?? '')) {
    hopping = hp[1] ?? '';
    const at = hp.index + hp[0].length - hopping.length;
    link = rest.slice(0, at) + (hopping.split(/[,-]/)[0] ?? '') + rest.slice(at + hopping.length);
  }
  const a = authority(link);
  if (a.user === '') throw new LinkError('missing-password');
  const q = a.query;
  const s: Server = { name: a.name, type: 'hysteria2', server: a.host, port: a.port, password: text(a.user, 'password') };
  const sni = q.get('sni') ?? q.get('peer');
  if (sni) s['sni'] = text(sni, 'sni');
  if (isTrue(q.get('insecure')) || isTrue(q.get('allowInsecure'))) s['skip-cert-verify'] = true;
  const obfs = q.get('obfs');
  if (obfs) {
    if (obfs !== 'salamander') throw new LinkError('unsupported-option', `obfs=${obfs}`);
    s['obfs'] = 'salamander';
    s['obfs-password'] = text(q.get('obfs-password') ?? '', 'obfs-password');
  }
  const ports = q.get('mport') ?? hopping;
  if (ports) {
    if (!/^\d+([,-]\d+)*$/.test(ports)) throw new LinkError('bad-port', ports);
    s['ports'] = ports;
  }
  const pin = q.get('pinSHA256');
  if (pin) s['fingerprint'] = text(pin, 'pinSHA256');
  return s;
}

function vmess(rest: string): Server {
  const hashAt = rest.indexOf('#');
  const body = hashAt === -1 ? rest : rest.slice(0, hashAt);
  let j: unknown;
  try {
    j = JSON.parse(base64(body));
  } catch (e) {
    if (e instanceof LinkError) throw e;
    throw new LinkError('not-a-link');
  }
  if (j === null || typeof j !== 'object' || Array.isArray(j)) throw new LinkError('not-a-link');
  const f = j as Record<string, unknown>;
  const str = (k: string) => (typeof f[k] === 'string' ? (f[k] as string) : typeof f[k] === 'number' ? String(f[k]) : '');
  const id = str('id');
  if (!UUID.test(id)) throw new LinkError('bad-id');
  const name = str('ps') || (hashAt === -1 ? '' : decode(rest.slice(hashAt + 1)));
  const s: Server = {
    name: text(name, 'name'),
    type: 'vmess',
    server: host(str('add')),
    port: port(str('port')),
    uuid: id.toLowerCase(),
    alterId: Number(str('aid') || '0') || 0,
    cipher: text(str('scy') || 'auto', 'scy'),
    udp: true,
  };
  if (str('tls') === 'tls') {
    s['tls'] = true;
    const sni = str('sni');
    if (sni) s['servername'] = text(sni, 'sni');
    const fp = str('fp');
    if (fp) s['client-fingerprint'] = text(fp, 'fp');
  }
  const network = str('net') || 'tcp';
  const opts: { path?: string; host?: string; service?: string } = {};
  if (str('path')) opts.path = network === 'grpc' ? '' : str('path');
  if (str('host')) opts.host = str('host');
  if (network === 'grpc') opts.service = str('path');
  transport(s, network, opts);
  return s;
}

/** Parses one share link into a mihomo server entry. Throws LinkError. */
export function parseLink(link: string): Server {
  const l = link.trim();
  if (l.length > MAX_LINK || CONTROL.test(l)) throw new LinkError('not-a-link');
  const m = /^([a-z0-9]+):\/\/(.+)$/i.exec(l);
  if (!m) throw new LinkError('not-a-link');
  const scheme = (m[1] ?? '').toLowerCase();
  const rest = m[2] ?? '';
  let s: Server;
  switch (scheme) {
    case 'vless':
      s = vless(rest);
      break;
    case 'trojan':
      s = trojan(rest);
      break;
    case 'ss':
      s = ss(rest);
      break;
    case 'hysteria2':
    case 'hy2':
      s = hysteria2(rest);
      break;
    case 'vmess':
      s = vmess(rest);
      break;
    default:
      throw new LinkError('unsupported-type', scheme);
  }
  // Rules separate fields with commas, so names can't hold one.
  const name = String(s['name'] ?? '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  s['name'] = text(name || `${String(s['server'])}:${String(s['port'])}`, 'name');
  return s;
}

export interface ParsedLinks {
  servers: Server[];
  errors: { line: number; code: LinkErrorCode; detail: string }[];
}

/** Parses one link per line (blank lines skipped), or a base64 block of them. */
export function parseLinks(input: string): ParsedLinks {
  let text = input.trim();
  if (text !== '' && !text.includes('://')) {
    try {
      text = base64(text);
    } catch {
      // not base64: parse as is, and each line reports its own error
    }
  }
  const out: ParsedLinks = { servers: [], errors: [] };
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === '') return;
    try {
      out.servers.push(parseLink(line));
    } catch (e) {
      if (!(e instanceof LinkError)) throw e;
      out.errors.push({ line: i + 1, code: e.code, detail: e.detail });
    }
  });
  return out;
}

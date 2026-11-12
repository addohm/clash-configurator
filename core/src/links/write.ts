/**
 * mihomo server entries back into share links (vless://, trojan://, ss://,
 * hysteria2://, vmess://), for Shadowrocket's server list (PLAN.md Q6: its
 * VLESS Reality only works from share links, not a .conf). The reverse of
 * parse.ts: a link written here reads back to the same server.
 */
import type { Server } from './parse';

export type WriteResult = { ok: true; link: string } | { ok: false; reason: 'unsupported-type' | 'unsupported-option'; detail: string };

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** host:port, with brackets for IPv6. */
function hostPort(s: Server): string {
  const host = str(s['server']);
  return `${host.includes(':') ? `[${host}]` : host}:${str(s['port'])}`;
}

const name = (s: Server) => `#${encodeURIComponent(str(s['name']))}`;

/** The query for the transport (ws, grpc, h2, xhttp), shared by vless, trojan and vmess-style links. */
function transport(s: Server, q: URLSearchParams): string | null {
  const network = str(s['network']) || 'tcp';
  q.set('type', network === 'h2' ? 'http' : network);
  if (network === 'ws') {
    const o = isObject(s['ws-opts']) ? s['ws-opts'] : {};
    if (o['v2ray-http-upgrade'] === true) q.set('type', 'httpupgrade');
    if (str(o['path'])) q.set('path', str(o['path']));
    const headers = isObject(o['headers']) ? o['headers'] : {};
    if (str(headers['Host'])) q.set('host', str(headers['Host']));
  } else if (network === 'grpc') {
    const o = isObject(s['grpc-opts']) ? s['grpc-opts'] : {};
    if (str(o['grpc-service-name'])) q.set('serviceName', str(o['grpc-service-name']));
  } else if (network === 'h2') {
    const o = isObject(s['h2-opts']) ? s['h2-opts'] : {};
    if (str(o['path'])) q.set('path', str(o['path']));
    const hosts = Array.isArray(o['host']) ? o['host'] : [];
    if (typeof hosts[0] === 'string') q.set('host', hosts[0]);
  } else if (network === 'xhttp') {
    const o = isObject(s['xhttp-opts']) ? s['xhttp-opts'] : {};
    if (str(o['path'])) q.set('path', str(o['path']));
    if (str(o['host'])) q.set('host', str(o['host']));
  } else if (network !== 'tcp') {
    return network;
  }
  return null;
}

function tls(s: Server, q: URLSearchParams, sniKey: 'sni' | 'servername'): void {
  const sni = str(s[sniKey]) || str(s['sni']) || str(s['servername']);
  if (sni) q.set('sni', sni);
  if (str(s['client-fingerprint'])) q.set('fp', str(s['client-fingerprint']));
  const alpn = Array.isArray(s['alpn']) ? s['alpn'].filter((a): a is string => typeof a === 'string') : [];
  if (alpn.length > 0) q.set('alpn', alpn.join(','));
  if (s['skip-cert-verify'] === true) q.set('allowInsecure', '1');
}

function vless(s: Server): WriteResult {
  const q = new URLSearchParams({ encryption: 'none' });
  const reality = isObject(s['reality-opts']) ? s['reality-opts'] : null;
  if (reality) {
    q.set('security', 'reality');
    q.set('pbk', str(reality['public-key']));
    if (str(reality['short-id'])) q.set('sid', str(reality['short-id']));
  } else if (s['tls'] === true) q.set('security', 'tls');
  if (s['tls'] === true || reality) tls(s, q, 'servername');
  if (str(s['flow'])) q.set('flow', str(s['flow']));
  const bad = transport(s, q);
  if (bad) return { ok: false, reason: 'unsupported-option', detail: `network ${bad}` };
  return { ok: true, link: `vless://${encodeURIComponent(str(s['uuid']))}@${hostPort(s)}?${q}${name(s)}` };
}

function trojan(s: Server): WriteResult {
  const q = new URLSearchParams({ security: 'tls' });
  tls(s, q, 'sni');
  const bad = transport(s, q);
  if (bad) return { ok: false, reason: 'unsupported-option', detail: `network ${bad}` };
  return { ok: true, link: `trojan://${encodeURIComponent(str(s['password']))}@${hostPort(s)}?${q}${name(s)}` };
}

function ss(s: Server): WriteResult {
  if (s['plugin']) return { ok: false, reason: 'unsupported-option', detail: 'plugin' };
  const user = btoa(`${str(s['cipher'])}:${str(s['password'])}`).replace(/=+$/, '');
  return { ok: true, link: `ss://${user}@${hostPort(s)}${name(s)}` };
}

function hysteria2(s: Server): WriteResult {
  const q = new URLSearchParams();
  if (str(s['sni'])) q.set('sni', str(s['sni']));
  if (s['skip-cert-verify'] === true) q.set('insecure', '1');
  if (str(s['obfs'])) {
    q.set('obfs', str(s['obfs']));
    if (str(s['obfs-password'])) q.set('obfs-password', str(s['obfs-password']));
  }
  if (str(s['ports'])) q.set('mport', str(s['ports']));
  if (str(s['fingerprint'])) q.set('pinSHA256', str(s['fingerprint']));
  const password = str(s['password']) || str(s['auth']);
  const query = q.toString();
  return { ok: true, link: `hysteria2://${encodeURIComponent(password)}@${hostPort(s)}${query ? `/?${query}` : ''}${name(s)}` };
}

function vmess(s: Server): WriteResult {
  const network = str(s['network']) || 'tcp';
  const ws = isObject(s['ws-opts']) ? s['ws-opts'] : {};
  const headers = isObject(ws['headers']) ? ws['headers'] : {};
  const grpc = isObject(s['grpc-opts']) ? s['grpc-opts'] : {};
  if (!['tcp', 'ws', 'grpc'].includes(network)) return { ok: false, reason: 'unsupported-option', detail: `network ${network}` };
  const j: Record<string, string> = {
    v: '2',
    ps: str(s['name']),
    add: str(s['server']),
    port: str(s['port']),
    id: str(s['uuid']),
    aid: str(s['alterId'] ?? 0),
    scy: str(s['cipher']) || 'auto',
    net: network,
    type: 'none',
    host: network === 'ws' ? str(headers['Host']) : '',
    path: network === 'ws' ? str(ws['path']) : network === 'grpc' ? str(grpc['grpc-service-name']) : '',
    tls: s['tls'] === true ? 'tls' : '',
    sni: str(s['servername']) || str(s['sni']),
  };
  if (str(s['client-fingerprint'])) j['fp'] = str(s['client-fingerprint']);
  const json = JSON.stringify(j);
  return { ok: true, link: `vmess://${btoa(String.fromCharCode(...new TextEncoder().encode(json)))}` };
}

/** One server as a share link, or why it can't be one. */
export function writeLink(s: Server): WriteResult {
  switch (str(s['type'])) {
    case 'vless':
      return vless(s);
    case 'trojan':
      return trojan(s);
    case 'ss':
      return ss(s);
    case 'hysteria2':
      return hysteria2(s);
    case 'vmess':
      return vmess(s);
    default:
      return { ok: false, reason: 'unsupported-type', detail: str(s['type']) };
  }
}

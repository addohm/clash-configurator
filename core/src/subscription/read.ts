/**
 * What a subscription (or pasted text, or a file) can be, besides a full
 * Clash config: a list of share links (plain, or base64 as v2rayN-style
 * panels send it) or SIP008 JSON (Shadowsocks). These hold servers only, so
 * they become a basic Clash config to edit: the servers, a "Proxy" group to
 * pick one by hand, an "Auto" group for the fastest, and one rule sending
 * everything through Proxy. Nothing else is added (PLAN.md Q29).
 */
import { Document } from 'yaml';
import { looksLikeShareLinks } from '../intake/parse';
import { type LinkErrorCode, parseLinks, type Server } from '../links';

export type InputFormat = 'clash' | 'links' | 'sip008';

export interface ReadInput {
  format: InputFormat;
  /** A Clash config as text: the input itself, or one built from its servers. */
  text: string;
  /** For a built config: how many servers it has, and the entries that couldn't be read. */
  servers?: number;
  skipped?: { line: number; code: LinkErrorCode | 'sip008-plugin' | 'sip008-entry' }[];
}

const SS_CIPHERS = new Set([
  'aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm', 'chacha20-ietf-poly1305', 'xchacha20-ietf-poly1305',
  '2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm', '2022-blake3-chacha20-poly1305',
]);

/** SIP008: {"version": 1, "servers": [{server, server_port, password, method, remarks}]}. */
function sip008(text: string): { servers: Server[]; skipped: NonNullable<ReadInput['skipped']> } | null {
  const t = text.trim();
  if (!t.startsWith('{')) return null;
  let j: unknown;
  try {
    j = JSON.parse(t);
  } catch {
    return null;
  }
  if (j === null || typeof j !== 'object' || !Array.isArray((j as { servers?: unknown }).servers)) return null;
  const out: Server[] = [];
  const skipped: NonNullable<ReadInput['skipped']> = [];
  ((j as { servers: unknown[] }).servers).forEach((e, i) => {
    const s = e as Record<string, unknown>;
    const host = typeof s['server'] === 'string' ? s['server'].trim() : '';
    const port = Number(s['server_port']);
    const method = typeof s['method'] === 'string' ? s['method'].toLowerCase() : '';
    const password = typeof s['password'] === 'string' ? s['password'] : '';
    if (s['plugin']) {
      skipped.push({ line: i + 1, code: 'sip008-plugin' });
      return;
    }
    if (!host || /[\s,\u0000-\u001F]/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 || !SS_CIPHERS.has(method) || !password) {
      skipped.push({ line: i + 1, code: 'sip008-entry' });
      return;
    }
    const remarks = typeof s['remarks'] === 'string' ? s['remarks'].replace(/[,\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim() : '';
    out.push({ name: remarks || `${host}:${port}`, type: 'ss', server: host, port, cipher: method, password, udp: true });
  });
  return { servers: out, skipped };
}

/** Names made unique within the list: "HK", "HK 2", ... */
function uniqueNames(servers: Server[]): Server[] {
  const seen = new Set<string>();
  return servers.map((s) => {
    const base = String(s['name']);
    let name = base;
    for (let i = 2; seen.has(name); i++) name = `${base} ${i}`;
    seen.add(name);
    return { ...s, name };
  });
}

/** The basic config for a list of servers. */
export function basicConfig(servers: Server[]): string {
  const list = uniqueNames(servers);
  const names = list.map((s) => String(s['name']));
  const doc = new Document({
    mode: 'rule',
    proxies: list,
    'proxy-groups': [
      { name: 'Proxy', type: 'select', proxies: ['Auto', ...names, 'DIRECT'] },
      { name: 'Auto', type: 'url-test', proxies: names },
    ],
    rules: ['MATCH,Proxy'],
  });
  doc.commentBefore = ' Made by Clash Configurator from a list of servers.';
  return doc.toString({ lineWidth: 0 });
}

/**
 * Reads an input: a Clash config is passed through as it is (intake checks
 * it); a server list becomes a basic config.
 */
export function readInput(text: string): ReadInput {
  const s = sip008(text);
  if (s) {
    if (s.servers.length === 0) return { format: 'clash', text };
    return { format: 'sip008', text: basicConfig(s.servers), servers: s.servers.length, skipped: s.skipped };
  }
  if (looksLikeShareLinks(text) || looksLikePartlyLinks(text)) {
    const r = parseLinks(text);
    if (r.servers.length === 0) return { format: 'clash', text };
    return {
      format: 'links',
      text: basicConfig(r.servers),
      servers: r.servers.length,
      skipped: r.errors.map((e) => ({ line: e.line, code: e.code })),
    };
  }
  return { format: 'clash', text };
}

/**
 * A list where most lines are links but some aren't readable (comments,
 * a header, a kind of link nobody supports): still a server list.
 */
function looksLikePartlyLinks(text: string): boolean {
  if (text.length > 2_000_000) return false;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  if (lines.length === 0 || lines.some((l) => /^[A-Za-z0-9_-]+:\s/.test(l) && !l.includes('://'))) return false;
  const links = lines.filter((l) => /^[a-z0-9]+:\/\/[^\s#]+(#.*)?$/i.test(l)).length;
  return links > 0 && links >= lines.length / 2;
}

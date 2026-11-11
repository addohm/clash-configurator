/**
 * Flags settings in a config that put the user at risk (PLAN.md Q4): things
 * that open their device to others, download or run outside code, or read
 * their traffic. Each finding can carry a fix; the page ticks it when
 * `fixByDefault` is true and the user can untick it.
 *
 * The checks read the plain-object view of the config at known places only.
 * Scans over the whole config walk the YAML document instead, where an alias
 * is one node, so a config full of aliases can't make them slow.
 */
import { type Document, isScalar, visit } from 'yaml';
import { KNOWN_TOP_LEVEL_KEYS, KNOWN_DASHBOARD_SOURCES } from './known';

export type Severity = 'danger' | 'warning' | 'info';

export type Path = readonly (string | number)[];

/** A change to the document: set a value, or remove a key. */
export type Edit = { kind: 'set'; path: Path; value: string | boolean } | { kind: 'delete'; path: Path };

export const FINDING_IDS = [
  'controller-open-no-secret',
  'controller-open',
  'controller-no-secret',
  'allow-lan',
  'listener-open',
  'dns-listen-open',
  'dashboard-download',
  'insecure-download',
  'unsafe-path',
  'scripts',
  'mitm',
  'rewrite',
  'tunnels',
  'hosts',
  'hidden-characters',
  'unknown-keys',
] as const;

export type FindingId = (typeof FINDING_IDS)[number];

export interface Finding {
  id: FindingId;
  severity: Severity;
  /** Where in the config, e.g. ['proxy-providers', 'main', 'url']. */
  path: Path;
  /** Details for the message: a host, a count, key names. */
  params?: Record<string, string | number>;
  /** The edits that fix it, if there's a safe fix. */
  fix?: readonly Edit[];
  fixByDefault?: boolean;
}

type Config = Record<string, unknown>;

const isObject = (v: unknown): v is Config => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Splits "host:port" (or "[v6]:port", or ":port") into its parts. */
export function splitHostPort(value: string): { host: string; port: string } {
  const v = value.trim();
  if (v.startsWith('[')) {
    const end = v.indexOf(']');
    return { host: v.slice(1, end === -1 ? undefined : end), port: end === -1 ? '' : v.slice(end + 2) };
  }
  const colon = v.lastIndexOf(':');
  if (colon === -1) return { host: v, port: '' };
  // More than one colon and no brackets: a bare IPv6 address without a port.
  if (v.indexOf(':') !== colon) return { host: v, port: '' };
  return { host: v.slice(0, colon), port: v.slice(colon + 1) };
}

/** True for addresses only this device can reach. */
export function isLoopback(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

/** A random password for the controller, made on this device. */
function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function checkController(config: Config, out: Finding[]): void {
  const secret = str(config['secret']) ?? '';
  for (const key of ['external-controller', 'external-controller-tls'] as const) {
    const value = str(config[key]);
    if (!value) continue;
    const { host, port } = splitHostPort(value);
    if (!isLoopback(host)) {
      const fix: Edit[] = [{ kind: 'set', path: [key], value: `127.0.0.1:${port || '9090'}` }];
      out.push(
        secret === ''
          ? { id: 'controller-open-no-secret', severity: 'danger', path: [key], params: { value }, fix, fixByDefault: true }
          : { id: 'controller-open', severity: 'warning', path: [key], params: { value }, fix, fixByDefault: true },
      );
    } else if (secret === '') {
      // Only this device can reach it, but any website open in a browser here
      // can still send it commands unless it has a password.
      out.push({
        id: 'controller-no-secret',
        severity: 'info',
        path: [key],
        fix: [{ kind: 'set', path: ['secret'], value: randomSecret() }],
        fixByDefault: false,
      });
    }
  }
}

function checkLan(config: Config, out: Finding[]): void {
  if (config['allow-lan'] === true) {
    out.push({
      id: 'allow-lan',
      severity: 'warning',
      path: ['allow-lan'],
      fix: [{ kind: 'set', path: ['allow-lan'], value: false }],
      fixByDefault: true,
    });
  }
  const listeners = config['listeners'];
  if (Array.isArray(listeners)) {
    listeners.forEach((l, i) => {
      if (!isObject(l)) return;
      // mihomo listens on every network when `listen` is left out.
      const listen = str(l['listen']) ?? '0.0.0.0';
      if (isLoopback(listen)) return;
      out.push({
        id: 'listener-open',
        severity: 'warning',
        path: ['listeners', i],
        params: { name: str(l['name']) ?? `#${i + 1}`, listen },
        fix: [{ kind: 'set', path: ['listeners', i, 'listen'], value: '127.0.0.1' }],
        fixByDefault: true,
      });
    });
  }
  const dns = config['dns'];
  const dnsListen = isObject(dns) ? str(dns['listen']) : undefined;
  if (dnsListen) {
    const { host, port } = splitHostPort(dnsListen);
    if (!isLoopback(host)) {
      out.push({
        id: 'dns-listen-open',
        severity: 'warning',
        path: ['dns', 'listen'],
        params: { value: dnsListen },
        fix: [{ kind: 'set', path: ['dns', 'listen'], value: `127.0.0.1:${port || '53'}` }],
        fixByDefault: true,
      });
    }
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function checkDownloads(config: Config, out: Finding[]): void {
  const uiUrl = str(config['external-ui-url']);
  if (uiUrl) {
    const known = KNOWN_DASHBOARD_SOURCES.some((prefix) => uiUrl.toLowerCase().startsWith(prefix));
    if (!known) {
      out.push({
        id: 'dashboard-download',
        severity: 'warning',
        path: ['external-ui-url'],
        params: { host: hostOf(uiUrl) ?? uiUrl },
        fix: [{ kind: 'delete', path: ['external-ui-url'] }],
        fixByDefault: true,
      });
    }
  }

  // Every URL the app downloads from by itself.
  const urls: { path: Path; url: string }[] = [];
  if (uiUrl) urls.push({ path: ['external-ui-url'], url: uiUrl });
  for (const section of ['proxy-providers', 'rule-providers'] as const) {
    const providers = config[section];
    if (!isObject(providers)) continue;
    for (const [name, p] of Object.entries(providers)) {
      const url = isObject(p) ? str(p['url']) : undefined;
      if (url) urls.push({ path: [section, name, 'url'], url });
    }
  }
  const geox = config['geox-url'];
  if (isObject(geox)) {
    for (const [name, url] of Object.entries(geox)) {
      if (typeof url === 'string') urls.push({ path: ['geox-url', name], url });
    }
  }
  for (const { path, url } of urls) {
    if (!/^http:\/\//i.test(url)) continue;
    out.push({
      id: 'insecure-download',
      severity: 'warning',
      path,
      params: { host: hostOf(url) ?? url },
      // Not every server offers https, so the switch is offered, not ticked.
      fix: [{ kind: 'set', path, value: url.replace(/^http:/i, 'https:') }],
      fixByDefault: false,
    });
  }
}

/** True for a file path that leaves the app's own folder. */
export function isUnsafePath(path: string): boolean {
  const p = path.replace(/\\/g, '/');
  return p.startsWith('/') || p.startsWith('~') || /^[a-z]:/i.test(p) || p.split('/').includes('..');
}

function checkPaths(config: Config, out: Finding[]): void {
  const flag = (path: Path, value: string) =>
    out.push({
      id: 'unsafe-path',
      severity: 'danger',
      path,
      params: { value },
      fix: [{ kind: 'delete', path }],
      fixByDefault: true,
    });
  for (const section of ['proxy-providers', 'rule-providers'] as const) {
    const providers = config[section];
    if (!isObject(providers)) continue;
    for (const [name, p] of Object.entries(providers)) {
      const path = isObject(p) ? str(p['path']) : undefined;
      if (path && isUnsafePath(path)) flag([section, name, 'path'], path);
    }
  }
  const ui = str(config['external-ui']);
  if (ui && isUnsafePath(ui)) flag(['external-ui'], ui);
}

function checkCode(config: Config, out: Finding[]): void {
  const remove = (id: FindingId, severity: Severity, path: Path) =>
    out.push({ id, severity, path, fix: [{ kind: 'delete', path }], fixByDefault: true });
  // Scripts run code inside the app (Clash Premium and Stash).
  for (const key of ['script', 'scripts', 'script-providers'] as const) {
    if (key in config) remove('scripts', 'danger', [key]);
  }
  if ('mitm' in config) remove('mitm', 'danger', ['mitm']);
  // Stash keeps scripts, decryption (MITM) and rewrites under `http`.
  const http = config['http'];
  if (isObject(http)) {
    if ('script' in http) remove('scripts', 'danger', ['http', 'script']);
    if ('mitm' in http) remove('mitm', 'danger', ['http', 'mitm']);
    for (const key of ['rewrite', 'url-rewrite', 'header-rewrite', 'body-rewrite'] as const) {
      if (key in http) remove('rewrite', 'warning', ['http', key]);
    }
  }
  const tunnels = config['tunnels'];
  if (Array.isArray(tunnels) && tunnels.length > 0) {
    out.push({ id: 'tunnels', severity: 'info', path: ['tunnels'], params: { count: tunnels.length } });
  }
  const hosts = config['hosts'];
  if (isObject(hosts) && Object.keys(hosts).length > 0) {
    out.push({ id: 'hosts', severity: 'info', path: ['hosts'], params: { count: Object.keys(hosts).length } });
  }
}

/**
 * Invisible characters that reorder or hide text (bidirectional controls and
 * zero-width spaces), which can make a server or rule look like something
 * else. The zero-width joiner is left out: emoji sequences use it.
 */
const HIDDEN = /[​‌‎‏‪-‮⁦-⁩﻿]/;

function checkHidden(doc: Document, out: Finding[]): void {
  let count = 0;
  let first: Path | null = null;
  visit(doc, {
    Scalar(_key, node, path) {
      if (typeof node.value !== 'string' || !HIDDEN.test(node.value)) return;
      count++;
      if (first === null) first = pathOf(path, node);
    },
  });
  if (count > 0) out.push({ id: 'hidden-characters', severity: 'warning', path: first ?? [], params: { count } });
}

/** Turns a visitor's ancestor list into a config path like ['proxies', 2, 'name']. */
function pathOf(ancestors: readonly unknown[], node: unknown): Path {
  const out: (string | number)[] = [];
  const chain = [...ancestors, node];
  for (let i = 1; i < chain.length; i++) {
    const parent = chain[i - 1] as { items?: unknown[]; key?: unknown };
    const child = chain[i];
    if (Array.isArray(parent.items)) {
      const idx = parent.items.indexOf(child);
      // Sequence items are numbered; map items are pairs, named in the next step.
      if (idx !== -1 && !isPairLike(child)) out.push(idx);
    } else if (isPairLike(parent) && parent.key !== child && isScalar(parent.key)) {
      out.push(String(parent.key.value));
    }
  }
  return out;
}

function isPairLike(v: unknown): v is { key: unknown; value: unknown } {
  return v !== null && typeof v === 'object' && 'key' in v && 'value' in v;
}

function checkUnknown(config: Config, out: Finding[]): void {
  const unknown = Object.keys(config).filter((k) => !KNOWN_TOP_LEVEL_KEYS.has(k));
  if (unknown.length > 0) {
    out.push({ id: 'unknown-keys', severity: 'info', path: [], params: { keys: unknown.join(', ') } });
  }
}

const ORDER: Record<Severity, number> = { danger: 0, warning: 1, info: 2 };

/** Every finding for a parsed config, most serious first. */
export function checkConfig(doc: Document, config: Config): Finding[] {
  const out: Finding[] = [];
  checkController(config, out);
  checkLan(config, out);
  checkDownloads(config, out);
  checkPaths(config, out);
  checkCode(config, out);
  checkHidden(doc, out);
  checkUnknown(config, out);
  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

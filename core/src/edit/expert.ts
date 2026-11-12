/**
 * Checks for the expert settings Advanced mode edits (PLAN.md Q10, parts 6
 * and 7): TUN, sniffing, the controller and dashboard, and geo data. Each
 * returns the value tidied, or throws ChangeError('bad value'). The safety
 * checks still look at the result (an open controller, a dashboard from an
 * unknown site, plain-http downloads), so these only make sure a value is
 * the right shape.
 */
import { isUnsafePath } from '../intake';
import { ChangeError } from './changes';

const bad = (): never => {
  throw new ChangeError('bad value');
};
const CONTROL = /[\u0000-\u001F\u007F]/;

export const TUN_STACKS = ['system', 'gvisor', 'mixed'] as const;
export type TunStack = (typeof TUN_STACKS)[number];

export const SNIFF_PROTOCOLS = ['HTTP', 'TLS', 'QUIC'] as const;
export type SniffProtocol = (typeof SNIFF_PROTOCOLS)[number];

function port(n: string): number {
  const v = Number(n);
  if (!/^\d{1,5}$/.test(n) || v < 1 || v > 65535) bad();
  return v;
}

/** host:port, [v6]:port or :port, as the controller listens on. */
export function checkHostPort(raw: string): string {
  const v = raw.trim();
  if (v === '' || CONTROL.test(v) || /\s/.test(v)) bad();
  const m = /^(\[[0-9a-f:]+\]|[a-z0-9.-]*):(\d{1,5})$/i.exec(v);
  if (!m) bad();
  port(m?.[2] ?? '');
  return v;
}

/** A download address: https only (the safety checks would flag http anyway). */
export function checkHttpsUrl(raw: string): string {
  const v = raw.trim();
  if (CONTROL.test(v) || /\s/.test(v)) bad();
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return bad();
  }
  if (url.protocol !== 'https:' || url.hostname === '') bad();
  return v;
}

/** A folder for the dashboard, inside the app's own folder. */
export function checkFolder(raw: string): string {
  const v = raw.trim();
  if (v === '' || CONTROL.test(v) || isUnsafePath(v) || /[<>:"|?*]/.test(v)) bad();
  return v;
}

/** A controller password: any text without control characters. */
export function checkSecret(raw: string): string {
  if (CONTROL.test(raw) || raw.length > 256) bad();
  return raw;
}

/** "80, 8080-8880" as sniffer ports: numbers, and ranges as text. */
export function checkPorts(raw: string): (number | string)[] {
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.length === 0) bad();
  return parts.map((p) => {
    const range = /^(\d{1,5})-(\d{1,5})$/.exec(p);
    if (range) {
      const a = port(range[1] ?? '');
      const b = port(range[2] ?? '');
      if (a > b) bad();
      return `${a}-${b}`;
    }
    return port(p);
  });
}

/** A TUN DNS-hijack entry: any:53, tcp://any:53, 198.18.0.2:53. */
export function checkHijack(raw: string): string {
  const v = raw.trim().toLowerCase();
  const m = /^(?:(tcp|udp):\/\/)?(any|[\d.]+|\[[0-9a-f:]+\]):(\d{1,5})$/.exec(v);
  if (!m) bad();
  port(m?.[3] ?? '');
  return v;
}

/** Hours between geo data updates: 1 to 720 (a month). */
export function checkHours(raw: string): number {
  const v = raw.trim();
  const n = Number(v);
  if (!/^\d{1,3}$/.test(v) || n < 1 || n > 720) bad();
  return n;
}

/** A random controller password, made on this device. */
export function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Well-known dashboards and where to download them. The safety checks know
 * these sources (core/src/intake/known.ts); anything else is flagged.
 */
export const DASHBOARDS = [
  { id: 'metacubexd', name: 'metacubexd', url: 'https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip' },
  { id: 'zashboard', name: 'zashboard', url: 'https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip' },
  { id: 'yacd-meta', name: 'Yacd-meta', url: 'https://github.com/MetaCubeX/Yacd-meta/archive/refs/heads/gh-pages.zip' },
] as const;

/** The geo data files mihomo can download, by their geox-url key. */
export const GEO_FILES = ['geoip', 'geosite', 'mmdb', 'asn'] as const;
export type GeoFile = (typeof GEO_FILES)[number];

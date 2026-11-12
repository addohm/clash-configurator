/**
 * Fetching a subscription URL. Only the Windows app can: it asks the app's
 * `fetch_subscription` command (../../../fetcher has the checks). A page in
 * a browser can't, because providers don't let other websites read their
 * subscriptions (the website will get its own fetcher, PLAN.md Q3).
 */
import { invoke } from '@tauri-apps/api/core';
import { inApp } from './save';

export const FETCH_ERRORS = [
  'bad-url',
  'private-address',
  'too-many-redirects',
  'too-big',
  'timeout',
  'not-text',
  'status',
  'network',
  'not-in-app',
] as const;
export type FetchErrorCode = (typeof FETCH_ERRORS)[number];

export type FetchResult =
  | { ok: true; body: string; finalUrl: string; userinfo: string | null }
  | { ok: false; code: FetchErrorCode; detail: string };

export async function fetchSubscription(url: string): Promise<FetchResult> {
  if (!inApp()) return { ok: false, code: 'not-in-app', detail: '' };
  try {
    const r = await invoke<{ body: string; finalUrl: string; userinfo: string | null }>('fetch_subscription', { url });
    return { ok: true, ...r };
  } catch (e) {
    const err = e as { code?: string; detail?: unknown } | string;
    const code = typeof err === 'object' && err !== null && FETCH_ERRORS.includes(err.code as FetchErrorCode) ? (err.code as FetchErrorCode) : 'network';
    const detail = typeof err === 'object' && err !== null && err.detail !== undefined ? String(err.detail) : '';
    return { ok: false, code, detail };
  }
}

export interface Usage {
  used: number;
  total: number;
  /** When the subscription ends, if the provider says. */
  expires: Date | null;
}

/** Reads a provider's `subscription-userinfo` line: upload=..; download=..; total=..; expire=.. */
export function readUsage(line: string | null): Usage | null {
  if (!line) return null;
  const n: Record<string, number> = {};
  for (const part of line.split(';')) {
    const [k, v] = part.split('=').map((x) => x.trim());
    if (k && v && /^\d+$/.test(v)) n[k.toLowerCase()] = Number(v);
  }
  if (n['total'] === undefined) return null;
  return {
    used: (n['upload'] ?? 0) + (n['download'] ?? 0),
    total: n['total'],
    expires: n['expire'] ? new Date(n['expire'] * 1000) : null,
  };
}

/** Bytes as a short size, e.g. "12.3 GB". */
export function size(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

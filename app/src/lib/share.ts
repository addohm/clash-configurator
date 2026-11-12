/**
 * Send to phone (PLAN.md Q19): asks the app to offer the new files on the
 * local Wi-Fi for a few minutes (src-tauri/src/main.rs, ../../sharer). The
 * phone scans a QR code, opens a small page, and taps the button for its
 * app, which then downloads the file itself. Only in the Windows app.
 */
import { invoke } from '@tauri-apps/api/core';
import type { AppId, ShadowrocketFiles } from '../../../core/src';
import { strings as t } from '../i18n';

/** Why Send to phone didn't start; each has text in en.ts. */
export const SHARE_ERRORS = ['no-network', 'not-local', 'bad-files', 'listen', 'failed'] as const;
export type ShareError = (typeof SHARE_ERRORS)[number];

export interface ShareFile {
  /** Its last URL part. */
  path: string;
  /** The name the phone saves it under. */
  name: string;
  contents: string;
}

export type ShareAction = 'stash' | 'clash' | 'shadowrocket-servers' | 'shadowrocket-config' | 'download';

export interface SharePage {
  title: string;
  intro: string;
  buttons: { label: string; file: string; action: ShareAction }[];
  note: string;
}

export type Started = { ok: true; url: string; address: string; addresses: string[] } | { ok: false; code: ShareError };

export type ShareStatus = { state: 'running'; secondsLeft: number; fetched: string[] } | { state: 'done' | 'expired' | 'stopped' | 'guessing' };

/** The files to send for an app, and the phone's page with a button for each. */
export function sharePlan(
  app: AppId | null,
  output: string,
  shadowrocket: ShadowrocketFiles | null,
  names: { config: string; conf: string; servers: string },
): { files: ShareFile[]; page: SharePage } {
  const p = t.share.phone;
  if (app === 'shadowrocket' && shadowrocket) {
    return {
      files: [
        { path: 'servers.txt', name: names.servers, contents: shadowrocket.nodes },
        { path: 'config.conf', name: names.conf, contents: shadowrocket.conf },
      ],
      page: {
        title: p.title,
        intro: p.introShadowrocket,
        buttons: [
          { label: p.shadowrocketServers, file: 'servers.txt', action: 'shadowrocket-servers' },
          { label: p.shadowrocketConfig, file: 'config.conf', action: 'shadowrocket-config' },
          { label: p.downloadServers, file: 'servers.txt', action: 'download' },
          { label: p.downloadConf, file: 'config.conf', action: 'download' },
        ],
        note: p.note,
      },
    };
  }
  const stash = app === 'stash';
  return {
    files: [{ path: 'config.yaml', name: names.config, contents: output }],
    page: {
      title: p.title,
      intro: stash ? p.introStash : p.introClash,
      buttons: [
        stash ? { label: p.stash, file: 'config.yaml', action: 'stash' } : { label: p.clash, file: 'config.yaml', action: 'clash' },
        { label: p.download, file: 'config.yaml', action: 'download' },
      ],
      note: p.note,
    },
  };
}

export async function startShare(files: ShareFile[], page: SharePage, address?: string): Promise<Started> {
  try {
    const r = await invoke<{ url: string; address: string; addresses: string[] }>('share_start', { files, page, address: address ?? null });
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, code: SHARE_ERRORS.find((c) => c === String(e)) ?? 'failed' };
  }
}

export async function shareStatus(): Promise<ShareStatus | null> {
  try {
    return await invoke<ShareStatus | null>('share_status');
  } catch {
    return null;
  }
}

export async function stopShare(): Promise<void> {
  try {
    await invoke('share_stop');
  } catch {
    // Nothing running, or the app is closing: either way it's stopped.
  }
}

/**
 * Updates (PLAN.md Q20): the app checks the project's GitHub releases once
 * when it starts and says when there's a newer version. It downloads and
 * installs only when asked, after checking the release's signature
 * (src-tauri/src/main.rs, update_check and update_install). Only in the app.
 */
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { inApp } from './save';

export interface Available {
  version: string;
  notes: string | null;
}

/** A newer version, or null: none, not in the app, or the check failed (offline, no releases yet). */
export async function checkForUpdate(): Promise<Available | null> {
  if (!inApp()) return null;
  try {
    return await invoke<Available | null>('update_check');
  } catch {
    return null;
  }
}

/** Downloads, checks and installs it; the app closes and reopens. Returns why it couldn't. */
export async function installUpdate(): Promise<string | null> {
  try {
    await invoke('update_install');
    return null;
  } catch (e) {
    return String(e);
  }
}

/** This app's version, or '' in a browser. */
export async function appVersion(): Promise<string> {
  if (!inApp()) return '';
  try {
    return await getVersion();
  } catch {
    return '';
  }
}

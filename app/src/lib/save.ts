/**
 * Saving a file. In the Windows app this asks the app's `save_file` command,
 * which shows a Save dialog and writes only where the user chose
 * (src-tauri/src/main.rs). In a browser it's an ordinary download.
 */
import { invoke } from '@tauri-apps/api/core';

export type SaveKind = 'config' | 'settings';

export type SaveResult =
  | { status: 'saved'; path: string }
  | { status: 'downloaded' }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

/** True inside the Tauri app (it adds this to the page). */
export const inApp = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function saveFile(kind: SaveKind, name: string, contents: string): Promise<SaveResult> {
  if (inApp()) {
    try {
      const path = await invoke<string | null>('save_file', { kind, name, contents });
      return path ? { status: 'saved', path } : { status: 'cancelled' };
    } catch (e) {
      return { status: 'failed', reason: String(e) };
    }
  }
  const type = kind === 'config' ? 'application/yaml' : 'application/json';
  const url = URL.createObjectURL(new Blob([contents], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before letting go of it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { status: 'downloaded' };
}

/**
 * What the page remembers between runs (PLAN.md Q9: anything it needs, as
 * long as it stays local): the last subscription URL, the app picked, the
 * link choice, and the last session (the same JSON as a saved settings
 * file). In the Windows app this is the app's own storage, on this PC, for
 * this Windows user. Everything read back is checked like any input.
 */
const PREFIX = 'clash-configurator:';
export const MEMORY_KEYS = ['url', 'app', 'link', 'session', 'savedAt'] as const;
export type MemoryKey = (typeof MEMORY_KEYS)[number];

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage switched off
  }
}

/** Stores a value; false if it didn't fit (a very big config) or storage is off. */
export function remember(key: MemoryKey, value: string): boolean {
  try {
    storage()?.setItem(PREFIX + key, value);
    return storage() !== null;
  } catch {
    // Too big for the browser's storage: the rest still works, it just won't be remembered.
    return false;
  }
}

export function recall(key: MemoryKey): string | null {
  try {
    return storage()?.getItem(PREFIX + key) ?? null;
  } catch {
    return null;
  }
}

export function forget(...keys: MemoryKey[]): void {
  for (const k of keys.length > 0 ? keys : MEMORY_KEYS) {
    try {
      storage()?.removeItem(PREFIX + k);
    } catch {
      // nothing to do
    }
  }
}

/** A remembered URL, if it still looks like one (it's read back as untrusted). */
export function recallUrl(): string {
  const u = recall('url');
  return u && u.length <= 4096 && /^https?:\/\/\S+$/i.test(u) && !/[\u0000-\u001F]/.test(u) ? u : '';
}

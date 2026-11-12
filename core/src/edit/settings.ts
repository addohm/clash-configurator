/**
 * The saved settings file (PLAN.md Q9): the original config plus the
 * changes, with the app, mode and source, as JSON. Loading it rebuilds the
 * page exactly. A loaded file is treated as hostile like any input (Q4):
 * every field is checked, and its original goes through intake again.
 */
import { TARGET_APPS, type AppId } from '../apps';
import { intake, LIMITS } from '../intake';
import { MODES, type Mode } from '../modes';
import { type Change, ChangeError, validateChange } from './changes';
import type { Session, Source, SourceKind } from './session';

export const SETTINGS_FORMAT = 'clash-configurator-settings';
export const SETTINGS_VERSION = 1;
export const SETTINGS_EXTENSION = 'ccsettings.json';

/** Room for the original (escaped in JSON) plus the changes. */
const MAX_SETTINGS_BYTES = LIMITS.maxBytes * 2 + 4 * 1024 * 1024;
const MAX_CHANGES = 10_000;
const CONTROL = /[\u0000-\u001F\u007F]/;

export const SETTINGS_ERRORS = [
  'too-big',
  'not-json',
  'not-settings',
  'newer-version',
  'bad-field',
  'bad-change',
  'bad-original',
] as const;

export type SettingsErrorCode = (typeof SETTINGS_ERRORS)[number];

export type ReadSettings =
  | { ok: true; session: Session }
  | { ok: false; error: SettingsErrorCode; detail?: string };

export function writeSettings(session: Session): string {
  const file = {
    format: SETTINGS_FORMAT,
    version: SETTINGS_VERSION,
    app: session.app,
    mode: session.mode,
    source: session.source,
    original: session.original,
    changes: session.changes,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

const fail = (error: SettingsErrorCode, detail?: string): ReadSettings =>
  detail === undefined ? { ok: false, error } : { ok: false, error, detail };

function readSource(v: unknown): Source | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const s = v as Record<string, unknown>;
  const kinds: SourceKind[] = ['paste', 'file', 'url'];
  if (!kinds.includes(s['kind'] as SourceKind)) return null;
  const source: Source = { kind: s['kind'] as SourceKind };
  const format = s['format'];
  if (format !== undefined) {
    if (format !== 'links' && format !== 'sip008') return null;
    source.format = format;
  }
  const name = s['name'];
  if (name !== undefined) {
    if (typeof name !== 'string' || name.length > 255 || CONTROL.test(name)) return null;
    source.name = name;
  }
  const url = s['url'];
  if (url !== undefined) {
    if (typeof url !== 'string' || url.length > 4096 || CONTROL.test(url) || !/^https?:\/\//i.test(url)) return null;
    source.url = url;
  }
  return source;
}

export function readSettings(text: string): ReadSettings {
  if (new TextEncoder().encode(text).length > MAX_SETTINGS_BYTES) return fail('too-big');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('not-json');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('not-settings');
  const f = parsed as Record<string, unknown>;
  if (f['format'] !== SETTINGS_FORMAT) return fail('not-settings');
  if (typeof f['version'] !== 'number' || !Number.isInteger(f['version'])) return fail('not-settings');
  if (f['version'] > SETTINGS_VERSION) return fail('newer-version');

  if (!TARGET_APPS.some((a) => a.id === f['app'])) return fail('bad-field', 'app');
  if (!MODES.includes(f['mode'] as Mode)) return fail('bad-field', 'mode');
  const source = readSource(f['source']);
  if (!source) return fail('bad-field', 'source');
  if (typeof f['original'] !== 'string') return fail('bad-field', 'original');
  const original = f['original'];
  const rawChanges = f['changes'];
  if (!Array.isArray(rawChanges) || rawChanges.length > MAX_CHANGES) return fail('bad-field', 'changes');

  const changes: Change[] = [];
  for (const [i, c] of rawChanges.entries()) {
    try {
      changes.push(validateChange(c));
    } catch (e) {
      if (e instanceof ChangeError) return fail('bad-change', String(i + 1));
      throw e;
    }
  }
  const check = intake(original);
  if (!check.ok) return fail('bad-original', check.refusal.code);
  return { ok: true, session: { app: f['app'] as AppId, mode: f['mode'] as Mode, source, original, changes } };
}

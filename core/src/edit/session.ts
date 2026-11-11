/**
 * A session: the original config, where it came from, the app and mode the
 * user picked, and their changes (PLAN.md Q8, Q9). Everything the page shows
 * is rebuilt from these, so saving them is enough to restore the page.
 */
import type { Document } from 'yaml';
import type { AppId } from '../apps';
import { type Edit, type Finding, intake, type Refusal } from '../intake';
import type { Mode } from '../modes';
import { applyChange, type Change, ChangeError } from './changes';
import { writeYaml } from './output';

export type SourceKind = 'paste' | 'file' | 'url';

export interface Source {
  kind: SourceKind;
  /** The file's name, for 'file'. */
  name?: string;
  /** The subscription URL, for 'url'. */
  url?: string;
}

export interface Session {
  app: AppId;
  mode: Mode;
  source: Source;
  /** The config exactly as it came in. */
  original: string;
  changes: Change[];
}

export type Built =
  | { ok: true; doc: Document; output: string; findings: Finding[] }
  /** The original no longer passes intake (only possible for a loaded file). */
  | { ok: false; reason: 'original'; refusal: Refusal }
  /** Change number `index` doesn't fit the config. */
  | { ok: false; reason: 'change'; index: number; message: string }
  /** The changes left something intake refuses, e.g. no servers at all. */
  | { ok: false; reason: 'result'; refusal: Refusal };

export type BuiltDoc =
  | { ok: true; doc: Document }
  | { ok: false; reason: 'original'; refusal: Refusal }
  | { ok: false; reason: 'change'; index: number; message: string };

/** The edited document only, without writing it out: for the page while editing. */
export function buildDoc(session: Session): BuiltDoc {
  const start = intake(session.original);
  if (!start.ok) return { ok: false, reason: 'original', refusal: start.refusal };
  for (const [index, change] of session.changes.entries()) {
    try {
      applyChange(start.doc, change);
    } catch (e) {
      if (e instanceof ChangeError) return { ok: false, reason: 'change', index, message: e.message };
      throw e;
    }
  }
  return { ok: true, doc: start.doc };
}

/** Rebuilds the edited config: the original, then every change in order. */
export function build(session: Session): Built {
  const start = intake(session.original);
  if (!start.ok) return { ok: false, reason: 'original', refusal: start.refusal };
  const doc = start.doc;
  for (const [index, change] of session.changes.entries()) {
    try {
      applyChange(doc, change);
    } catch (e) {
      if (e instanceof ChangeError) return { ok: false, reason: 'change', index, message: e.message };
      throw e;
    }
  }
  const output = writeYaml(doc, session.original);
  // The result goes through intake too: the user's own changes are checked
  // like anything else, and the findings shown are the result's.
  const result = intake(output);
  if (!result.ok) return { ok: false, reason: 'result', refusal: result.refusal };
  return { ok: true, doc, output, findings: result.findings };
}

/** A fix's edits, as changes to add to the session. */
export function fixToChanges(edits: readonly Edit[]): Change[] {
  return edits.map((e) => (e.kind === 'delete' ? { op: 'delete', path: e.path } : { op: 'set', path: e.path, value: e.value }));
}

/** Starts a session on a new config, with the ticked fixes already added. */
export function startSession(
  original: string,
  source: Source,
  app: AppId,
  mode: Mode,
  fixes: readonly Finding[] = [],
): Session {
  return { app, mode, source, original, changes: fixes.flatMap((f) => fixToChanges(f.fix ?? [])) };
}

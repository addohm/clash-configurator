/**
 * The page's state: the steps of Simple mode, the config brought in, its
 * intake result and the session built from it. Everything stays in this
 * browser window (PLAN.md Q2, Q9).
 *
 * Intake results and sessions are kept with $state.raw: they hold a YAML
 * document and possibly megabytes of config, which mustn't be wrapped in
 * Svelte's deep proxies. They're replaced whole, never edited in place.
 */
import type { Document } from 'yaml';
import {
  type AppId,
  applyChange,
  buildDoc,
  type Change,
  ChangeError,
  DEFAULT_MODE,
  type Finding,
  type Intake,
  intake,
  LIMITS,
  type Mode,
  readSettings,
  type ReadSettings,
  type Session,
  type Source,
  startSession,
} from '../../../core/src';

export const STEPS = ['app', 'input', 'report', 'edit', 'review'] as const;
export type StepId = (typeof STEPS)[number];

/** The parts of the edit step, in order (PLAN.md Q10). */
export const SECTIONS = ['basics', 'servers', 'groups', 'rules', 'dns'] as const;
export type SectionId = (typeof SECTIONS)[number];

class Store {
  mode: Mode = $state(DEFAULT_MODE);
  app: AppId | null = $state(null);
  /** The step that's open. */
  step: StepId = $state('app');
  /** How far the user has got: steps up to here can be reopened. */
  reached = $state(0);

  /** What was brought in, and what intake made of it. */
  source: Source | null = $state.raw(null);
  original: string | null = $state.raw(null);
  checked: Intake | null = $state.raw(null);
  /** Which findings' fixes are ticked, by position in checked.findings. */
  ticked: readonly boolean[] = $state.raw([]);

  session: Session | null = $state.raw(null);
  /**
   * The config as edited so far. Edits change it in place (rebuilding a big
   * config from the original on every keystroke would be slow), so `version`
   * is bumped to tell the page to read it again.
   */
  doc: Document | null = $state.raw(null);
  version = $state(0);
  /** A plain-object view of `doc`, for showing values. Never edit it. */
  data: Record<string, unknown> = $derived.by(() => {
    void this.version;
    const d = this.doc?.toJS({ maxAliasCount: LIMITS.maxAliasCount }) as unknown;
    return d !== null && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : {};
  });
  /** How many changes each edit added, newest last, so Undo takes back a whole edit. */
  edits: readonly number[] = $state.raw([]);
  /** Why the last edit failed, if it did. */
  editError = $state('');
  section: SectionId = $state('basics');

  open(step: StepId): void {
    const i = STEPS.indexOf(step);
    if (i <= this.reached) this.step = step;
  }

  advance(step: StepId): void {
    const i = STEPS.indexOf(step);
    this.reached = Math.max(this.reached, i);
    this.step = step;
  }

  pickApp(app: AppId): void {
    this.app = app;
    if (this.session) this.session = { ...this.session, app };
    this.advance(this.session ? this.step : 'input');
  }

  /** Runs intake on a pasted or opened config and opens the safety report. */
  check(input: string | Uint8Array, source: Source): void {
    const result = intake(input);
    this.source = source;
    this.checked = result;
    this.original = result.ok ? (typeof input === 'string' ? input : new TextDecoder().decode(input)) : null;
    this.ticked = result.ok ? result.findings.map((f) => !!(f.fix && f.fixByDefault)) : [];
    this.session = null;
    this.doc = null;
    this.edits = [];
    this.reached = STEPS.indexOf('report');
    this.step = 'report';
  }

  toggleFix(index: number): void {
    this.ticked = this.ticked.map((v, i) => (i === index ? !v : v));
  }

  /** Starts the session with the ticked fixes and moves on to editing. */
  startEditing(): void {
    if (!this.checked?.ok || this.original === null || !this.source || !this.app) return;
    const fixes: Finding[] = this.checked.findings.filter((f, i) => f.fix && this.ticked[i]);
    this.load(startSession(this.original, this.source, this.app, this.mode, fixes));
    this.advance('edit');
  }

  /** Builds the document for a session (its changes so far can't be undone). */
  private load(session: Session): boolean {
    const r = buildDoc(session);
    if (!r.ok) return false;
    this.session = session;
    this.doc = r.doc;
    this.edits = [];
    this.editError = '';
    this.section = 'basics';
    this.version++;
    return true;
  }

  /**
   * Makes one edit: its changes go into the document and the session
   * together. If one doesn't fit, nothing of the edit is kept.
   */
  edit(changes: readonly Change[]): boolean {
    if (!this.session || !this.doc || changes.length === 0) return false;
    this.editError = '';
    try {
      for (const c of changes) applyChange(this.doc, c);
    } catch (e) {
      if (!(e instanceof ChangeError)) throw e;
      this.editError = e.message;
      this.rebuild(this.session); // the document may be half-changed
      return false;
    }
    this.session = { ...this.session, changes: [...this.session.changes, ...changes] };
    this.edits = [...this.edits, changes.length];
    this.version++;
    return true;
  }

  undo(): void {
    const last = this.edits[this.edits.length - 1];
    if (!this.session || last === undefined) return;
    const session = { ...this.session, changes: this.session.changes.slice(0, -last) };
    this.edits = this.edits.slice(0, -1);
    this.rebuild(session);
  }

  private rebuild(session: Session): void {
    const r = buildDoc(session);
    if (!r.ok) return;
    this.session = session;
    this.doc = r.doc;
    this.version++;
  }

  /** Restores a saved settings file: the same config, changes, app and mode. */
  restore(text: string): ReadSettings {
    const r = readSettings(text);
    if (!r.ok) return r;
    const s = r.session;
    this.app = s.app;
    this.mode = s.mode;
    this.source = s.source;
    this.original = s.original;
    this.checked = intake(s.original);
    this.ticked = [];
    if (!this.load(s)) return { ok: false, error: 'bad-change' };
    this.reached = STEPS.indexOf('review');
    this.step = 'edit';
    return r;
  }

  /** Back to bringing in a config, keeping the app. */
  restart(): void {
    this.checked = null;
    this.original = null;
    this.session = null;
    this.doc = null;
    this.edits = [];
    this.reached = STEPS.indexOf('input');
    this.step = 'input';
  }
}

export const store = new Store();

/**
 * The page's state: the steps of Simple mode, the config brought in, its
 * intake result and the session built from it. Everything stays in this
 * browser window (PLAN.md Q2, Q9).
 *
 * Intake results and sessions are kept with $state.raw: they hold a YAML
 * document and possibly megabytes of config, which mustn't be wrapped in
 * Svelte's deep proxies. They're replaced whole, never edited in place.
 */
import {
  type AppId,
  build,
  type Built,
  DEFAULT_MODE,
  type Finding,
  type Intake,
  intake,
  type Mode,
  readSettings,
  type ReadSettings,
  type Session,
  type Source,
  startSession,
} from '../../../core/src';

export const STEPS = ['app', 'input', 'report', 'edit', 'review'] as const;
export type StepId = (typeof STEPS)[number];

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
  built: Built | null = $derived(this.session ? build(this.session) : null);

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
    this.session = startSession(this.original, this.source, this.app, this.mode, fixes);
    this.advance('edit');
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
    this.session = s;
    this.reached = STEPS.indexOf('review');
    this.step = 'edit';
    return r;
  }

  /** Back to bringing in a config, keeping the app. */
  restart(): void {
    this.checked = null;
    this.original = null;
    this.session = null;
    this.reached = STEPS.indexOf('input');
    this.step = 'input';
  }
}

export const store = new Store();

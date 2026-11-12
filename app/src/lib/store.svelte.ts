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
  TARGET_APPS,
  writeSettings,
  type Choice,
  type Conflict,
  type LinkPlan,
  linkedCopy,
  type Note,
  planLink,
  planRebase,
  type RebasePlan,
  type ReadInput,
  readInput,
  writeYaml,
  type Dropped,
  type ShadowrocketFiles,
  toShadowrocket,
  toStash,
} from '../../../core/src';
import { type FetchResult, fetchSubscription, readInterval, readTitle, readUsage, type Usage } from './fetch';
import { forget, recall, recallUrl, remember } from './memory';

export const STEPS = ['app', 'input', 'report', 'edit', 'review'] as const;
export type StepId = (typeof STEPS)[number];

/** The parts of the edit step, in order (PLAN.md Q10). */
export const SECTIONS = ['basics', 'servers', 'groups', 'rules', 'dns'] as const;
export type SectionId = (typeof SECTIONS)[number];

/** The parts Advanced mode shows, all on one page (Q10 parts 6 and 7, Q11, Q31). */
export const ADVANCED_PARTS = [...SECTIONS, 'tun', 'controller'] as const;
export type PartId = (typeof ADVANCED_PARTS)[number];

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
  /** Set when the input was a server list, made into a basic config. */
  converted: ReadInput | null = $state.raw(null);
  /** What the provider said about the subscription's data and end date, if fetched. */
  usage: Usage | null = $state.raw(null);
  /** How often the provider suggests updating, in seconds, if it said. */
  updateSeconds: number | undefined = $state(undefined);
  /** Q32: an update from the subscription waiting for answers, its result, and the session before it. */
  updating: { plan: RebasePlan; text: string; conflicts: Conflict[]; format: 'clash' | 'links' | 'sip008' } | null = $state.raw(null);
  updateReport: { applied: number; notes: Note[] } | null = $state.raw(null);
  beforeUpdate: Session | null = $state.raw(null);
  updateError = $state('');
  fetchingUpdate = $state(false);

  /** Q28: keep servers updating from the subscription when saving. */
  linkServers = $state(true);

  /** The last subscription URL, remembered on this PC, to fill in step 2. */
  rememberedUrl = $state('');
  /** A remembered session from last time, offered as "carry on". */
  resumable: { name: string; when: Date | null } | null = $state(null);
  /** Set when the session is too big for the app's storage to remember. */
  memoryFull = $state(false);
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

  /**
   * The new config as it will be saved, and what intake makes of it: only
   * worked out while the review step is open (writing a big config out takes
   * a moment). `output` is the chosen app's file (Stash's YAML differs a
   * little); Shadowrocket gets its two files in `shadowrocket`.
   */
  review = $derived.by(() => {
    void this.version;
    if (this.step !== 'review' || !this.doc || this.original === null) return null;
    const plainOutput = writeYaml(this.doc, this.original);
    // From a subscription URL: the linked version too (PLAN.md Q8, Q28).
    // Linking uses mihomo's provider settings, so mihomo apps only.
    const url = this.source?.kind === 'url' && (this.app ?? 'mihomo') === 'mihomo' ? this.source.url : undefined;
    let plan: LinkPlan | null = null;
    let linkedOutput: string | null = null;
    if (url) {
      const start = intake(this.original);
      if (start.ok) {
        const opts: { intervalSeconds?: number; format?: string } = {};
        if (this.updateSeconds !== undefined) opts.intervalSeconds = this.updateSeconds;
        if (this.source?.format) opts.format = this.source.format;
        plan = planLink(start.data, this.data, url, opts);
        if (plan.ok) linkedOutput = writeYaml(linkedCopy(this.doc, plan), this.original);
      }
    }
    const mihomo = this.linkServers && linkedOutput !== null ? linkedOutput : plainOutput;
    const result = intake(mihomo);
    let output = mihomo;
    let dropped: Dropped[] = [];
    let shadowrocket: ShadowrocketFiles | null = null;
    if (result.ok && this.app === 'stash') ({ text: output, dropped } = toStash(result.doc, mihomo));
    if (result.ok && this.app === 'shadowrocket') {
      shadowrocket = toShadowrocket(result.data);
      dropped = shadowrocket.dropped;
    }
    return { output, plainOutput, linkedOutput, plan, linked: mihomo === linkedOutput, result, dropped, shadowrocket };
  });

  /**
   * Reads what was remembered last time and keeps remembering from now on.
   * Called once when the page starts (not in tests, which start clean).
   */
  startMemory(): () => void {
    this.rememberedUrl = recallUrl();
    const app = recall('app');
    if (app && TARGET_APPS.some((a) => a.id === app)) this.app = app as AppId;
    if (recall('link') === 'false') this.linkServers = false;
    const saved = recall('session');
    if (saved) {
      // Only the name is read now; the whole thing is checked on Carry on.
      let name = '';
      try {
        const source = (JSON.parse(saved) as { source?: { name?: unknown } }).source;
        if (typeof source?.name === 'string') name = source.name.slice(0, 100);
      } catch {
        forget('session', 'savedAt');
      }
      const at = Date.parse(recall('savedAt') ?? '');
      if (recall('session')) this.resumable = { name, when: Number.isNaN(at) ? null : new Date(at) };
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    // Returns a function that stops remembering (for tests).
    return $effect.root(() => {
      $effect(() => {
        const url = this.source?.kind === 'url' ? this.source.url : undefined;
        if (url) {
          remember('url', url);
          this.rememberedUrl = url;
        }
      });
      $effect(() => {
        if (this.app) remember('app', this.app);
      });
      $effect(() => {
        remember('link', String(this.linkServers));
      });
      $effect(() => {
        void this.version;
        const session = this.session;
        if (!session) return;
        // Written a moment after the last edit, not on every keystroke.
        clearTimeout(timer);
        timer = setTimeout(() => {
          this.memoryFull = !(remember('session', writeSettings(session)) && remember('savedAt', new Date().toISOString()));
          if (this.memoryFull) forget('session', 'savedAt');
        }, 400);
      });
    });
  }

  /** Brings back the remembered session (checked like a settings file). */
  resume(): ReadSettings {
    const saved = recall('session') ?? '';
    const r = this.restore(saved);
    if (!r.ok) forget('session', 'savedAt');
    this.resumable = null;
    return r;
  }

  startFresh(): void {
    forget('session', 'savedAt');
    this.resumable = null;
  }

  /** Clears everything remembered on this PC. */
  forgetAll(): void {
    forget();
    this.rememberedUrl = '';
    this.resumable = null;
  }

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
    // A server list (share links, SIP008) becomes a basic config first.
    let text: string | null = null;
    if (typeof input === 'string') text = input;
    else {
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(input);
      } catch {
        text = null; // not text: intake says so
      }
    }
    const read = text !== null && text.length <= LIMITS.maxBytes ? readInput(text) : null;
    const converted = read && read.format !== 'clash' ? read : null;
    const result = intake(converted ? converted.text : input);
    this.converted = converted;
    this.source = converted ? { ...source, format: converted.format as 'links' | 'sip008' } : source;
    this.checked = result;
    this.original = result.ok ? (converted ? converted.text : (text ?? '')) : null;
    this.ticked = result.ok ? result.findings.map((f) => !!(f.fix && f.fixByDefault)) : [];
    this.session = null;
    this.doc = null;
    this.edits = [];
    this.usage = null;
    this.updateSeconds = undefined;
    this.linkServers = true;
    this.reached = STEPS.indexOf('report');
    this.step = 'report';
  }

  /** Fetches a subscription URL and runs intake on what comes back. */
  async checkUrl(url: string): Promise<FetchResult> {
    const r = await fetchSubscription(url.trim());
    if (r.ok) {
      const name = readTitle(r.profileTitle, r.contentDisposition);
      this.check(r.body, name ? { kind: 'url', url: url.trim(), name } : { kind: 'url', url: url.trim() });
      this.usage = readUsage(r.userinfo);
      this.updateSeconds = readInterval(r.updateInterval);
    }
    return r;
  }

  /**
   * Update from my subscription (PLAN.md Q32): fetches the latest config
   * and re-applies the user's edits to it. With no conflicts it's done at
   * once; otherwise it waits for answers (finishUpdate).
   */
  async startUpdate(): Promise<void> {
    const url = this.source?.kind === 'url' ? this.source.url : undefined;
    if (!url || !this.session || !this.doc) return;
    this.updateError = '';
    this.updateReport = null;
    this.fetchingUpdate = true;
    try {
      const r = await fetchSubscription(url);
      if (!r.ok) {
        this.updateError = r.code + (r.detail ? `|${r.detail}` : '');
        return;
      }
      const read = readInput(r.body);
      const start = intake(this.session.original);
      if (!start.ok) return;
      const plan = planRebase(start.data, this.data, read.text);
      if ('ok' in plan) {
        this.updateError = `refused|${plan.refusal.code}`;
        return;
      }
      this.usage = readUsage(r.userinfo) ?? this.usage;
      this.updateSeconds = readInterval(r.updateInterval) ?? this.updateSeconds;
      this.updating = { plan, text: read.text, conflicts: plan.conflicts, format: read.format };
      if (plan.conflicts.length === 0) this.finishUpdate({});
    } finally {
      this.fetchingUpdate = false;
    }
  }

  /** Applies a waiting update with the user's answers (unanswered: the suggested one). */
  finishUpdate(choices: Readonly<Record<string, Choice>>): void {
    const u = this.updating;
    if (!u || !this.session) return;
    const r = u.plan.apply(choices);
    this.updating = null;
    if (!r.ok) {
      this.updateError = `refused|${r.refusal.code}`;
      return;
    }
    const before = this.session;
    const section = this.section;
    const { format: _old, ...plainSource } = before.source;
    void _old;
    const source: Source = u.format === 'clash' ? plainSource : { ...plainSource, format: u.format };
    const next: Session = { ...before, source, original: u.text, changes: r.changes };
    this.source = source;
    if (!this.load(next)) {
      this.updateError = 'refused|not-yaml';
      return;
    }
    this.original = u.text;
    this.checked = intake(u.text);
    this.beforeUpdate = before;
    this.updateReport = { applied: r.applied, notes: r.notes };
    // Stay where the user was.
    this.section = section;
    this.reached = Math.max(this.reached, STEPS.indexOf('edit'));
  }

  cancelUpdate(): void {
    this.updating = null;
  }

  /** Puts back the session from before the last update. */
  undoUpdate(): void {
    const before = this.beforeUpdate;
    if (!before) return;
    const section = this.section;
    if (this.load(before)) {
      this.original = before.original;
      this.source = before.source;
      this.checked = intake(before.original);
      this.section = section;
    }
    this.beforeUpdate = null;
    this.updateReport = null;
  }

  toggleFix(index: number): void {
    this.ticked = this.ticked.map((v, i) => (i === index ? !v : v));
  }

  /** Starts the session with the ticked fixes and moves on to editing. */
  startEditing(): void {
    // Advanced mode has no app step: mihomo unless the bar says otherwise.
    if (!this.app && this.mode === 'advanced') this.app = 'mihomo';
    if (!this.checked?.ok || this.original === null || !this.source || !this.app) return;
    const fixes: Finding[] = this.checked.findings.filter((f, i) => f.fix && this.ticked[i]);
    this.load(startSession(this.original, this.source, this.app, this.mode, fixes));
    this.advance('edit');
  }

  /**
   * Scratch mode's last step (PLAN.md Q23): the built config becomes an
   * ordinary session, opened at Review and save, or for editing in Simple or
   * Advanced mode. False if it somehow fails the safety checks.
   */
  finishScratch(text: string, source: Source, then: 'review' | 'simple' | 'advanced'): boolean {
    this.check(text, source);
    if (!this.checked?.ok) return false;
    this.ticked = this.checked.findings.map(() => false);
    this.mode = then === 'advanced' ? 'advanced' : 'simple';
    this.startEditing();
    if (then === 'review') this.advance('review');
    return this.session !== null;
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
    this.converted = null;
    if (!this.load(s)) return { ok: false, error: 'bad-change' };
    this.reached = STEPS.indexOf('review');
    this.step = 'edit';
    return r;
  }

  /** Back to bringing in a config, keeping the app. */
  restart(): void {
    this.converted = null;
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

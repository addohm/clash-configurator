/**
 * Scratch mode's state (PLAN.md Q23, Q35): the steps, and the choices made
 * so far. Kept here, not in the component, so switching modes and back
 * doesn't lose them. The finished config becomes an ordinary session
 * (store.finishScratch).
 */
import {
  intake,
  LIST_IDS,
  type ListId,
  readInput,
  type ReadInput,
  type Refusal,
  type Server,
  type Source,
} from '../../../core/src';
import { type FetchResult, fetchSubscription, readTitle } from '../lib/fetch';

export const SCRATCH_STEPS = ['app', 'servers', 'groups', 'rules', 'dns', 'done'] as const;
export type ScratchStepId = (typeof SCRATCH_STEPS)[number];

class Scratch {
  step: ScratchStepId = $state('app');
  /** The furthest step opened so far. */
  reached = $state(0);
  /** Big lists are replaced whole, never edited in place. */
  servers: readonly Server[] = $state.raw([]);
  /** Where the servers came from: pasted, or a subscription URL (kept linked, Q8). */
  source: Source | null = $state.raw(null);
  skipped: NonNullable<ReadInput['skipped']> = $state.raw([]);
  refusal: Refusal | null = $state.raw(null);
  auto = $state(true);
  countries = $state(true);
  lists: ListId[] = $state([...LIST_IDS]);
  dns = $state(true);

  go(step: ScratchStepId): void {
    const i = SCRATCH_STEPS.indexOf(step);
    this.reached = Math.max(this.reached, i);
    this.step = step;
  }

  open(step: ScratchStepId): void {
    if (SCRATCH_STEPS.indexOf(step) <= this.reached) this.step = step;
  }

  /** Reads servers from pasted text: share links, a server list, or a whole Clash config (its servers only). */
  read(text: string, source: Source): void {
    const read = readInput(text);
    const r = intake(read.text);
    this.skipped = read.skipped ?? [];
    if (!r.ok) {
      this.refusal = r.refusal;
      this.servers = [];
      return;
    }
    this.refusal = null;
    const proxies = r.data['proxies'];
    this.servers = Array.isArray(proxies) ? (proxies.filter((p) => p !== null && typeof p === 'object') as Server[]) : [];
    this.source = read.format === 'clash' ? { ...source, scratch: true } : { ...source, format: read.format, scratch: true };
  }

  async readUrl(url: string): Promise<FetchResult> {
    const r = await fetchSubscription(url.trim());
    if (r.ok) {
      const name = readTitle(r.profileTitle, r.contentDisposition);
      this.read(r.body, name ? { kind: 'url', url: url.trim(), name } : { kind: 'url', url: url.trim() });
    }
    return r;
  }

  reset(): void {
    this.step = 'app';
    this.reached = 0;
    this.servers = [];
    this.source = null;
    this.skipped = [];
    this.refusal = null;
    this.auto = true;
    this.countries = true;
    this.lists = [...LIST_IDS];
    this.dns = true;
  }
}

export const scratch = new Scratch();

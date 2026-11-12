/**
 * The comparison the review step shows: the original config next to the
 * new one, line by line, only where they differ (with a little context).
 * Line endings are ignored, so a CRLF original compares cleanly.
 *
 * Edits keep a config's shape, but one rename can touch thousands of rule
 * lines all through the file, which makes an ordinary line diff very slow.
 * So this is a patience diff: lines that appear exactly once in both files
 * anchor the comparison (in order), and only the small gaps between anchors
 * are compared closely.
 */

export interface DiffLine {
  kind: 'same' | 'removed' | 'added';
  text: string;
  /** Line numbers in the original and the new config, where the line exists. */
  oldNo?: number;
  newNo?: number;
}

export interface Hunk {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface Comparison {
  hunks: Hunk[];
  added: number;
  removed: number;
}

/** One step from the original to the new lines: keep, remove or add. */
type Op = { kind: 'same'; a: number; b: number } | { kind: 'removed'; a: number } | { kind: 'added'; b: number };

/** Gaps up to this many cells (lines x lines) get an exact comparison; bigger ones are shown as replaced. */
const EXACT_LIMIT = 250_000;

/** The longest increasing run of `values` (patience sorting), as positions into it. */
function longestIncreasing(values: number[]): number[] {
  const tails: number[] = [];
  const prev = new Array<number>(values.length).fill(-1);
  values.forEach((v, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((values[tails[mid] ?? 0] ?? 0) < v) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1] ?? -1;
    tails[lo] = i;
  });
  const out: number[] = [];
  for (let i = tails[tails.length - 1] ?? -1; i !== -1; i = prev[i] ?? -1) out.push(i);
  return out.reverse();
}

/** An exact comparison of a small gap (longest common subsequence). */
function exact(a: string[], b: string[], a0: number, a1: number, b0: number, b1: number, out: Op[]): void {
  const n = a1 - a0;
  const m = b1 - b0;
  if (n === 0 || m === 0 || n * m > EXACT_LIMIT) {
    // Nothing to match, or too big to do closely: everything removed, then added.
    for (let i = a0; i < a1; i++) out.push({ kind: 'removed', a: i });
    for (let j = b0; j < b1; j++) out.push({ kind: 'added', b: j });
    return;
  }
  const w = m + 1;
  const len = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      len[i * w + j] = a[a0 + i] === b[b0 + j] ? (len[(i + 1) * w + j + 1] ?? 0) + 1 : Math.max(len[(i + 1) * w + j] ?? 0, len[i * w + j + 1] ?? 0);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[a0 + i] === b[b0 + j]) {
      out.push({ kind: 'same', a: a0 + i++, b: b0 + j++ });
    } else if ((len[(i + 1) * w + j] ?? 0) >= (len[i * w + j + 1] ?? 0)) {
      out.push({ kind: 'removed', a: a0 + i++ });
    } else {
      out.push({ kind: 'added', b: b0 + j++ });
    }
  }
  for (; i < n; i++) out.push({ kind: 'removed', a: a0 + i });
  for (; j < m; j++) out.push({ kind: 'added', b: b0 + j });
}

function patience(a: string[], b: string[], a0: number, a1: number, b0: number, b1: number, out: Op[]): void {
  // Matching lines at the start and end need no work.
  while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) out.push({ kind: 'same', a: a0++, b: b0++ });
  const tail: Op[] = [];
  while (a1 > a0 && b1 > b0 && a[a1 - 1] === b[b1 - 1]) tail.push({ kind: 'same', a: --a1, b: --b1 });

  // Lines that appear exactly once on each side.
  const count = new Map<string, { a: number; b: number; ai: number; bi: number }>();
  for (let i = a0; i < a1; i++) {
    const c = count.get(a[i] ?? '') ?? { a: 0, b: 0, ai: i, bi: -1 };
    c.a++;
    c.ai = i;
    count.set(a[i] ?? '', c);
  }
  for (let j = b0; j < b1; j++) {
    const c = count.get(b[j] ?? '');
    if (c) {
      c.b++;
      c.bi = j;
    }
  }
  const anchors = [...count.values()].filter((c) => c.a === 1 && c.b === 1).sort((x, y) => x.ai - y.ai);

  if (anchors.length === 0) {
    exact(a, b, a0, a1, b0, b1, out);
  } else {
    // The anchors that stay in order on both sides.
    const keep = longestIncreasing(anchors.map((c) => c.bi)).map((k) => anchors[k]);
    let ai = a0;
    let bi = b0;
    for (const c of keep) {
      if (!c) continue;
      patience(a, b, ai, c.ai, bi, c.bi, out);
      out.push({ kind: 'same', a: c.ai, b: c.bi });
      ai = c.ai + 1;
      bi = c.bi + 1;
    }
    patience(a, b, ai, a1, bi, b1, out);
  }
  out.push(...tail.reverse());
}

const split = (t: string): string[] => {
  const lines = t.replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
};

export function compareConfigs(original: string, edited: string, context = 2): Comparison {
  const a = split(original);
  const b = split(edited);
  const ops: Op[] = [];
  patience(a, b, 0, a.length, 0, b.length, ops);

  // Group the changes into hunks, with `context` unchanged lines around each.
  const changed = ops.map((o) => o.kind !== 'same');
  const show = new Array<boolean>(ops.length).fill(false);
  changed.forEach((c, i) => {
    if (!c) return;
    for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) show[k] = true;
  });
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  let added = 0;
  let removed = 0;
  ops.forEach((o, i) => {
    if (!show[i]) {
      current = null;
      return;
    }
    const line: DiffLine =
      o.kind === 'same'
        ? { kind: 'same', text: a[o.a] ?? '', oldNo: o.a + 1, newNo: o.b + 1 }
        : o.kind === 'removed'
          ? { kind: 'removed', text: a[o.a] ?? '', oldNo: o.a + 1 }
          : { kind: 'added', text: b[o.b] ?? '', newNo: o.b + 1 };
    if (o.kind === 'removed') removed++;
    if (o.kind === 'added') added++;
    if (!current) {
      current = { oldStart: line.oldNo ?? 0, newStart: line.newNo ?? 0, lines: [] };
      hunks.push(current);
    }
    current.lines.push(line);
  });
  return { hunks, added, removed };
}

/** File names for what's saved, from where the config came from. */
export function outputNames(source: { kind: string; name?: string }): { config: string; settings: string } {
  const base = source.name ? source.name.replace(/\.(ya?ml|txt|conf|json)$/i, '') : 'config';
  return { config: `${base} (edited).yaml`, settings: `${base}.ccsettings.json` };
}

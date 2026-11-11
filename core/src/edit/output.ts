/**
 * Writes the edited document back out as mihomo YAML, keeping the original
 * exactly as it was wherever nothing changed (PLAN.md Q8), so the review's
 * comparison shows only real changes.
 *
 * Configs aren't consistent (one file may indent its DNS by four spaces and
 * its servers by two, or pad `{ a: 1 }` but not `[a, b]`), and the YAML
 * library writes everything one way. So the output is spliced from the
 * original text: walking the original and edited documents together, an
 * entry whose value is unchanged is copied from the original character for
 * character; a block map or list that changed inside is opened up and the
 * same is done one level down; only what is new, or changed in itself, is
 * written by the YAML library, at the original's indentation.
 */
import { Document, isMap, isScalar, isSeq, type Node, Pair, parseDocument, YAMLMap, YAMLSeq } from 'yaml';
import { LIMITS } from '../intake';

interface Style {
  /** Spaces per level. */
  indent: number;
  /** `key:\n  - item` (true) or `key:\n- item` (false). */
  indentSeq: boolean;
  /** `{ a: 1 }` (true) or `{a: 1}` (false). */
  flowPadding: boolean;
}

/** Reads a piece of YAML's layout habits; where it shows none, the YAML library's defaults. */
export function detectStyle(text: string): Style {
  const lines = text.split(/\r?\n/);
  let indented = 0;
  let flush = 0;
  const steps = new Map<number, number>();
  for (let i = 0; i + 1 < lines.length; i++) {
    const m = /^(\s*)[^\s#-][^:#]*:\s*(#.*)?$/.exec(lines[i] ?? '');
    if (!m) continue;
    const parent = (m[1] ?? '').length;
    const nextLine = lines[i + 1] ?? '';
    if (nextLine.trim() === '' || nextLine.trimStart().startsWith('#')) continue;
    const child = nextLine.length - nextLine.trimStart().length;
    if (/^\s*- /.test(nextLine)) {
      if (child > parent) indented++;
      else if (child === parent) flush++;
    }
    if (child > parent) steps.set(child - parent, (steps.get(child - parent) ?? 0) + 1);
  }
  let indent = 2;
  let best = 0;
  for (const [step, n] of steps) if (n > best || (n === best && step < indent)) [indent, best] = [step, n];
  const padded = (text.match(/[{[] \S/g) ?? []).length;
  const tight = (text.match(/[{[][^\s\]}]/g) ?? []).length;
  return { indent, indentSeq: !(flush > indented), flowPadding: !(tight > padded) };
}

const options = (s: Style) => ({
  // Never fold long lines: a folded rule or URL is harder to read and diff.
  lineWidth: 0,
  indent: s.indent,
  indentSeq: s.indentSeq,
  flowCollectionPadding: s.flowPadding,
  // A piece written on its own may use an anchor defined elsewhere.
  verifyAliasOrder: false,
});

const rangeOf = (n: unknown): [number, number, number] | null =>
  (n as { range?: [number, number, number] | null } | null)?.range ?? null;
const json = (v: unknown): string => JSON.stringify(v ?? null);
const sameKind = (a: unknown, b: unknown) => (isMap(a) && isMap(b)) || (isSeq(a) && isSeq(b));

class Splicer {
  constructor(private readonly src: string) {}

  private lineStart(offset: number): number {
    return this.src.lastIndexOf('\n', offset - 1) + 1;
  }

  /** Start of the line after the one holding `offset`, but no further than `limit`. */
  private nextLine(offset: number, limit: number): number {
    const nl = this.src.indexOf('\n', offset);
    return nl === -1 || nl + 1 > limit ? limit : nl + 1;
  }

  private column(offset: number): number {
    return offset - this.lineStart(offset);
  }

  /** The comment and blank lines at the end of [.., to), after the node ending at `end`. */
  private notesAfter(end: number, to: number): string {
    const from = this.nextLine(Math.max(0, end - 1), to);
    const tail = this.src.slice(from, to);
    return tail.split('\n').every((l) => l.trim() === '' || l.trimStart().startsWith('#')) ? tail : '';
  }

  /** A block collection with source positions: one that can be opened up. */
  private openable(n: unknown): n is YAMLMap | YAMLSeq {
    return (isMap(n) || isSeq(n)) && !n.flow && rangeOf(n) !== null;
  }

  /** Writes a pair or a list item on its own, indented to `column`, without the comments around it. */
  private render(piece: { pair: Pair } | { item: unknown }, column: number, style: Style): string {
    const above = ('pair' in piece ? piece.pair.key : piece.item) as { commentBefore?: string | null; spaceBefore?: boolean } | null;
    const below = ('pair' in piece ? piece.pair.value : piece.item) as { comment?: string | null } | null;
    // Comments above and below stay in the original's text, so they
    // mustn't be written twice.
    const saved = { before: above?.commentBefore ?? null, space: above?.spaceBefore ?? false, after: below?.comment ?? null };
    if (above && typeof above === 'object') {
      above.commentBefore = null;
      above.spaceBefore = false;
    }
    if (below && typeof below === 'object') below.comment = null;
    try {
      const one = new Document(null, { merge: true, version: '1.2' });
      if ('pair' in piece) {
        const map = new YAMLMap();
        map.items.push(new Pair(piece.pair.key, piece.pair.value));
        one.contents = map;
      } else {
        const seq = new YAMLSeq();
        seq.items.push(piece.item);
        one.contents = seq;
      }
      const pad = ' '.repeat(column);
      const text = one.toString(options(style));
      return text
        .split('\n')
        .map((l) => (l === '' ? l : pad + l))
        .join('\n');
    } finally {
      if (above && typeof above === 'object') {
        above.commentBefore = saved.before;
        above.spaceBefore = saved.space;
      }
      if (below && typeof below === 'object') below.comment = saved.after;
    }
  }

  /**
   * The text for an original block map's entries, which run from `from`
   * (the line of its first key) to `to`, as the edited map has them.
   */
  map(orig: YAMLMap, origVal: Record<string, unknown>, cur: YAMLMap, curVal: Record<string, unknown>, from: number, to: number): string {
    const pairs = orig.items as Pair[];
    const keyAt = pairs.map((p) => rangeOf(p.key)?.[0] ?? from);
    const starts = keyAt.map((k) => this.lineStart(k));
    const slots = new Map<string, number>();
    pairs.forEach((p, i) => {
      if (isScalar(p.key) && typeof p.key.value === 'string') slots.set(p.key.value, i);
    });
    const style = detectStyle(this.src.slice(from, to));
    const column = pairs.length > 0 ? this.column(keyAt[0] ?? from) : 0;
    // A map that is a list item starts on the dash line ("  - name: a").
    const firstPrefix = pairs.length > 0 ? this.src.slice(starts[0] ?? from, keyAt[0] ?? from) : '';
    const onDash = firstPrefix.includes('-');

    let out = this.src.slice(from, starts[0] ?? to);
    (cur.items as Pair[]).forEach((p, n) => {
      const key = isScalar(p.key) && typeof p.key.value === 'string' ? p.key.value : null;
      const i = key === null ? undefined : slots.get(key);
      let text: string;
      if (i === undefined || key === null) {
        text = this.render({ pair: p }, column, style);
      } else {
        const s = starts[i] ?? from;
        const e = starts[i + 1] ?? to;
        text = this.entry(pairs[i]?.value, origVal[key], p.value, curVal[key], s, e, () => this.render({ pair: p }, column, style));
      }
      // The first entry of a list item's map carries the dash: put it back
      // if this entry was written fresh (or came from another place).
      if (n === 0 && onDash && !text.startsWith(firstPrefix)) text = firstPrefix + text.slice(column);
      out += text;
    });
    return out;
  }

  /** The same for a block list: unchanged items are matched in order and copied. */
  seq(orig: YAMLSeq, origVal: unknown[], cur: YAMLSeq, curVal: unknown[], from: number, to: number): string {
    const items = orig.items;
    const starts = items.map((n) => this.lineStart(rangeOf(n)?.[0] ?? from));
    const style = detectStyle(this.src.slice(from, to));
    const firstLine = this.src.slice(starts[0] ?? from, this.nextLine(starts[0] ?? from, to));
    const dash = Math.max(0, firstLine.indexOf('-'));
    // Where each original value is, to find unchanged items quickly.
    const where = new Map<string, number[]>();
    origVal.forEach((v, i) => {
      const k = json(v);
      const list = where.get(k);
      if (list) list.push(i);
      else where.set(k, [i]);
    });
    let next = 0; // the first original item not yet used
    let out = this.src.slice(from, starts[0] ?? to);
    cur.items.forEach((item, i) => {
      const found = (where.get(json(curVal[i])) ?? []).find((x) => x >= next);
      if (found !== undefined && rangeOf(items[found]) !== null) {
        next = found + 1;
        out += this.src.slice(starts[found] ?? from, starts[found + 1] ?? to);
        return;
      }
      // Changed inside (one server's port, say): open up the original item
      // in this place, if it's the same kind of block.
      const here = items[next];
      if (here && this.openable(here) && sameKind(here, item) && !(item as YAMLMap).flow) {
        const s = starts[next] ?? from;
        const e = starts[next + 1] ?? to;
        out += this.entry(here, origVal[next], item, curVal[i], s, e, () => this.render({ item }, dash, style), true);
        next++;
        return;
      }
      out += this.render({ item }, dash, style);
    });
    return out;
  }

  /**
   * One entry (a map's pair, or a list item when `isItem`) occupying
   * [from, to) of the original: copied if unchanged, opened up if both
   * versions are block collections, or else written fresh by `write`.
   */
  private entry(origNode: unknown, origVal: unknown, curNode: unknown, curVal: unknown, from: number, to: number, write: () => string, isItem = false): string {
    if (json(origVal) === json(curVal)) return this.src.slice(from, to);
    const r = rangeOf(origNode);
    if (r && this.openable(origNode) && sameKind(origNode, curNode) && !(curNode as YAMLMap).flow) {
      // Keep the line(s) that open the entry (its key and any comments
      // after it), then splice the inside.
      const inner = isItem ? from : this.lineStart(r[0]);
      const notes = this.notesAfter(r[1], to);
      const end = to - notes.length;
      const head = this.src.slice(from, inner);
      const body = isMap(origNode)
        ? this.map(origNode, (origVal ?? {}) as Record<string, unknown>, curNode as YAMLMap, (curVal ?? {}) as Record<string, unknown>, inner, end)
        : this.seq(origNode as YAMLSeq, (origVal ?? []) as unknown[], curNode as YAMLSeq, (curVal ?? []) as unknown[], inner, end);
      return head + body + notes;
    }
    const notes = this.notesAfter(r?.[1] ?? from, to);
    const text = write();
    return text + (text.endsWith('\n') ? '' : '\n') + notes;
  }
}

const asNode = (n: unknown): Node | null => (n !== null && typeof n === 'object' ? (n as Node) : null);

export function writeYaml(doc: Document, original: string): string {
  const crlf = /\r\n/.test(original);
  const src = original.replace(/\r\n/g, '\n');
  const finish = (t: string) => (crlf ? t.replace(/\n/g, '\r\n') : t);
  const whole = () => finish(doc.toString(options(detectStyle(src))));

  const origDoc = parseDocument(src, { merge: true, uniqueKeys: true, version: '1.2', schema: 'core' });
  const origRoot = asNode(origDoc.contents);
  const curRoot = asNode(doc.contents);
  if (origDoc.errors.length > 0 || !isMap(origRoot) || origRoot.flow || !isMap(curRoot) || curRoot.flow) return whole();
  const firstKey = rangeOf(origRoot.items[0]?.key)?.[0];
  if (firstKey === undefined) return whole();
  const origVal = (origDoc.toJS({ maxAliasCount: LIMITS.maxAliasCount }) ?? {}) as Record<string, unknown>;
  const curVal = (doc.toJS({ maxAliasCount: LIMITS.maxAliasCount }) ?? {}) as Record<string, unknown>;
  const start = src.lastIndexOf('\n', firstKey - 1) + 1;
  const body = new Splicer(src).map(origRoot, origVal, curRoot, curVal, start, src.length);
  return finish(src.slice(0, start) + body);
}

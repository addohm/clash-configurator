/**
 * Writes the edited document back out as mihomo YAML, laid out like the
 * original where the YAML library allows: comments, key order, quoting and
 * flow or block style come from the parsed nodes; list indentation and
 * spacing inside {} are matched to the original here.
 */
import type { Document } from 'yaml';

interface Style {
  /** `key:\n  - item` (true) or `key:\n- item` (false). */
  indentSeq: boolean;
  /** `{ a: 1 }` (true) or `{a: 1}` (false). */
  flowPadding: boolean;
}

/** Reads the original's habits; when it shows none, the YAML library's defaults. */
export function detectStyle(original: string): Style {
  const lines = original.split(/\r?\n/);
  let indented = 0;
  let flush = 0;
  for (let i = 0; i + 1 < lines.length; i++) {
    const m = /^(\s*)[^\s#-][^:#]*:\s*(#.*)?$/.exec(lines[i] ?? '');
    if (!m) continue;
    const next = /^(\s*)- /.exec(lines[i + 1] ?? '');
    if (!next) continue;
    if ((next[1] ?? '').length > (m[1] ?? '').length) indented++;
    else if ((next[1] ?? '').length === (m[1] ?? '').length) flush++;
  }
  const padded = (original.match(/[{[] \S/g) ?? []).length;
  const tight = (original.match(/[{[][^\s\]}]/g) ?? []).length;
  return { indentSeq: flush > indented ? false : true, flowPadding: tight > padded ? false : true };
}

export function writeYaml(doc: Document, original: string): string {
  const style = detectStyle(original);
  const text = doc.toString({
    // Never fold long lines: a folded rule or URL is harder to read and diff.
    lineWidth: 0,
    indentSeq: style.indentSeq,
    flowCollectionPadding: style.flowPadding,
  });
  // Keep the original's line endings.
  return /\r\n/.test(original) ? text.replace(/\r?\n/g, '\r\n') : text;
}

/**
 * Applies the fixes the user kept ticked to the document. Values are set on
 * the existing node where there is one, so its comments and quoting stay.
 */
import { type Document, isScalar } from 'yaml';
import type { Edit, Finding } from './checks';

export function applyEdit(doc: Document, edit: Edit): void {
  if (edit.kind === 'delete') {
    doc.deleteIn(edit.path);
    return;
  }
  const node = doc.getIn(edit.path, true);
  if (isScalar(node)) node.value = edit.value;
  else doc.setIn(edit.path, edit.value);
}

/** Applies every fix of the given findings, in order. */
export function applyFixes(doc: Document, findings: readonly Finding[]): void {
  for (const f of findings) for (const edit of f.fix ?? []) applyEdit(doc, edit);
}

/** The findings whose fix starts ticked. */
export function defaultFixes(findings: readonly Finding[]): Finding[] {
  return findings.filter((f) => f.fix && f.fixByDefault);
}

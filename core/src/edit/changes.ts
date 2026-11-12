/**
 * Changes: the user's edits to a config, kept as a list on top of the
 * original (PLAN.md Q8, Q9). The saved settings file is the original plus
 * this list, so loading it rebuilds the same config.
 *
 * Values are plain data, written into the document by the YAML library, so a
 * typed value can't smuggle in extra settings (Q4): a name containing a
 * newline stays one quoted name.
 */
import { type Document, isCollection, isMap, isScalar, isSeq, type YAMLSeq } from 'yaml';
import type { Path } from '../intake';

/** Plain data a change can write: what YAML and JSON can both hold. */
export type Value = string | number | boolean | null | Value[] | { [key: string]: Value };

export type Change =
  /** Set a value (creating the maps on the way if they're missing). */
  | { op: 'set'; path: Path; value: Value }
  /** Remove a key, or an item from a list. */
  | { op: 'delete'; path: Path }
  /** Insert an item into the list at `path`, before `index` (or at the end). */
  | { op: 'insert'; path: Path; index?: number; value: Value }
  /** Move a list item from one position to another. */
  | { op: 'move'; path: Path; from: number; to: number };

export class ChangeError extends Error {}

/** The long lists at the end of most configs. */
const BIG_SECTIONS = new Set(['proxies', 'proxy-providers', 'proxy-groups', 'rule-providers', 'rules', 'sub-rules']);

/** Limits on a change, so a settings file can't hide something huge in one. */
const MAX_VALUE_NODES = 50_000;
const MAX_VALUE_DEPTH = 32;
const MAX_PATH = 32;
const POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function checkKey(key: string): void {
  if (POISON_KEYS.has(key)) throw new ChangeError(`key not allowed: ${key}`);
  if (CONTROL.test(key)) throw new ChangeError('key has control characters');
}

function checkPath(path: unknown): asserts path is Path {
  if (!Array.isArray(path) || path.length > MAX_PATH) throw new ChangeError('bad path');
  for (const p of path) {
    if (typeof p === 'string') checkKey(p);
    else if (!(typeof p === 'number' && Number.isInteger(p) && p >= 0)) throw new ChangeError('bad path');
  }
}

function checkIndex(i: unknown, name: string): asserts i is number {
  if (!(typeof i === 'number' && Number.isInteger(i) && i >= 0)) throw new ChangeError(`bad ${name}`);
}

/** Checks a value is plain data within the limits. */
function checkValue(value: unknown): asserts value is Value {
  let nodes = 0;
  const walk = (v: unknown, depth: number): void => {
    if (++nodes > MAX_VALUE_NODES || depth > MAX_VALUE_DEPTH) throw new ChangeError('value too big');
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new ChangeError('bad number');
      return;
    }
    if (typeof v === 'string') {
      if (CONTROL.test(v)) throw new ChangeError('value has control characters');
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item, depth + 1);
      return;
    }
    if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      for (const [k, item] of Object.entries(v)) {
        checkKey(k);
        walk(item, depth + 1);
      }
      return;
    }
    throw new ChangeError('not plain data');
  };
  walk(value, 0);
}

/**
 * Checks that something read from a file is a well-formed change, and
 * returns it typed. Settings files are treated as hostile (Q4).
 */
export function validateChange(input: unknown): Change {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new ChangeError('not a change');
  const c = input as Record<string, unknown>;
  checkPath(c['path']);
  const path = c['path'];
  switch (c['op']) {
    case 'set':
      checkValue(c['value']);
      if (path.length === 0) throw new ChangeError('bad path');
      return { op: 'set', path, value: c['value'] };
    case 'delete':
      if (path.length === 0) throw new ChangeError('bad path');
      return { op: 'delete', path };
    case 'insert': {
      checkValue(c['value']);
      if (c['index'] === undefined) return { op: 'insert', path, value: c['value'] };
      checkIndex(c['index'], 'index');
      return { op: 'insert', path, index: c['index'], value: c['value'] };
    }
    case 'move':
      checkIndex(c['from'], 'from');
      checkIndex(c['to'], 'to');
      return { op: 'move', path, from: c['from'], to: c['to'] };
    default:
      throw new ChangeError('unknown change');
  }
}

/**
 * Sets a value whose top-level section doesn't exist yet: the section is
 * made, with the maps on the way, and goes above the servers, groups and
 * rules, with the other settings, not after thousands of rules. Returns
 * false if the section exists (the caller sets the value normally).
 */
function setInNewSection(doc: Document, path: Path, value: Value): boolean {
  const [key, ...rest] = path;
  if (typeof key !== 'string' || !isMap(doc.contents) || doc.has(key)) return false;
  if (rest.some((p) => typeof p !== 'string')) return false;
  const nested = (rest as string[]).reduceRight<Value>((acc, k) => ({ [k]: acc }), value);
  const items = doc.contents.items;
  const at = items.findIndex((p) => isScalar(p.key) && typeof p.key.value === 'string' && BIG_SECTIONS.has(p.key.value));
  items.splice(at === -1 ? items.length : at, 0, doc.createPair(key, nested));
  return true;
}

function seqAt(doc: Document, path: Path, create: boolean): YAMLSeq {
  const node = path.length === 0 ? doc.contents : doc.getIn(path, true);
  if (isSeq(node)) return node;
  if (node === undefined && create && path.length > 0) {
    if (!setInNewSection(doc, path, [])) doc.setIn(path, doc.createNode([]));
    const made = doc.getIn(path, true);
    if (isSeq(made)) return made;
  }
  throw new ChangeError(`not a list: ${path.join('.')}`);
}

/** Applies one change to the document. Throws ChangeError if it doesn't fit. */
export function applyChange(doc: Document, change: Change): void {
  switch (change.op) {
    case 'set': {
      const node = doc.getIn(change.path, true);
      const v = change.value;
      if (node === undefined && setInNewSection(doc, change.path, v)) return;
      const scalar = v === null || typeof v !== 'object';
      // Setting a scalar over a scalar keeps the node's comments and quoting.
      if (scalar && isScalar(node)) node.value = v;
      else {
        const created = doc.createNode(v);
        // A list or map replacing one written [a, b] or {a: 1} keeps that style.
        if (isCollection(node) && node.flow && isCollection(created)) created.flow = true;
        doc.setIn(change.path, created);
      }
      return;
    }
    case 'delete':
      if (!doc.hasIn(change.path)) throw new ChangeError(`nothing at ${change.path.join('.')}`);
      doc.deleteIn(change.path);
      return;
    case 'insert': {
      const seq = seqAt(doc, change.path, true);
      const index = change.index ?? seq.items.length;
      if (index > seq.items.length) throw new ChangeError('index past the end');
      seq.items.splice(index, 0, doc.createNode(change.value));
      return;
    }
    case 'move': {
      const seq = seqAt(doc, change.path, false);
      const n = seq.items.length;
      if (change.from >= n || change.to >= n) throw new ChangeError('index past the end');
      const [item] = seq.items.splice(change.from, 1);
      seq.items.splice(change.to, 0, item);
      return;
    }
  }
}

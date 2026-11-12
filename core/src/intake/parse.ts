/**
 * Reads untrusted text into a YAML document, or refuses it (PLAN.md Q4).
 *
 * Everything that comes in is treated as hostile: it is only ever read as
 * data (no custom tags, so nothing is constructed or run), with limits on
 * size, depth, node count and alias expansion checked before anything else
 * looks at it. The document stays the source of truth, so later edits keep
 * the original's order and comments (Q8, Q9).
 */
import { type Document, isAlias, isCollection, isMap, isScalar, parseAllDocuments, visit } from 'yaml';
import { LIMITS, type Limits } from './limits';
import type { Refusal } from './refusal';

export interface Parsed {
  ok: true;
  doc: Document;
  /** A plain-object view of the document, for reading values. Never edit it. */
  data: Record<string, unknown>;
}

export type ParseResult = Parsed | { ok: false; refusal: Refusal };

const PARSE_OPTIONS = {
  version: '1.2',
  schema: 'core',
  // Clash configs use YAML merge keys (<<: *anchor) for shared group settings.
  merge: true,
  uniqueKeys: true,
  strict: true,
  prettyErrors: true,
} as const;

/** Keys that change how JavaScript objects behave. No Clash setting uses them. */
const POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Share-link schemes a subscription lists instead of a Clash config. */
// The name after # may hold raw spaces: some subscriptions don't encode them.
const SHARE_LINK = /^(vless|vmess|trojan|ss|ssr|hysteria2|hy2|hysteria|tuic|wireguard|anytls|socks5?|https?):\/\/[^\s#]+(#.*)?$/i;

function refuse(code: Refusal['code'], extra: Omit<Refusal, 'code'> = {}): ParseResult {
  return { ok: false, refusal: { code, ...extra } };
}

/** Decodes bytes as UTF-8, or returns null if they aren't text. */
function decode(input: string | Uint8Array): string | null {
  if (typeof input === 'string') return input;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    return null;
  }
}

function byteLength(input: string | Uint8Array): number {
  return typeof input === 'string' ? new TextEncoder().encode(input).length : input.length;
}

/** True if the text is a list of share links, plain or base64-encoded. */
export function looksLikeShareLinks(text: string): boolean {
  const lines = (t: string) =>
    t
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '');
  const plain = lines(text);
  if (plain.length > 0 && plain.every((l) => SHARE_LINK.test(l))) return true;
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 16 || !/^[A-Za-z0-9+/=_-]+$/.test(compact)) return false;
  try {
    const bin = atob(compact.replace(/-/g, '+').replace(/_/g, '/'));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const links = lines(decoded);
    return links.length > 0 && links.every((l) => SHARE_LINK.test(l));
  } catch {
    return false;
  }
}

/**
 * The deepest run of open flow brackets, ignoring quoted text. A cheap guard
 * against inputs like 100,000 nested `[`, run before the parser sees them.
 */
function bracketDepth(text: string): number {
  let depth = 0;
  let max = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
      else if (c === '\n') quote = null; // a stray quote shouldn't hide the rest of the file
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '#') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? text.length : nl;
    } else if (c === '[' || c === '{') max = Math.max(max, ++depth);
    else if ((c === ']' || c === '}') && depth > 0) depth--;
  }
  return max;
}

/** 1-based line of a character offset. */
function lineAt(text: string, offset: number | undefined): number | undefined {
  if (offset === undefined || offset < 0) return undefined;
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Reads `input`; `limits` can be lowered in tests. */
export function parseConfig(input: string | Uint8Array, limits: Limits = LIMITS): ParseResult {
  if (byteLength(input) > limits.maxBytes) return refuse('too-big', { detail: `${limits.maxBytes} bytes` });
  const decoded = decode(input);
  if (decoded === null) return refuse('binary');
  const text = decoded.replace(/^﻿/, '');
  if (text.trim() === '') return refuse('empty');
  // Control characters other than tab, newline and carriage return.
  const control = text.search(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/);
  if (control !== -1) return refuse('binary', { ...optLine(lineAt(text, control)) });
  if (/^\s*(<!doctype\s+html|<html|<head|<body|<\?xml)/i.test(text)) return refuse('html');
  if (looksLikeShareLinks(text)) return refuse('share-links');
  if (bracketDepth(text) > limits.maxBracketDepth) return refuse('too-deep', { detail: `${limits.maxDepth} levels` });

  let docs: Document.Parsed[];
  try {
    docs = parseAllDocuments(text, PARSE_OPTIONS) as Document.Parsed[];
  } catch (e) {
    if (e instanceof RangeError) return refuse('too-deep', { detail: `${limits.maxDepth} levels` });
    return refuse('not-yaml');
  }
  if (!Array.isArray(docs) || docs.length === 0) return refuse('empty');
  if (docs.length > 1) return refuse('multiple-documents', { detail: `${docs.length} documents` });
  const doc = docs[0] as Document.Parsed;

  const error = doc.errors[0];
  if (error) {
    const line = error.linePos?.[0].line;
    if (error.code === 'DUPLICATE_KEY') return refuse('duplicate-keys', optLine(line));
    return refuse('not-yaml', { ...optLine(line), detail: error.code });
  }

  const shape = checkShape(doc, text, limits);
  if (shape) return { ok: false, refusal: shape };

  let data: unknown;
  try {
    data = doc.toJS({ maxAliasCount: limits.maxAliasCount });
  } catch (e) {
    if (e instanceof ReferenceError && /alias/i.test(e.message)) return refuse('alias-bomb');
    if (e instanceof RangeError) return refuse('too-deep', { detail: `${limits.maxDepth} levels` });
    return refuse('not-yaml');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return refuse('not-a-map');
  const config = data as Record<string, unknown>;
  if (!hasServers(config)) return refuse('not-clash');
  return { ok: true, doc, data: config };
}

function optLine(line: number | undefined): { line?: number } {
  return line === undefined ? {} : { line };
}

/**
 * Walks the parsed document once: refuses explicit tags, keys that aren't
 * plain words, poison keys, too many nodes and too much nesting.
 */
function checkShape(doc: Document.Parsed, text: string, limits: Limits): Refusal | null {
  let nodes = 0;
  let found: Refusal | null = null;
  const at = (node: unknown) => {
    const range = (node as { range?: [number, number, number] } | null)?.range;
    return optLine(lineAt(text, range?.[0]));
  };
  visit(doc, {
    Node(_key, node, path) {
      if (++nodes > limits.maxNodes) {
        found = { code: 'too-many-nodes', detail: `${limits.maxNodes} nodes` };
        return visit.BREAK;
      }
      // Only collections count as levels; their pairs and values sit inside them.
      const depth = path.filter((p) => isCollection(p)).length;
      if (depth > limits.maxDepth) {
        found = { code: 'too-deep', detail: `${limits.maxDepth} levels`, ...at(node) };
        return visit.BREAK;
      }
      if (!isAlias(node) && node.tag) {
        found = { code: 'tags', detail: node.tag, ...at(node) };
        return visit.BREAK;
      }
      return undefined;
    },
    Pair(_key, pair) {
      const key = pair.key;
      if (isScalar(key)) {
        if (key.tag) {
          found = { code: 'tags', detail: key.tag, ...at(key) };
          return visit.BREAK;
        }
        if (typeof key.value === 'string' && POISON_KEYS.has(key.value)) {
          found = { code: 'bad-key', detail: key.value, ...at(key) };
          return visit.BREAK;
        }
        return undefined;
      }
      // Merge keys (<<: *anchor) are fine; complex keys (a list or map as a key) are not.
      if (key === null) return undefined;
      found = { code: 'bad-key', ...at(key) };
      return visit.BREAK;
    },
  });
  if (found) return found;
  if (doc.contents !== null && !isMap(doc.contents)) return { code: 'not-a-map' };
  return null;
}

/** A Clash config to edit has servers: a proxies list or proxy providers. */
function hasServers(config: Record<string, unknown>): boolean {
  const proxies = config['proxies'];
  const providers = config['proxy-providers'];
  const hasList = Array.isArray(proxies) && proxies.length > 0;
  const hasProviders = providers !== null && typeof providers === 'object' && Object.keys(providers).length > 0;
  return hasList || hasProviders;
}

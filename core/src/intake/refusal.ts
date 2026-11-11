/**
 * Why intake refused an input. The page turns the code into plain words
 * (app/src/i18n); `line` and `detail` add where and what, when known.
 */
export const REFUSAL_CODES = [
  'empty',
  'too-big',
  'binary',
  'html',
  'share-links',
  'not-yaml',
  'multiple-documents',
  'tags',
  'alias-bomb',
  'too-deep',
  'too-many-nodes',
  'duplicate-keys',
  'bad-key',
  'not-a-map',
  'not-clash',
] as const;

export type RefusalCode = (typeof REFUSAL_CODES)[number];

export interface Refusal {
  code: RefusalCode;
  /** 1-based line in the input, when the problem has one. */
  line?: number;
  /** A short technical detail: the key, tag or limit involved. */
  detail?: string;
}

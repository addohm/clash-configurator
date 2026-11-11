/**
 * Hard limits on what intake will read (PLAN.md Q4). Anything past them is
 * refused before it can slow down or freeze the page.
 */
export const LIMITS = {
  /** Bytes. Big provider configs with long inline rule lists stay well under this. */
  maxBytes: 8 * 1024 * 1024,
  /** Nested maps and lists. Real configs go about six deep. */
  maxDepth: 64,
  /** Flow brackets ([ and {) open at once, checked before parsing. */
  maxBracketDepth: 200,
  /** Nodes in the parsed document (aliases count once, not expanded). */
  maxNodes: 500_000,
  /**
   * The yaml library's alias guard: references to an anchor, times the
   * aliases nested inside it. A flat anchor can be used this many times;
   * nested "billion laughs" chains hit it after a few levels.
   */
  maxAliasCount: 10_000,
} as const;

export type Limits = { readonly [K in keyof typeof LIMITS]: number };

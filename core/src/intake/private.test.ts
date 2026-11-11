import { describe, expect, it } from 'vitest';
import { intake } from '.';

// Real configs dropped into fixtures/private/ (git-ignored, PLAN.md Q26).
// Each should be accepted: a refusal here means intake is too strict.
const PRIVATE = import.meta.glob<string>('../../../fixtures/private/*.{yaml,yml,txt,conf}', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const files = Object.entries(PRIVATE);

describe.skipIf(files.length === 0)('real configs in fixtures/private', () => {
  for (const [path, text] of files) {
    const name = path.split('/').pop() ?? path;
    it(`${name} is accepted`, () => {
      const result = intake(text);
      // Only the refusal code is shown, never the config's contents.
      expect(result.ok ? 'accepted' : `refused: ${result.refusal.code} line ${result.refusal.line ?? '?'}`).toBe('accepted');
    });
  }
});

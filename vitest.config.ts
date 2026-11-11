import { defineConfig } from 'vitest/config';

// Unit tests for the config core and the page's text, and tests/ (which may
// use Node, e.g. to run mihomo). They run in Node, with no browser.
export default defineConfig({
  test: {
    include: ['core/**/*.test.ts', 'app/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
  },
});

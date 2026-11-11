import { defineConfig } from 'vitest/config';

// Unit tests for the config core and the page's text. They run in Node, with
// no browser.
export default defineConfig({
  test: {
    include: ['core/**/*.test.ts', 'app/**/*.test.ts'],
    environment: 'node',
  },
});

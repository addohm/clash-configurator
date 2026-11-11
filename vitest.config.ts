import { defineConfig } from 'vitest/config';

// Unit tests for the config core. They run in Node, with no browser or UI.
export default defineConfig({
  test: {
    include: ['core/**/*.test.ts'],
    environment: 'node',
  },
});

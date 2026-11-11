import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Unit tests for the config core and the page, and tests/ (which may use
// Node, e.g. to run mihomo). They run in Node; page tests ask for a simulated
// browser with `// @vitest-environment happy-dom`.
export default defineConfig({
  plugins: [svelte()],
  // Svelte's browser build, so page tests can mount components.
  resolve: { conditions: ['browser'] },
  test: {
    include: ['core/**/*.test.ts', 'app/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
  },
});

import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The page lives in app/ and builds to dist/, which Tauri wraps into the app
// (src-tauri/tauri.conf.json) and a website can later serve as plain files.
export default defineConfig({
  root: 'app',
  plugins: [svelte()],
  // Relative asset paths, so the built page works from any folder or host.
  base: './',
  clearScreen: false,
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
  },
});

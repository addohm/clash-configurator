// @vitest-environment happy-dom
// The app runs with Object.prototype frozen (tauri.conf.json freezePrototype,
// PLAN.md Q4). Some code breaks under that (assigning to an inherited
// property like toString throws), so the page's main path runs frozen here.
import { flushSync, mount, unmount } from 'svelte';
import { expect, it } from 'vitest';

it('works with Object.prototype frozen', async () => {
  Object.freeze(Object.prototype);
  const { default: App } = await import('./App.svelte');
  const { store } = await import('./lib/store.svelte');
  const fixtures = import.meta.glob<string>('../../fixtures/configs/risky.yaml', {
    query: '?raw',
    import: 'default',
    eager: true,
  });
  const text = Object.values(fixtures)[0] ?? '';
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(App, { target });
  flushSync();
  store.pickApp('mihomo');
  store.check(text, { kind: 'paste' });
  flushSync();
  store.startEditing();
  flushSync();
  expect(store.built?.ok).toBe(true);
  expect(target.textContent).toContain('2 servers');
  unmount(app);
});

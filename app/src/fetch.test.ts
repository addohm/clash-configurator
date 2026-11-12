// @vitest-environment happy-dom
// Fetching a subscription URL, with the app's fetch command stood in for:
// the Rust side is tested on its own (fetcher/).
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.svelte';
import { strings as t } from './i18n';
import { readUsage, size } from './lib/fetch';
import { store } from './lib/store.svelte';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const FIXTURES = import.meta.glob<string>('../../fixtures/configs/*.yaml', { query: '?raw', import: 'default', eager: true });
const config = FIXTURES['../../fixtures/configs/panel-style.yaml'] ?? '';

let app: ReturnType<typeof mount>;
let target: HTMLElement;

beforeEach(() => {
  (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
  invoke.mockReset();
  store.app = null;
  store.step = 'app';
  store.reached = 0;
  store.checked = null;
  store.session = null;
  store.doc = null;
  store.usage = null;
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(App, { target });
  flushSync();
  store.pickApp('mihomo');
  flushSync();
});

afterEach(() => {
  unmount(app);
  target.remove();
  delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
});

async function fetchUrl(url: string) {
  const input = target.querySelector<HTMLInputElement>('#config-url');
  if (!input) throw new Error('no url box');
  input.value = url;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  target.querySelector<HTMLFormElement>('form.url-row')?.requestSubmit();
  await vi.waitFor(() => expect(invoke).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

describe('subscription URLs', () => {
  it('fetches through the app and checks what comes back', async () => {
    invoke.mockResolvedValue({ body: config, finalUrl: 'https://sub.example.com/x', userinfo: 'upload=1073741824; download=3221225472; total=107374182400; expire=1798761600' });
    await fetchUrl('https://sub.example.com/x?token=fake');
    expect(invoke).toHaveBeenCalledWith('fetch_subscription', { url: 'https://sub.example.com/x?token=fake' });
    expect(store.source).toEqual({ kind: 'url', url: 'https://sub.example.com/x?token=fake' });
    expect(target.querySelector('[aria-current="step"] h2')?.textContent).toBe(t.steps.report);
    expect(target.textContent).toContain('Your provider says: 4.0 GB of 100 GB used, ends');
  });

  it('says why a fetch failed, in plain words', async () => {
    invoke.mockRejectedValue({ code: 'private-address', detail: '192.168.1.1' });
    await fetchUrl('http://192.168.1.1/x');
    expect(target.querySelector('[role="alert"]')?.textContent).toContain('local network (192.168.1.1)');
    expect(store.checked).toBeNull();
  });

  it('treats a fetched config like any other', async () => {
    invoke.mockResolvedValue({ body: 'a: !!python/object/apply:os.system [x]\nproxies: []\n', finalUrl: 'https://x', userinfo: null });
    await fetchUrl('https://sub.example.com/x');
    expect(target.querySelector('[role="alert"]')?.textContent).toContain('special YAML instructions');
  });
});

describe('usage lines', () => {
  it('reads them, and sizes', () => {
    expect(readUsage('upload=10; download=20; total=100; expire=0')).toEqual({ used: 30, total: 100, expires: null });
    expect(readUsage('nonsense')).toBeNull();
    expect(readUsage(null)).toBeNull();
    expect(size(512)).toBe('512 B');
    expect(size(1536)).toBe('1.5 KB');
    expect(size(107374182400)).toBe('100 GB');
  });
});

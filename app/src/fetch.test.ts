// @vitest-environment happy-dom
// Fetching a subscription URL, with the app's fetch command stood in for:
// the Rust side is tested on its own (fetcher/).
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.svelte';
import { strings as t } from './i18n';
import { readInterval, readTitle, readUsage, size } from './lib/fetch';
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
    invoke.mockResolvedValue({
      body: config,
      finalUrl: 'https://sub.example.com/x',
      userinfo: 'upload=1073741824; download=3221225472; total=107374182400; expire=1798761600',
      profileTitle: 'base64:TXkgU3Vi',
      contentDisposition: null,
      updateInterval: '24',
    });
    await fetchUrl('https://sub.example.com/x?token=fake');
    expect(invoke).toHaveBeenCalledWith('fetch_subscription', { url: 'https://sub.example.com/x?token=fake' });
    expect(store.source).toEqual({ kind: 'url', url: 'https://sub.example.com/x?token=fake', name: 'My Sub' });
    expect(store.updateSeconds).toBe(86400);
    expect(target.querySelector('#step-title')?.textContent).toContain(t.steps.report);
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

const go = (label: string) => {
  const b = [...target.querySelectorAll('button')].find((x) => x.textContent?.trim().startsWith(label));
  if (!b) throw new Error(`no button ${label}`);
  b.click();
  flushSync();
};

describe('different kinds of subscription', () => {
  const reply = (body: string) => ({ body, finalUrl: 'https://x', userinfo: null, profileTitle: null, contentDisposition: null, updateInterval: null });

  it('a base64 list of links (v2rayN style) becomes a basic config, linked when saved', async () => {
    const links = ['trojan://pw@a.example.com:443#Alpha', 'trojan://pw@b.example.com:443#Beta', 'ssr://unsupported'].join('\n');
    invoke.mockResolvedValue(reply(btoa(links)));
    await fetchUrl('https://panel.example.com/link/abc?sub=3');
    expect(target.textContent).toContain('This was a list of 2 servers');
    expect(target.textContent).toContain('Entry 3: is a kind of link this page cannot add yet');
    go(t.report.continue);
    for (let i = 0; i < 4; i++) go(t.edit.next);
    go(t.edit.done);
    const box = target.querySelector<HTMLInputElement>('.link-servers input[type="checkbox"]');
    expect(box?.checked).toBe(true);
    expect(store.review?.linked).toBe(true);
    expect(store.review?.output).toContain('url: https://panel.example.com/link/abc?sub=3');
    expect(store.review?.output).not.toContain('server: a.example.com');
    // The pick-by-hand group starts on Auto either way: nothing is lost.
    expect(target.querySelector('.link-servers')?.textContent).not.toContain("won't carry over");
    box?.click();
    flushSync();
    expect(store.review?.linked).toBe(false);
    expect(store.review?.output).toContain('server: a.example.com');
  });

  it('lists edits that would be lost, and why linking can be impossible', async () => {
    invoke.mockResolvedValue(reply(config));
    await fetchUrl('https://sub.example.com/x');
    go(t.report.continue);
    // Point a rule straight at a server: linking is refused.
    store.edit([{ op: 'insert', path: ['rules'], index: 0, value: 'DOMAIN,a.example.com,日本 01' }]);
    flushSync();
    for (let i = 0; i < 4; i++) go(t.edit.next);
    go(t.edit.done);
    const link = target.querySelector('.link-servers');
    expect(link?.textContent).toContain('rule 1 sends traffic to the server 日本 01 directly');
    expect(link?.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
    expect(store.review?.linked).toBe(false);
  });

  it('SIP008 JSON is read, and saved with its servers in the file', async () => {
    invoke.mockResolvedValue(reply(JSON.stringify({ version: 1, servers: [{ server: '198.51.100.1', server_port: 8388, password: 'pw', method: 'aes-256-gcm', remarks: 'One' }] })));
    await fetchUrl('https://ss.example.com/sip008.json');
    expect(target.textContent).toContain('This was a list of 1 server,');
    go(t.report.continue);
    for (let i = 0; i < 4; i++) go(t.edit.next);
    go(t.edit.done);
    expect(target.querySelector('.link-servers')?.textContent).toContain('SIP008');
    expect(store.review?.linked).toBe(false);
  });
});

describe('subscription headers', () => {
  it('reads the name and update interval', () => {
    expect(readTitle('base64:TXkgU3Vi', null)).toBe('My Sub');
    expect(readTitle('Plain Name', null)).toBe('Plain Name');
    expect(readTitle(null, "attachment; filename*=UTF-8''%E6%9C%BA%E5%9C%BA.yaml")).toBe('机场');
    expect(readTitle(null, 'attachment; filename="sub: one.yaml"')).toBe('sub one');
    expect(readTitle(null, null)).toBeNull();
    expect(readInterval('12')).toBe(43200);
    expect(readInterval('soon')).toBeUndefined();
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

// @vitest-environment happy-dom
// Remembering between runs: a "run" here is the page's state reset and
// startMemory() called again, as the app does when it opens.
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeSettings } from '../../core/src';
import App from './App.svelte';
import { strings as t } from './i18n';
import { recall } from './lib/memory';
import { store } from './lib/store.svelte';

const FIXTURES = import.meta.glob<string>('../../fixtures/{configs,hostile}/*.yaml', { query: '?raw', import: 'default', eager: true });
const fixture = (p: string) => FIXTURES[`../../fixtures/${p}`] ?? '';

let app: ReturnType<typeof mount> | null = null;
let stop: (() => void) | null = null;
let target: HTMLElement;

/** Closes the page (if open) and opens it again, as a new run of the app. */
function reopen() {
  if (app) unmount(app);
  stop?.();
  target?.remove();
  store.mode = 'simple';
  store.app = null;
  store.step = 'app';
  store.reached = 0;
  store.source = null;
  store.original = null;
  store.checked = null;
  store.session = null;
  store.doc = null;
  store.edits = [];
  store.linkServers = true;
  store.rememberedUrl = '';
  store.resumable = null;
  store.memoryFull = false;
  stop = store.startMemory();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(App, { target });
  flushSync();
}

const click = (label: string) => {
  const b = [...target.querySelectorAll('button')].find((x) => x.textContent?.trim().startsWith(label));
  if (!b) throw new Error(`no button ${label}`);
  b.click();
  flushSync();
};

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  if (app) unmount(app);
  app = null;
  stop?.();
  stop = null;
  target.remove();
});

describe('remembering between runs', () => {
  it('starts clean when nothing is remembered', () => {
    reopen();
    expect(target.textContent).not.toContain(t.resume.title);
    expect(store.app).toBeNull();
  });

  it('remembers the URL, the app and the session, and offers to carry on', () => {
    reopen();
    store.pickApp('stash');
    store.check(fixture('configs/panel-style.yaml'), { kind: 'url', url: 'https://sub.example.com/x?token=fake', name: 'My Sub' });
    store.startEditing();
    store.edit([{ op: 'set', path: ['mode'], value: 'global' }]);
    flushSync();
    vi.advanceTimersByTime(500);
    expect(recall('url')).toBe('https://sub.example.com/x?token=fake');
    expect(recall('app')).toBe('stash');
    expect(JSON.parse(recall('session') ?? '{}').changes).toHaveLength(2); // the allow-lan fix and the mode

    reopen();
    expect(store.app).toBe('stash');
    expect(target.textContent).toContain(t.resume.title);
    expect(target.textContent).toContain('You were working on My Sub');
    click(t.resume.carryOn);
    expect(store.step).toBe('edit');
    expect(store.data['mode']).toBe('global');
    expect(store.source).toEqual({ kind: 'url', url: 'https://sub.example.com/x?token=fake', name: 'My Sub' });
    expect(target.textContent).not.toContain(t.resume.title);
  });

  it('fills in the remembered URL in step 2', () => {
    localStorage.setItem('clash-configurator:url', 'https://sub.example.com/remembered');
    reopen();
    click(t.apps.mihomo);
    // The box is only there in the app; the remembered value is what it starts with.
    expect(store.rememberedUrl).toBe('https://sub.example.com/remembered');
  });

  it('ignores a remembered URL that is not one', () => {
    localStorage.setItem('clash-configurator:url', 'javascript:alert(1)');
    reopen();
    expect(store.rememberedUrl).toBe('');
  });

  it('starts fresh when asked, and forgets the session', () => {
    localStorage.setItem('clash-configurator:session', writeSettings({ app: 'mihomo', mode: 'simple', source: { kind: 'paste' }, original: fixture('configs/indentless.yaml'), changes: [] }));
    reopen();
    click(t.resume.fresh);
    expect(recall('session')).toBeNull();
    expect(target.textContent).not.toContain(t.resume.title);
  });

  it('checks a remembered session like any input, and clears a bad one', () => {
    localStorage.setItem('clash-configurator:session', writeSettings({ app: 'mihomo', mode: 'simple', source: { kind: 'paste' }, original: fixture('hostile/python-tag.yaml'), changes: [] }));
    reopen();
    click(t.resume.carryOn);
    expect(target.querySelector('[role="alert"]')?.textContent).toContain("couldn't be brought back");
    expect(recall('session')).toBeNull();
    expect(store.session).toBeNull();
  });

  it('forgets everything when asked', () => {
    localStorage.setItem('clash-configurator:url', 'https://sub.example.com/x');
    localStorage.setItem('clash-configurator:app', 'mihomo');
    reopen();
    click(t.memory.forget);
    expect(Object.keys(localStorage).filter((k) => k.startsWith('clash-configurator:'))).toEqual([]);
    expect(target.textContent).toContain(t.memory.forgotten);
  });

  it('says so when a session is too big to remember', () => {
    reopen();
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation((key: string) => {
      if (key.endsWith('session')) throw new DOMException('full', 'QuotaExceededError');
    });
    store.pickApp('mihomo');
    store.check(fixture('configs/indentless.yaml'), { kind: 'paste' });
    store.startEditing();
    flushSync();
    vi.advanceTimersByTime(500);
    flushSync();
    expect(store.memoryFull).toBe(true);
    expect(target.textContent).toContain(t.memory.tooBig);
    setItem.mockRestore();
  });
});

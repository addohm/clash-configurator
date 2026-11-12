// @vitest-environment happy-dom
// Advanced mode: every part on one page, the expert settings shown.
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App.svelte';
import { strings as t } from './i18n';
import { store } from './lib/store.svelte';

const FIXTURES = import.meta.glob<string>('../../fixtures/configs/*.yaml', { query: '?raw', import: 'default', eager: true });
const config = FIXTURES['../../fixtures/configs/provider-basic.yaml'] ?? '';

let app: ReturnType<typeof mount>;
let target: HTMLElement;

beforeEach(() => {
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
  store.resumable = null;
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(App, { target });
  flushSync();
});

afterEach(() => {
  unmount(app);
  target.remove();
});

const click = (label: string) => {
  const b = [...target.querySelectorAll('button')].find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error(`no button "${label}"`);
  b.click();
  flushSync();
};

function toAdvancedEditing() {
  click(t.modes.advanced);
  const area = target.querySelector<HTMLTextAreaElement>('#config-text');
  if (!area) throw new Error('no config box');
  area.value = config;
  area.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  click(t.input.check);
  click(t.report.continue);
}

describe('Advanced mode', () => {
  it('starts with the config, no app step, and mihomo unless picked', () => {
    click(t.modes.advanced);
    expect(target.querySelector('#adv-config')).not.toBeNull();
    expect(target.querySelector('#step-title')).toBeNull();
    toAdvancedEditing();
    expect(store.app).toBe('mihomo');
  });

  it('shows every part on one page, with the expert DNS settings', () => {
    toAdvancedEditing();
    for (const part of ['basics', 'servers', 'groups', 'rules', 'dns']) expect(target.querySelector(`#adv-${part}`), part).not.toBeNull();
    const dns = target.querySelector('#adv-dns');
    expect(dns?.textContent).toContain(t.dns.lists['fake-ip-filter']);
    expect(dns?.textContent).toContain(t.dns.policies);
    expect(dns?.textContent).not.toContain(t.dns.moreInAdvanced);
  });

  it('keeps the change count and Undo in the bar', () => {
    toAdvancedEditing();
    const select = target.querySelector<HTMLSelectElement>('#basics-mode');
    if (!select) throw new Error('no mode');
    select.value = 'global';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(target.querySelector('.adv-bar')?.textContent).toContain('1 change so far.');
    click(t.edit.undo);
    expect(store.data['mode']).toBe('rule');
  });

  it('reviews and saves in its own view, and goes back', () => {
    toAdvancedEditing();
    const review = [...target.querySelectorAll<HTMLButtonElement>('.adv-bar button')].find((b) => b.textContent?.trim() === t.steps.review);
    review?.click();
    flushSync();
    expect(target.querySelector('#adv-review')).not.toBeNull();
    expect(target.querySelector('#adv-servers')).toBeNull();
    click(t.advanced.backToEditing);
    expect(target.querySelector('#adv-servers')).not.toBeNull();
  });

  it('lets the app be changed from the bar', () => {
    toAdvancedEditing();
    const select = target.querySelector<HTMLSelectElement>('.adv-bar select');
    if (!select) throw new Error('no app select');
    select.value = 'stash';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(store.app).toBe('stash');
    expect(store.session?.app).toBe('stash');
  });
});

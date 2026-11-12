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
    for (const part of ['basics', 'servers', 'groups', 'rules', 'dns', 'tun', 'controller']) expect(target.querySelector(`#adv-${part}`), part).not.toBeNull();
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

const input = (scope: Element | null, selector: string) => {
  const el = scope?.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
  if (!el) throw new Error(`no ${selector}`);
  return el;
};
const commit = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
};
const tick = (el: HTMLInputElement | HTMLSelectElement) => {
  (el as HTMLInputElement).click();
  flushSync();
};

describe('TUN and sniffing', () => {
  it('turns TUN on with a stack, and adds a DNS hijack', () => {
    toAdvancedEditing();
    const tun = target.querySelector('#adv-tun');
    tick(input(tun, 'fieldset:first-of-type label.check input'));
    commit(input(tun, 'select'), 'mixed');
    const hijack = input(tun, '.list input[type="text"]');
    hijack.value = 'any:53';
    hijack.dispatchEvent(new Event('input', { bubbles: true }));
    tun?.querySelector<HTMLFormElement>('.list form')?.requestSubmit();
    flushSync();
    expect(store.data['tun']).toEqual({ enable: true, stack: 'mixed', 'dns-hijack': ['any:53'] });
  });

  it('reads site names from TLS on chosen ports, and refuses bad ports', () => {
    toAdvancedEditing();
    const tun = target.querySelector('#adv-tun');
    const tls = [...(tun?.querySelectorAll<HTMLInputElement>('.protocol input[type="checkbox"]') ?? [])][1];
    if (!tls) throw new Error('no TLS box');
    tick(tls);
    expect(store.data['sniffer']).toEqual({ sniff: { TLS: { ports: [443, 8443] } } });
    const ports = input(tun, '.protocol input[type="text"]');
    commit(ports, '443, 99999');
    expect(tun?.textContent).toContain(t.tun.badPorts);
    commit(ports, '443, 8443-8445');
    expect((store.data['sniffer'] as { sniff: { TLS: { ports: unknown } } }).sniff.TLS.ports).toEqual([443, '8443-8445']);
  });
});

describe('controller and geo data', () => {
  it('sets the controller address, refusing a bad one, and makes a password', () => {
    toAdvancedEditing();
    const c = target.querySelector('#adv-controller');
    const address = input(c, 'input[placeholder="127.0.0.1:9090"]');
    commit(address, 'nonsense');
    expect(c?.textContent).toContain(t.controller.bad);
    commit(address, '127.0.0.1:9097');
    expect(store.data['external-controller']).toBe('127.0.0.1:9097');
    [...(c?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === t.controller.random)?.click();
    flushSync();
    expect(store.data['secret']).toMatch(/^[0-9a-f]{36}$/);
    expect(input(c, 'input[type="password"]').value).toBe(store.data['secret']);
  });

  it('picks a known dashboard, with a folder', () => {
    toAdvancedEditing();
    const c = target.querySelector('#adv-controller');
    commit(input(c, 'fieldset:nth-of-type(2) select'), 'zashboard');
    expect(store.data['external-ui-url']).toBe('https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip');
    expect(store.data['external-ui']).toBe('ui');
    commit(input(c, 'fieldset:nth-of-type(2) select'), '');
    expect(store.data['external-ui-url']).toBeUndefined();
  });

  it('takes geo data addresses over https only, and empty removes one', () => {
    toAdvancedEditing();
    const c = target.querySelector('#adv-controller');
    const geoip = input(c, 'fieldset:nth-of-type(3) .field.wide input');
    commit(geoip, 'http://geo.example.com/geoip.dat');
    expect(c?.textContent).toContain(t.controller.httpsOnly);
    commit(geoip, 'https://geo.example.com/geoip.dat');
    expect(store.data['geox-url']).toEqual({ geoip: 'https://geo.example.com/geoip.dat' });
    commit(geoip, '');
    expect(store.data['geox-url']).toEqual({});
  });
});

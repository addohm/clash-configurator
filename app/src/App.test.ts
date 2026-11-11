// @vitest-environment happy-dom
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeSettings, type Session } from '../../core/src';
import App from './App.svelte';
import { strings as t } from './i18n';
import { store } from './lib/store.svelte';

const FIXTURES = import.meta.glob<string>('../../fixtures/{configs,hostile}/*', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const fixture = (path: string): string => {
  const text = FIXTURES[`../../fixtures/${path}`];
  if (text === undefined) throw new Error(`no fixture ${path}`);
  return text;
};

let app: ReturnType<typeof mount>;
let target: HTMLElement;

function reset() {
  store.mode = 'simple';
  store.app = null;
  store.step = 'app';
  store.reached = 0;
  store.source = null;
  store.original = null;
  store.checked = null;
  store.ticked = [];
  store.session = null;
}

beforeEach(() => {
  reset();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(App, { target });
  flushSync();
});

afterEach(() => {
  unmount(app);
  target.remove();
});

const buttons = () => [...target.querySelectorAll('button')];
const button = (label: string) => {
  const b = buttons().find((x) => x.textContent?.trim().startsWith(label));
  if (!b) throw new Error(`no button "${label}" in: ${buttons().map((x) => x.textContent?.trim()).join(' | ')}`);
  return b;
};
const click = (label: string) => {
  button(label).click();
  flushSync();
};
const paste = (text: string) => {
  const area = target.querySelector('textarea');
  if (!area) throw new Error('no textarea');
  area.value = text;
  area.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
};
const openStep = () => target.querySelector('[aria-current="step"] h2')?.textContent;

describe('Simple mode', () => {
  it('starts by asking for the app', () => {
    expect(openStep()).toBe(t.steps.app);
    expect(target.textContent).toContain(t.apps.shadowrocketHint);
  });

  it('takes a pasted config through the safety report to editing', () => {
    click(t.apps.mihomo);
    expect(openStep()).toBe(t.steps.input);
    expect(button(t.input.check).disabled).toBe(true);

    paste(fixture('configs/risky.yaml'));
    click(t.input.check);
    expect(openStep()).toBe(t.steps.report);
    expect(target.textContent).toContain(t.findings['controller-open-no-secret'].title);
    expect(target.textContent).toContain('Danger');

    // Dangerous fixes start ticked; switching to https doesn't.
    const boxes = [...target.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes.some((b) => b.checked)).toBe(true);
    expect(boxes.some((b) => !b.checked)).toBe(true);

    click(t.report.continue);
    expect(openStep()).toBe(t.steps.edit);
    expect(store.session?.changes.length).toBeGreaterThan(0);
    expect(store.built?.ok).toBe(true);
    expect(target.textContent).toContain('2 servers');
  });

  it('applies only the fixes left ticked', () => {
    click(t.apps.mihomo);
    paste(fixture('configs/panel-style.yaml'));
    click(t.input.check);
    const box = target.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!box) throw new Error('no checkbox');
    expect(box.checked).toBe(true); // allow-lan
    box.click();
    flushSync();
    click(t.report.continue);
    expect(store.session?.changes).toEqual([]);
  });

  it('explains a refusal and lets the user try again', () => {
    click(t.apps.stash);
    paste(fixture('hostile/python-tag.yaml'));
    click(t.input.check);
    expect(target.querySelector('[role="alert"]')?.textContent).toContain('special YAML instructions');
    click(t.report.tryAgain);
    expect(openStep()).toBe(t.steps.input);
  });

  it('lets finished steps be reopened, and keeps later ones closed', () => {
    click(t.apps.mihomo);
    expect(buttons().some((b) => b.textContent?.trim() === t.steps.change)).toBe(true);
    click(t.steps.change);
    expect(openStep()).toBe(t.steps.app);
    store.open('review');
    flushSync();
    expect(openStep()).toBe(t.steps.app);
  });

  it('restores a saved settings file', () => {
    const s: Session = {
      app: 'shadowrocket',
      mode: 'simple',
      source: { kind: 'file', name: 'mine.yaml' },
      original: fixture('configs/indentless.yaml'),
      changes: [{ op: 'set', path: ['mode'], value: 'global' }],
    };
    expect(store.restore(writeSettings(s)).ok).toBe(true);
    flushSync();
    expect(store.app).toBe('shadowrocket');
    expect(openStep()).toBe(t.steps.edit);
    expect(store.built?.ok && store.built.doc.toJS().mode).toBe('global');
  });

  it('shows Advanced and Scratch as not built yet', () => {
    click(t.modes.advanced);
    expect(target.textContent).toContain(t.notBuiltYet);
    expect(target.querySelector('textarea')).toBeNull();
  });
});

describe('the ⓘ tooltips', () => {
  it('open on click and close on Escape or a click elsewhere', () => {
    click(t.apps.mihomo);
    const info = target.querySelector<HTMLButtonElement>(`button[aria-label="${t.info}"]`);
    if (!info) throw new Error('no info button');
    info.click();
    flushSync();
    expect(target.querySelector('[role="tooltip"]')?.textContent).toContain('Clash Verge Rev');
    info.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(target.querySelector('[role="tooltip"]')).toBeNull();
    info.click();
    flushSync();
    document.body.click();
    flushSync();
    expect(target.querySelector('[role="tooltip"]')).toBeNull();
  });
});

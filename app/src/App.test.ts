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
  store.doc = null;
  store.edits = [];
  store.editError = '';
  store.section = 'basics';
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
    expect(store.doc).not.toBeNull();
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
    expect(store.data['mode']).toBe('global');
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

/** Brings a config through to the edit step. */
function toEditing(file: string) {
  click(t.apps.mihomo);
  paste(fixture(file));
  click(t.input.check);
  click(t.report.continue);
}

const card = () => target.querySelector('section.card[aria-label]');
const inputIn = (scope: Element | null, selector: string) => {
  const el = scope?.querySelector<HTMLInputElement>(selector);
  if (!el) throw new Error(`no ${selector}`);
  return el;
};
const change = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
};

describe('editing: Basics', () => {
  it('shows and changes the mode, ports and toggles', () => {
    toEditing('configs/panel-style.yaml');
    expect(card()?.getAttribute('aria-label')).toBe(t.edit.sections.basics);
    const select = card()?.querySelector('select');
    if (!select) throw new Error('no select');
    expect(select.value).toBe('rule'); // the config says "Rule"
    change(select, 'global');
    expect(store.data['mode']).toBe('global');

    const ports = [...(card()?.querySelectorAll<HTMLInputElement>('input[inputmode="numeric"]') ?? [])];
    expect(ports.map((p) => p.value)).toEqual(['7890', '7891']);
    change(ports[0]!, '70000');
    expect(card()?.textContent).toContain(t.basics.badPort);
    change(ports[0]!, '7900');
    expect(store.data['port']).toBe(7900);

    const lan = inputIn(card(), 'input[type="checkbox"]');
    expect(lan.checked).toBe(false); // the safety fix turned it off
    lan.click();
    flushSync();
    expect(store.data['allow-lan']).toBe(true);
  });

  it('undoes the last change', () => {
    toEditing('configs/indentless.yaml');
    const select = card()?.querySelector('select');
    if (!select) throw new Error('no select');
    change(select, 'direct');
    expect(store.data['mode']).toBe('direct');
    click(t.edit.undo);
    expect(store.data['mode']).toBe('rule');
    expect(button(t.edit.undo).disabled).toBe(true);
  });

  it('moves through the parts and on to the review', () => {
    toEditing('configs/indentless.yaml');
    for (let i = 0; i < 4; i++) click(t.edit.next);
    expect(card()?.getAttribute('aria-label')).toBe(t.edit.sections.dns);
    click(t.edit.done);
    expect(openStep()).toBe(t.steps.review);
  });
});

describe('editing: Servers', () => {
  const toServers = () => {
    toEditing('configs/indentless.yaml');
    click(t.edit.next);
    expect(card()?.getAttribute('aria-label')).toBe(t.edit.sections.servers);
  };

  it('renames a server and its group references', () => {
    toServers();
    click(t.servers.rename);
    const input = inputIn(card(), 'form.rename input');
    change(input, 'Server B');
    click(t.edit.save);
    expect(card()?.textContent).toContain(t.servers.renameErrors['name in use']);
    change(input, 'Alpha');
    click(t.edit.save);
    const groups = store.data['proxy-groups'] as { proxies: string[] }[];
    expect(groups[0]?.proxies).toEqual(['Alpha', 'Server B']);
  });

  it('removes a server, or says why it cannot', () => {
    toServers();
    click(t.servers.remove);
    expect((store.data['proxies'] as unknown[]).length).toBe(1);
    // Server B is now the only member of Proxy.
    click(t.servers.remove);
    expect(card()?.textContent).toContain('only member of the group Proxy');
  });

  it('adds servers from share links to the suggested groups', () => {
    toServers();
    const area = card()?.querySelector('textarea');
    if (!area) throw new Error('no textarea');
    change(area, 'trojan://pw@new.example.com:443#New One\nnonsense');
    click(t.servers.addRead);
    expect(card()?.textContent).toContain("Line 2 isn't a share link");
    const box = inputIn(card(), 'fieldset.groups input[type="checkbox"]');
    expect(box.checked).toBe(true); // Proxy lists every server
    click('Add 1 servers');
    expect((store.data['proxies'] as { name: string }[]).map((p) => p.name)).toContain('New One');
    expect((store.data['proxy-groups'] as { proxies: string[] }[])[0]?.proxies).toContain('New One');
  });
});

describe('editing: Groups', () => {
  const toGroups = () => {
    toEditing('configs/provider-basic.yaml');
    click(t.edit.next);
    click(t.edit.next);
    expect(card()?.getAttribute('aria-label')).toBe(t.edit.sections.groups);
  };
  const groupsData = () => store.data['proxy-groups'] as { name: string; type: string; proxies: string[] }[];

  it('changes a group type and its members', () => {
    toGroups();
    click(t.groups.open); // the first group, Proxy
    const select = card()?.querySelector<HTMLSelectElement>('.detail select');
    if (!select) throw new Error('no type select');
    change(select, 'fallback');
    expect(groupsData()[0]?.type).toBe('fallback');
    const down = card()?.querySelector<HTMLButtonElement>(`button[aria-label="${t.groups.down}"]`);
    down?.click();
    flushSync();
    expect(groupsData()[0]?.proxies.slice(0, 2)).toEqual(['🇭🇰 Hong Kong 01', 'Auto']);
  });

  it("doesn't offer a group that would contain itself", () => {
    toGroups();
    // Open Auto (the second group) and try adding Proxy, which contains Auto.
    const openButtons = buttons().filter((b) => b.textContent?.trim() === t.groups.open);
    openButtons[1]?.click();
    flushSync();
    const picker = card()?.querySelector<HTMLSelectElement>(`select[aria-label="${t.groups.addMember}"]`);
    expect([...(picker?.options ?? [])].map((o) => o.value)).not.toContain('Proxy');
  });

  it('will not remove a group that is used, and says where', () => {
    toGroups();
    click(t.groups.open);
    click(t.groups.remove);
    expect(card()?.textContent).toContain("Can't remove it while it's used by: rule 5");
  });

  it('adds a group', () => {
    toGroups();
    const name = card()?.querySelector<HTMLInputElement>(`fieldset.new input[type="text"]`);
    if (!name) throw new Error('no name input');
    change(name, 'Video');
    const boxes = [...(card()?.querySelectorAll<HTMLInputElement>('fieldset.new input[type="checkbox"]') ?? [])];
    boxes[0]?.click();
    flushSync();
    click(t.groups.create);
    expect(groupsData().map((g) => g.name)).toContain('Video');
  });
});

describe('editing: Rules', () => {
  const toRules = (file = 'configs/provider-basic.yaml') => {
    toEditing(file);
    for (let i = 0; i < 3; i++) click(t.edit.next);
    expect(card()?.getAttribute('aria-label')).toBe(t.edit.sections.rules);
  };
  const rules = () => store.data['rules'] as string[];

  it('shows rules in plain words, and searches them', () => {
    toRules();
    expect(card()?.textContent).toContain('Site and its subdomains');
    expect(card()?.textContent).toContain(t.rules.types.MATCH);
    const search = card()?.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error('no search');
    change(search, 'GEOIP');
    expect(card()?.querySelectorAll('ol.rules li')).toHaveLength(1);
  });

  it('retargets, moves and removes a rule', () => {
    toRules();
    card()?.querySelector<HTMLButtonElement>('ol.rules li .target-name')?.click();
    flushSync();
    const target = card()?.querySelector<HTMLSelectElement>('ol.rules li .target select');
    if (!target) throw new Error('no target');
    change(target, 'Proxy');
    expect(card()?.querySelectorAll('ol.rules li .target select')).toHaveLength(0);
    expect(rules()[0]).toBe('DOMAIN-SUFFIX,local,Proxy');
    card()?.querySelectorAll<HTMLButtonElement>(`button[aria-label="${t.rules.down}"]`)[0]?.click();
    flushSync();
    expect(rules()[1]).toBe('DOMAIN-SUFFIX,local,Proxy');
    card()?.querySelectorAll<HTMLButtonElement>(`button[aria-label="${t.rules.remove}"]`)[0]?.click();
    flushSync();
    expect(rules()).toHaveLength(4);
  });

  it('adds a rule above the last one, and refuses a bad value', () => {
    toRules();
    const value = card()?.querySelector<HTMLInputElement>('fieldset.add input[type="text"]');
    if (!value) throw new Error('no value input');
    change(value, 'not a domain');
    click(t.rules.add);
    expect(card()?.textContent).toContain(t.editErrors['bad value']);
    change(value, 'Example.org');
    click(t.rules.add);
    expect(rules().slice(-2)).toEqual(['DOMAIN-SUFFIX,example.org,Proxy', 'MATCH,Proxy']);
    expect(card()?.textContent).toContain('Added as rule 5.');
  });

  it('pages through long rule lists', () => {
    toEditing('configs/indentless.yaml');
    for (let i = 0; i < 60; i++) store.edit([{ op: 'insert', path: ['rules'], index: 0, value: `DOMAIN,r${i}.example.com,DIRECT` }]);
    flushSync();
    for (let i = 0; i < 3; i++) click(t.edit.next);
    expect(card()?.querySelectorAll('ol.rules li')).toHaveLength(50);
    click(t.rules.next);
    expect(card()?.querySelectorAll('ol.rules li')).toHaveLength(12);
  });
});

describe('editing: DNS', () => {
  const toDns = () => {
    toEditing('configs/provider-basic.yaml');
    for (let i = 0; i < 4; i++) click(t.edit.next);
    expect(card()?.getAttribute('aria-label')).toBe(t.edit.sections.dns);
  };
  const dns = () => store.data['dns'] as Record<string, unknown>;
  const listFor = (label: string) => {
    const l = [...(card()?.querySelectorAll('.list') ?? [])].find((x) => x.querySelector('.label')?.textContent?.includes(label));
    if (!l) throw new Error(`no list ${label}`);
    return l;
  };

  it("shows the config's DNS: on, fake addresses, its servers and exceptions", () => {
    toDns();
    expect(inputIn(card(), 'label.check input').checked).toBe(true);
    expect(card()?.querySelector<HTMLSelectElement>('#dns-mode')?.value).toBe('fake-ip');
    expect(listFor(t.dns.lists.nameserver).textContent).toContain('https://doh.pub/dns-query');
    expect(listFor(t.dns.lists['fake-ip-filter']).textContent).toContain('+.msftconnecttest.com');
    expect(card()?.textContent).toContain('geosite:cn');
  });

  it('adds a server, refuses a bad one, and moves and removes', () => {
    toDns();
    const list = listFor(t.dns.lists.nameserver);
    const input = inputIn(list, 'input[type="text"]');
    change(input, 'dns.google');
    list.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    flushSync();
    expect(listFor(t.dns.lists.nameserver).textContent).toContain(t.editErrors['bad value']);
    change(inputIn(listFor(t.dns.lists.nameserver), 'input[type="text"]'), 'tls://1.1.1.1');
    listFor(t.dns.lists.nameserver).querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    flushSync();
    expect(dns()['nameserver']).toEqual(['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query', 'tls://1.1.1.1']);
    listFor(t.dns.lists.nameserver).querySelectorAll<HTMLButtonElement>(`button[aria-label="${t.dns.remove}"]`)[0]?.click();
    flushSync();
    expect(dns()['nameserver']).toEqual(['https://dns.alidns.com/dns-query', 'tls://1.1.1.1']);
  });

  it('adds and edits per-site DNS', () => {
    toDns();
    click(t.dns.addPolicy);
    const inputs = [...(card()?.querySelectorAll<HTMLInputElement>('.policy-form input') ?? [])];
    change(inputs[0]!, '+.corp.example');
    change(inputs[1]!, '10.0.0.53, 10.0.0.54');
    click(t.edit.save);
    expect((dns()['nameserver-policy'] as Record<string, unknown>)['+.corp.example']).toEqual(['10.0.0.53', '10.0.0.54']);
  });

  it('switches to real addresses', () => {
    toDns();
    const mode = card()?.querySelector<HTMLSelectElement>('#dns-mode');
    if (!mode) throw new Error('no mode');
    change(mode, 'redir-host');
    expect(dns()['enhanced-mode']).toBe('redir-host');
  });
});

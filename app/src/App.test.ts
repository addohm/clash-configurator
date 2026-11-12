// @vitest-environment happy-dom
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeSettings, type Session } from '../../core/src';
import App from './App.svelte';
import Dns from './edit/Dns.svelte';
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
/** Clicks the first button whose whole label is exactly this. */
const clickExact = (label: string, scope: ParentNode = target) => {
  const b = [...scope.querySelectorAll('button')].find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error(`no button exactly "${label}"`);
  b.click();
  flushSync();
};
const paste = (text: string) => {
  const area = target.querySelector('textarea');
  if (!area) throw new Error('no textarea');
  area.value = text;
  area.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
};
/** The open step's title (its heading holds the step number first). */
const openStep = () => target.querySelector('#step-title')?.textContent?.replace(/^\s*\d+\s*/, '').trim();

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
    // Finished steps are buttons in the sidebar; later ones are disabled.
    const stepButton = (name: string) => [...target.querySelectorAll<HTMLButtonElement>('.step-link')].find((b) => b.textContent?.includes(name));
    expect(stepButton(t.steps.review)?.disabled).toBe(true);
    stepButton(t.steps.app)?.click();
    flushSync();
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
    const info = target.querySelector<HTMLButtonElement>(`section.view button[aria-label="${t.info}"]`);
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
    clickExact(t.servers.remove, card() ?? target);
    expect((store.data['proxies'] as unknown[]).length).toBe(1);
    // Server B is now the only member of Proxy.
    clickExact(t.servers.remove, card() ?? target);
    expect(card()?.textContent).toContain('only member of the group Proxy');
  });

  it('removes ticked servers together, or keeps only them', () => {
    toEditing('configs/provider-basic.yaml');
    click(t.edit.next);
    const box = (name: string) => inputIn(card(), `input[aria-label="${name}"]`);
    box('🇯🇵 Tokyo 01').click();
    box('🇸🇬 Singapore 01').click();
    flushSync();
    expect(card()?.textContent).toContain('2 ticked');
    click(t.servers.keepTicked);
    expect((store.data['proxies'] as { name: string }[]).map((p) => p.name)).toEqual(['🇯🇵 Tokyo 01', '🇸🇬 Singapore 01']);
    // One edit: one undo brings them all back.
    click(t.edit.undo);
    expect((store.data['proxies'] as unknown[]).length).toBe(4);
  });

  it('searches servers', () => {
    toEditing('configs/provider-basic.yaml');
    click(t.edit.next);
    const search = inputIn(card(), 'input[type="search"]');
    change(search, 'tokyo');
    expect(card()?.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('adds servers from share links to the suggested groups', () => {
    toServers();
    const area = card()?.querySelector<HTMLTextAreaElement>('details.add textarea');
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
    // The first group, Proxy, is shown to start with.
    const select = card()?.querySelector<HTMLSelectElement>('.detail .field select');
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
    // Choose Auto (the second group) and try adding Proxy, which contains Auto.
    [...(card()?.querySelectorAll<HTMLButtonElement>('.item') ?? [])][1]?.click();
    flushSync();
    const picker = card()?.querySelector<HTMLSelectElement>(`select[aria-label="${t.groups.addMember}"]`);
    expect([...(picker?.options ?? [])].map((o) => o.value)).not.toContain('Proxy');
  });

  it('will not remove a group that is used, and says where', () => {
    toGroups();
    click(t.groups.remove);
    expect(card()?.textContent).toContain("Can't remove it while it's used by: rule 5");
  });

  it('adds a group', () => {
    toGroups();
    click(`+ ${t.groups.new}`);
    const name = card()?.querySelector<HTMLInputElement>(`.detail input[type="text"]`);
    if (!name) throw new Error('no name input');
    change(name, 'Video');
    const boxes = [...(card()?.querySelectorAll<HTMLInputElement>('.choices input[type="checkbox"]') ?? [])];
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
    expect(card()?.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('removes ticked rules together', () => {
    toRules();
    const boxes = [...(card()?.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]') ?? [])];
    boxes[0]?.click();
    boxes[2]?.click();
    flushSync();
    click(t.rules.removeTicked);
    expect(rules()).toEqual(['IP-CIDR,192.168.0.0/16,DIRECT,no-resolve', 'GEOIP,CN,DIRECT,no-resolve', 'MATCH,Proxy']);
  });

  it('retargets, moves and removes a rule', () => {
    toRules();
    card()?.querySelector<HTMLButtonElement>('tbody tr .target-name')?.click();
    flushSync();
    const target = card()?.querySelector<HTMLSelectElement>('tbody tr .target select');
    if (!target) throw new Error('no target');
    change(target, 'Proxy');
    expect(card()?.querySelectorAll('tbody tr .target select')).toHaveLength(0);
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
    store.edit(Array.from({ length: 250 }, (_, i) => ({ op: 'insert' as const, path: ['rules'], index: 0, value: `DOMAIN,r${i}.example.com,DIRECT` })));
    flushSync();
    for (let i = 0; i < 3; i++) click(t.edit.next);
    expect(card()?.querySelectorAll('tbody tr')).toHaveLength(200);
    clickExact(t.rules.next, card() ?? target);
    expect(card()?.querySelectorAll('tbody tr')).toHaveLength(52);
  });
});

describe('editing: DNS', () => {
  const toDns = () => {
    toEditing('configs/provider-basic.yaml');
    for (let i = 0; i < 4; i++) click(t.edit.next);
    expect(card()?.getAttribute('aria-label')).toBe(t.edit.sections.dns);
  };
  const dns = () => store.data['dns'] as Record<string, unknown>;
  const listFor = (label: string, scope: Element | null = card()) => {
    const l = [...(scope?.querySelectorAll('.list') ?? [])].find((x) => x.querySelector('.label')?.textContent?.includes(label));
    if (!l) throw new Error(`no list ${label}`);
    return l;
  };

  it('shows only the basics in Simple mode (PLAN.md Q31)', () => {
    toDns();
    expect(inputIn(card(), 'label.check input').checked).toBe(true);
    expect(card()?.querySelector<HTMLSelectElement>('#dns-mode')?.value).toBe('fake-ip');
    expect(listFor(t.dns.lists.nameserver).textContent).toContain('https://doh.pub/dns-query');
    expect(card()?.textContent).toContain(t.dns.moreInAdvanced);
    // Only the main servers' list, and no per-site section.
    expect([...(card()?.querySelectorAll('.list .label') ?? [])].map((l) => l.textContent?.trim().replace(/\s*ⓘ$/, ''))).toEqual([t.dns.lists.nameserver]);
    expect(card()?.querySelector('.policies')).toBeNull();
  });

  it('adds a server, refuses a bad one, and removes', () => {
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

  it('switches to real addresses', () => {
    toDns();
    const mode = card()?.querySelector<HTMLSelectElement>('#dns-mode');
    if (!mode) throw new Error('no mode');
    change(mode, 'redir-host');
    expect(dns()['enhanced-mode']).toBe('redir-host');
  });

  describe('the expert settings (as Advanced mode will show them)', () => {
    let advancedTarget: HTMLElement;
    let advanced: ReturnType<typeof mount>;
    const openAdvanced = () => {
      toEditing('configs/provider-basic.yaml');
      advancedTarget = document.createElement('div');
      document.body.appendChild(advancedTarget);
      advanced = mount(Dns, { target: advancedTarget, props: { advanced: true } });
      flushSync();
    };
    afterEach(() => {
      if (advanced) unmount(advanced);
      advancedTarget?.remove();
    });

    it('shows fake-IP exceptions, proxy-server DNS and per-site DNS', () => {
      openAdvanced();
      expect(listFor(t.dns.lists['fake-ip-filter'], advancedTarget).textContent).toContain('+.msftconnecttest.com');
      expect(listFor(t.dns.lists['proxy-server-nameserver'], advancedTarget).textContent).toContain('https://doh.pub/dns-query');
      expect(advancedTarget.textContent).toContain('geosite:cn');
    });

    it('adds and edits per-site DNS', () => {
      openAdvanced();
      const add = [...advancedTarget.querySelectorAll('button')].find((b) => b.textContent?.trim() === t.dns.addPolicy);
      add?.click();
      flushSync();
      const inputs = [...advancedTarget.querySelectorAll<HTMLInputElement>('.policy-form input')];
      change(inputs[0]!, '+.corp.example');
      change(inputs[1]!, '10.0.0.53, 10.0.0.54');
      [...advancedTarget.querySelectorAll('button')].find((b) => b.textContent?.trim() === t.edit.save)?.click();
      flushSync();
      expect((dns()['nameserver-policy'] as Record<string, unknown>)['+.corp.example']).toEqual(['10.0.0.53', '10.0.0.54']);
    });
  });
});

describe('review and save', () => {
  const toReview = () => {
    click(t.edit.done);
    expect(openStep()).toBe(t.steps.review);
  };
  const reviewCard = () => target.querySelector('section.view');

  it('compares the original and the new config', () => {
    toEditing('configs/panel-style.yaml');
    const select = card()?.querySelector('select');
    if (!select) throw new Error('no select');
    change(select, 'global');
    for (let i = 0; i < 4; i++) click(t.edit.next);
    toReview();
    const text = reviewCard()?.textContent ?? '';
    expect(text).toContain('2 changes made.'); // the allow-lan fix and the mode
    const added = [...(reviewCard()?.querySelectorAll('tr.added .text') ?? [])].map((td) => td.textContent);
    const removed = [...(reviewCard()?.querySelectorAll('tr.removed .text') ?? [])].map((td) => td.textContent);
    expect(added).toEqual(['allow-lan: false', 'mode: global']);
    expect(removed).toEqual(['allow-lan: true', 'mode: Rule']);
    expect(text).toContain(t.review.clean);
  });

  it('says what the safety checks still flag', () => {
    toEditing('configs/indentless.yaml');
    store.edit([{ op: 'set', path: ['allow-lan'], value: true }]);
    flushSync();
    for (let i = 0; i < 4; i++) click(t.edit.next);
    toReview();
    expect(reviewCard()?.textContent).toContain(t.review.stillFlagged);
    expect(reviewCard()?.textContent).toContain(t.findings['allow-lan'].title);
  });

  it('downloads the config and the settings in a browser', async () => {
    toEditing('configs/indentless.yaml');
    for (let i = 0; i < 4; i++) click(t.edit.next);
    toReview();
    expect(reviewCard()?.textContent).toContain(t.review.noChanges);
    click(t.review.saveConfig);
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    expect(reviewCard()?.textContent).toContain('Downloaded config (edited).yaml.');
    click(t.review.saveSettings);
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    expect(reviewCard()?.textContent).toContain('Downloaded config.ccsettings.json.');
  });

  it('shows the whole config to copy', () => {
    toEditing('configs/indentless.yaml');
    for (let i = 0; i < 4; i++) click(t.edit.next);
    toReview();
    click(t.review.showWhole);
    expect(reviewCard()?.querySelector<HTMLTextAreaElement>('.whole textarea')?.value).toBe(fixture('configs/indentless.yaml'));
  });

  it('tells Stash and Shadowrocket users their own files come later', () => {
    click(t.apps.shadowrocket);
    paste(fixture('configs/indentless.yaml'));
    click(t.input.check);
    click(t.report.continue);
    for (let i = 0; i < 4; i++) click(t.edit.next);
    toReview();
    expect(reviewCard()?.textContent).toContain(t.review.appNote);
  });
});

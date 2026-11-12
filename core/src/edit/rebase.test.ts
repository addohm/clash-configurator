import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { addServersChanges, applyChange, type Change, intake, parseLink, planRebase, removeManyChanges, renameChanges } from '..';

// The provider's config as it was when the user edited it (made up).
const OLD = `mode: rule
allow-lan: true
dns:
  enable: true
  nameserver: [https://doh.pub/dns-query]
  fake-ip-filter: ['*.lan']
  nameserver-policy:
    'geosite:cn': [https://doh.pub/dns-query]
proxies:
  - {name: HK, type: ss, server: 192.0.2.1, port: 8388, cipher: aes-128-gcm, password: a}
  - {name: JP, type: ss, server: 192.0.2.2, port: 8388, cipher: aes-128-gcm, password: b}
  - {name: US, type: ss, server: 192.0.2.3, port: 8388, cipher: aes-128-gcm, password: c}
proxy-groups:
  - {name: Proxy, type: select, proxies: [Auto, HK, JP, US, DIRECT]}
  - {name: Auto, type: url-test, proxies: [HK, JP, US]}
  - {name: Video, type: select, proxies: [Proxy, HK, JP]}
rules:
  - DOMAIN-SUFFIX,google.com,Proxy
  - GEOIP,CN,DIRECT,no-resolve
  - MATCH,Proxy
`;

// The same provider, some time later.
const NEW = `mode: rule
allow-lan: true
dns:
  enable: true
  nameserver: [https://doh.pub/dns-query, https://dns.new.example/dns-query]
  fake-ip-filter: ['*.lan']
  nameserver-policy:
    'geosite:cn': [https://dns.new.example/dns-query]
proxies:
  - {name: HK, type: ss, server: 198.51.100.1, port: 8388, cipher: aes-128-gcm, password: a}
  - {name: JP, type: ss, server: 192.0.2.2, port: 9000, cipher: aes-128-gcm, password: b}
  - {name: US, type: ss, server: 192.0.2.3, port: 8388, cipher: aes-128-gcm, password: c}
  - {name: SG, type: ss, server: 192.0.2.4, port: 8388, cipher: aes-128-gcm, password: d}
proxy-groups:
  - {name: Proxy, type: select, proxies: [Auto, HK, JP, US, SG, DIRECT]}
  - {name: Auto, type: url-test, proxies: [HK, JP, US, SG]}
  - {name: Video, type: select, proxies: [Proxy, HK, JP]}
rules:
  - DOMAIN-SUFFIX,google.com,Auto
  - GEOIP,CN,DIRECT,no-resolve
  - DOMAIN-SUFFIX,new.example,Proxy
  - MATCH,Proxy
`;

/** The user's edits, made one after another as the page would. */
function userEdits(): Record<string, unknown> {
  const doc = parseDocument(OLD);
  const data = () => doc.toJS() as Record<string, unknown>;
  const make = (c: Change[]) => c.forEach((x) => applyChange(doc, x));
  make(removeManyChanges(data(), ['US']));
  make(renameChanges(data(), 'HK', 'Hong Kong'));
  make([{ op: 'set', path: ['proxies', 1, 'port'], value: 8443 }]); // JP
  make(addServersChanges(data(), [parseLink('trojan://pw@mine.example.com:443#Mine')], ['Proxy']).changes);
  make([{ op: 'move', path: ['proxy-groups', 2, 'proxies'], from: 2, to: 0 }]); // Video starts on JP
  make([{ op: 'insert', path: ['proxy-groups'], value: { name: 'Gaming', type: 'select', proxies: ['Hong Kong', 'DIRECT'] } }]);
  make([{ op: 'insert', path: ['rules'], index: 2, value: 'DOMAIN,game.example.com,Gaming' }]);
  make([{ op: 'set', path: ['rules', 0], value: 'DOMAIN-SUFFIX,google.com,Video' }]);
  make([{ op: 'delete', path: ['rules', 1] }]); // GEOIP,CN
  make([{ op: 'set', path: ['allow-lan'], value: false }]);
  make([{ op: 'set', path: ['mode'], value: 'global' }]);
  make([{ op: 'insert', path: ['dns', 'nameserver'], value: 'tls://1.1.1.1' }]);
  make([{ op: 'insert', path: ['dns', 'fake-ip-filter'], value: '+.corp.example' }]);
  make([{ op: 'set', path: ['dns', 'nameserver-policy', 'geosite:cn'], value: ['223.5.5.5'] }]);
  return data();
}

const oldData = () => parseDocument(OLD).toJS() as Record<string, unknown>;

function rebased(choices: Record<string, 'mine' | 'theirs'> = {}) {
  const plan = planRebase(oldData(), userEdits(), NEW);
  if ('ok' in plan) throw new Error(`refused: ${plan.refusal.code}`);
  const r = plan.apply(choices);
  if (!r.ok) throw new Error(`failed: ${r.refusal.code}`);
  const doc = parseDocument(NEW);
  for (const c of r.changes) applyChange(doc, c);
  return { plan, r, d: doc.toJS() as Record<string, any> };
}

describe('update from the subscription', () => {
  it('asks only where both sides changed the same thing, with the answer suggested by kind', () => {
    const { plan } = rebased();
    expect(plan.conflicts.map((c) => [c.id, c.category, c.mine, c.theirs])).toEqual([
      ['server:JP:port', 'critical', 8443, 9000],
      ['rule:DOMAIN-SUFFIX,google.com', 'preference', 'DOMAIN-SUFFIX,google.com,Video', 'DOMAIN-SUFFIX,google.com,Auto'],
      ['setting:dns.nameserver-policy.geosite:cn', 'critical', ['223.5.5.5'], ['https://dns.new.example/dns-query']],
    ]);
  });

  it("takes the provider's changes where the user changed nothing", () => {
    const { d } = rebased();
    const hk = d.proxies.find((s: { name: string }) => s.name === 'Hong Kong');
    expect(hk.server).toBe('198.51.100.1'); // the provider's new address, under the user's name
    expect(d.rules).toContain('DOMAIN-SUFFIX,new.example,Proxy');
    expect(d.dns.nameserver).toContain('https://dns.new.example/dns-query');
  });

  it("re-applies the user's edits", () => {
    const { d } = rebased();
    expect(d.proxies.map((s: { name: string }) => s.name)).toEqual(['Hong Kong', 'JP', 'SG', 'Mine']);
    expect(d['proxy-groups'].map((g: { name: string }) => g.name)).toEqual(['Proxy', 'Auto', 'Video', 'Gaming']);
    expect(d['proxy-groups'][0].proxies).toEqual(['Auto', 'Hong Kong', 'JP', 'SG', 'DIRECT', 'Mine']);
    expect(d['proxy-groups'][2].proxies[0]).toBe('JP'); // Video still starts on JP
    expect(d.rules).toEqual(['DOMAIN-SUFFIX,google.com,Video', 'DOMAIN-SUFFIX,new.example,Proxy', 'DOMAIN,game.example.com,Gaming', 'MATCH,Proxy']);
    expect(d['allow-lan']).toBe(false);
    expect(d.mode).toBe('global');
    expect(d.dns.nameserver).toEqual(['https://doh.pub/dns-query', 'https://dns.new.example/dns-query', 'tls://1.1.1.1']);
    expect(d.dns['fake-ip-filter']).toEqual(['*.lan', '+.corp.example']);
  });

  it('uses the suggested answers unless told otherwise', () => {
    const suggested = rebased().d;
    expect(suggested.proxies.find((s: { name: string }) => s.name === 'JP').port).toBe(9000);
    expect(suggested.dns['nameserver-policy']['geosite:cn']).toEqual(['https://dns.new.example/dns-query']);
    const mine = rebased({ 'server:JP:port': 'mine', 'setting:dns.nameserver-policy.geosite:cn': 'mine', 'rule:DOMAIN-SUFFIX,google.com': 'theirs' }).d;
    expect(mine.proxies.find((s: { name: string }) => s.name === 'JP').port).toBe(8443);
    expect(mine.dns['nameserver-policy']['geosite:cn']).toEqual(['223.5.5.5']);
    expect(mine.rules[0]).toBe('DOMAIN-SUFFIX,google.com,Auto');
  });

  it('gives a config that passes the safety checks', () => {
    const { r } = rebased();
    const doc = parseDocument(NEW);
    for (const c of r.changes) applyChange(doc, c);
    expect(intake(doc.toString()).ok).toBe(true);
    expect(r.applied).toBeGreaterThan(10);
  });

  it("notes edits it couldn't make", () => {
    // The provider dropped JP and Video: the user's port change and member order have nowhere to go.
    const newer = NEW.replace(/  - \{name: JP,[^\n]*\n/, '')
      .replace(/, JP\]/g, ']')
      .replace(/, JP,/g, ',')
      .replace(/  - \{name: Video[^\n]*\n/, '');
    const plan = planRebase(oldData(), userEdits(), newer);
    if ('ok' in plan) throw new Error('refused');
    const r = plan.apply();
    if (!r.ok) throw new Error(r.refusal.code);
    expect(r.notes).toContainEqual({ kind: 'server-gone', server: 'JP' });
    expect(r.notes).toContainEqual({ kind: 'group-gone', group: 'Video' });
  });

  it('refuses a new config that fails the safety checks', () => {
    expect(planRebase(oldData(), userEdits(), 'a: !!python/object/apply:os.system [x]\n')).toMatchObject({ ok: false, refusal: { code: 'tags' } });
  });
});

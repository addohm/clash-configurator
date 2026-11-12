import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import {
  addGroupChanges,
  addMemberChanges,
  addRuleChanges,
  applyChange,
  type Change,
  checkRuleValue,
  groupUses,
  insertPosition,
  memberChoices,
  moveMemberChanges,
  moveRuleChanges,
  readRule,
  removeGroupChanges,
  removeManyRulesChanges,
  removeMemberChanges,
  removeRuleChanges,
  removeRuleProviderChanges,
  ruleProvidersOf,
  ruleSetUses,
  setGroupTypeChanges,
  setRuleTargetChanges,
  wouldLoop,
} from '..';

const CONFIG = `
proxies:
  - {name: HK, type: ss, server: 192.0.2.1, port: 1, cipher: aes-128-gcm, password: x}
  - {name: JP, type: ss, server: 192.0.2.2, port: 1, cipher: aes-128-gcm, password: x}
proxy-groups:
  - {name: Proxy, type: select, proxies: [Auto, HK, JP]}
  - {name: Auto, type: url-test, proxies: [HK, JP]}
  - {name: Spare, type: select, proxies: [JP]}
  - {name: Feed, type: select, use: [p], proxies: [HK]}
rule-providers:
  ads: {type: http, behavior: domain, url: https://example.com/ads.yaml}
  unused: {type: http, behavior: domain, url: https://example.com/x.yaml}
rules:
  - RULE-SET,ads,REJECT
  - IP-CIDR,10.0.0.0/8,DIRECT,no-resolve
  - DOMAIN-SUFFIX,example.com,Auto
  - MATCH,Proxy
`;

const data = () => parseDocument(CONFIG).toJS();
const run = (changes: Change[]) => {
  const doc = parseDocument(CONFIG);
  for (const c of changes) applyChange(doc, c);
  return doc.toJS();
};

describe('groups', () => {
  it('changes the type', () => {
    expect(run(setGroupTypeChanges(data(), 2, 'fallback'))['proxy-groups'][2].type).toBe('fallback');
    // @ts-expect-error: relay was removed from mihomo
    expect(() => setGroupTypeChanges(data(), 2, 'relay')).toThrow('bad type');
  });

  it('adds, moves and removes members', () => {
    expect(run(addMemberChanges(data(), 2, 'HK'))['proxy-groups'][2].proxies).toEqual(['JP', 'HK']);
    expect(run(moveMemberChanges(data(), 0, 2, 0))['proxy-groups'][0].proxies).toEqual(['JP', 'Auto', 'HK']);
    expect(run(removeMemberChanges(data(), 0, 0))['proxy-groups'][0].proxies).toEqual(['HK', 'JP']);
  });

  it('refuses an empty group, unless it takes servers from elsewhere', () => {
    expect(() => removeMemberChanges(data(), 2, 0)).toThrow('last member');
    expect(run(removeMemberChanges(data(), 3, 0))['proxy-groups'][3].proxies).toEqual([]);
  });

  it('refuses loops and duplicates', () => {
    expect(wouldLoop(data(), 'Auto', 'Proxy')).toBe(true);
    expect(() => addMemberChanges(data(), 1, 'Proxy')).toThrow('loop');
    expect(() => addMemberChanges(data(), 0, 'HK')).toThrow('already a member');
    expect(() => addMemberChanges(data(), 0, 'Nope')).toThrow('no such name');
    expect(memberChoices(data(), 'Auto')).not.toContain('Proxy');
    expect(memberChoices(data(), 'Spare')).toEqual(['HK', 'JP', 'Proxy', 'Auto', 'Feed', 'DIRECT', 'REJECT']);
  });

  it('adds a group, checking its name and members', () => {
    const d = run(addGroupChanges(data(), { name: 'Video', type: 'select', members: ['HK', 'DIRECT'] }));
    expect(d['proxy-groups'][4]).toEqual({ name: 'Video', type: 'select', proxies: ['HK', 'DIRECT'] });
    expect(() => addGroupChanges(data(), { name: 'HK', type: 'select', members: ['JP'] })).toThrow('name in use');
    expect(() => addGroupChanges(data(), { name: 'A, B', type: 'select', members: ['JP'] })).toThrow('bad name');
    expect(() => addGroupChanges(data(), { name: 'New', type: 'select', members: [] })).toThrow('last member');
  });

  it('removes a group only when nothing uses it', () => {
    expect(groupUses(data(), 'Auto')).toEqual([{ kind: 'group', group: 'Proxy' }, { kind: 'rule', index: 2 }]);
    expect(() => removeGroupChanges(data(), 'Auto')).toThrow('group in use');
    expect(groupUses(data(), 'Spare')).toEqual([]);
    expect(run(removeGroupChanges(data(), 'Spare'))['proxy-groups'].map((g: { name: string }) => g.name)).toEqual(['Proxy', 'Auto', 'Feed']);
  });
});

describe('rules', () => {
  it('reads a rule into its parts', () => {
    expect(readRule('IP-CIDR,10.0.0.0/8,DIRECT,no-resolve', 1)).toEqual({
      index: 1,
      text: 'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
      type: 'IP-CIDR',
      payload: '10.0.0.0/8',
      target: 'DIRECT',
      options: ['no-resolve'],
    });
    expect(readRule('match,Proxy', 0)).toMatchObject({ type: 'MATCH', payload: '', target: 'Proxy' });
  });

  it('adds a rule just above MATCH', () => {
    expect(insertPosition(data())).toBe(3);
    const d = run(addRuleChanges(data(), { type: 'GEOIP', value: 'cn', target: 'DIRECT', noResolve: true }));
    expect(d.rules.slice(-2)).toEqual(['GEOIP,CN,DIRECT,no-resolve', 'MATCH,Proxy']);
  });

  it('checks values', () => {
    const c = data();
    expect(checkRuleValue('DOMAIN-SUFFIX', ' Example.COM ', c)).toBe('example.com');
    expect(checkRuleValue('IP-CIDR', '192.168.0.0/16', c)).toBe('192.168.0.0/16');
    expect(checkRuleValue('DST-PORT', '443/8000-8080', c)).toBe('443/8000-8080');
    expect(checkRuleValue('RULE-SET', 'ads', c)).toBe('ads');
    for (const [type, v] of [
      ['DOMAIN', 'a,b'],
      ['DOMAIN', 'has space.com'],
      ['IP-CIDR', '300.1.1.1/8'],
      ['IP-CIDR', '10.0.0.0'],
      ['IP-CIDR6', '10.0.0.0/8'],
      ['DST-PORT', '70000'],
      ['GEOIP', 'c n'],
      ['RULE-SET', 'nope'],
      ['DOMAIN-KEYWORD', 'x\u0000'],
    ] as const) {
      expect(() => checkRuleValue(type, v, c), `${type} ${v}`).toThrow();
    }
  });

  it('refuses a target that does not exist', () => {
    expect(() => addRuleChanges(data(), { type: 'DOMAIN', value: 'a.com', target: 'Nope' })).toThrow('no such target');
  });

  it('retargets, keeping options', () => {
    expect(run(setRuleTargetChanges(data(), 1, 'Proxy')).rules[1]).toBe('IP-CIDR,10.0.0.0/8,Proxy,no-resolve');
    expect(run(setRuleTargetChanges(data(), 3, 'Auto')).rules[3]).toBe('MATCH,Auto');
    expect(setRuleTargetChanges(data(), 3, 'Proxy')).toEqual([]);
  });

  it('removes many rules at once', () => {
    expect(run(removeManyRulesChanges(data(), [0, 2, 0])).rules).toEqual(['IP-CIDR,10.0.0.0/8,DIRECT,no-resolve', 'MATCH,Proxy']);
    expect(() => removeManyRulesChanges(data(), [9])).toThrow('no such rule');
  });

  it('moves and removes rules', () => {
    expect(run(moveRuleChanges(data(), 2, 0)).rules[0]).toBe('DOMAIN-SUFFIX,example.com,Auto');
    expect(run(removeRuleChanges(data(), 0)).rules).toHaveLength(3);
    expect(() => moveRuleChanges(data(), 0, 9)).toThrow();
  });

  it('lists rule lists and removes unused ones', () => {
    expect(ruleProvidersOf(data()).map((p) => p.name)).toEqual(['ads', 'unused']);
    expect(ruleSetUses(data(), 'ads')).toEqual([0]);
    expect(() => removeRuleProviderChanges(data(), 'ads')).toThrow('rule list in use');
    expect(Object.keys(run(removeRuleProviderChanges(data(), 'unused'))['rule-providers'])).toEqual(['ads']);
  });
});

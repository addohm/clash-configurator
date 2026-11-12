import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import {
  addServersChanges,
  applyChange,
  ChangeError,
  groupsWithAllServers,
  parseLink,
  removeBlockers,
  removeManyBlockers,
  removeManyChanges,
  removeServerChanges,
  uniqueName,
} from '..';

const CONFIG = `
proxies:
  - {name: HK, type: ss, server: 192.0.2.1, port: 1, cipher: aes-128-gcm, password: x}
  - {name: JP, type: ss, server: 192.0.2.2, port: 1, cipher: aes-128-gcm, password: x}
  - {name: US, type: ss, server: 192.0.2.3, port: 1, cipher: aes-128-gcm, password: x}
proxy-groups:
  - {name: Proxy, type: select, proxies: [Auto, HK, JP, US, DIRECT]}
  - {name: Auto, type: url-test, proxies: [HK, JP, US]}
  - {name: Asia, type: select, proxies: [HK, JP]}
  - {name: OnlyUS, type: select, proxies: [US]}
rules:
  - DOMAIN,jp.example.com,JP
  - MATCH,Proxy
`;

const run = (changes: ReturnType<typeof removeServerChanges>) => {
  const doc = parseDocument(CONFIG);
  for (const c of changes) applyChange(doc, c);
  return doc.toJS();
};

describe('adding servers', () => {
  const data = parseDocument(CONFIG).toJS();

  it('suggests the groups that already list every server', () => {
    expect(groupsWithAllServers(data)).toEqual(['Proxy', 'Auto']);
  });

  it('adds them to the end of proxies and the chosen groups, with unique names', () => {
    const servers = [parseLink('trojan://pw@a.example.com:443#HK'), parseLink('trojan://pw@b.example.com:443#HK')];
    const { changes, names } = addServersChanges(data, servers, ['Proxy', 'Auto']);
    expect(names).toEqual(['HK 2', 'HK 3']);
    const d = run(changes);
    expect(d.proxies.map((p: { name: string }) => p.name)).toEqual(['HK', 'JP', 'US', 'HK 2', 'HK 3']);
    expect(d['proxy-groups'][0].proxies).toEqual(['Auto', 'HK', 'JP', 'US', 'DIRECT', 'HK 2', 'HK 3']);
    expect(d['proxy-groups'][1].proxies).toEqual(['HK', 'JP', 'US', 'HK 2', 'HK 3']);
    expect(d['proxy-groups'][2].proxies).toEqual(['HK', 'JP']);
  });

  it('refuses a group that does not exist', () => {
    expect(() => addServersChanges(data, [parseLink('trojan://pw@a.example.com:443#X')], ['Nope'])).toThrow(ChangeError);
  });

  it('makes names unique', () => {
    expect(uniqueName('A', new Set(['A', 'A 2']))).toBe('A 3');
    expect(uniqueName('B', new Set(['A']))).toBe('B');
  });
});

describe('removing many servers at once', () => {
  const data = parseDocument(CONFIG).toJS();

  it('takes them all out of every group, in one edit', () => {
    // A copy without the group that only holds US.
    const config = { ...data, 'proxy-groups': data['proxy-groups'].slice(0, 3) };
    const doc = parseDocument(CONFIG);
    doc.deleteIn(['proxy-groups', 3]);
    for (const c of removeManyChanges(config, ['HK', 'US'])) applyChange(doc, c);
    const d = doc.toJS();
    expect(d.proxies.map((p: { name: string }) => p.name)).toEqual(['JP']);
    expect(d['proxy-groups'][0].proxies).toEqual(['Auto', 'JP', 'DIRECT']);
    expect(d['proxy-groups'][1].proxies).toEqual(['JP']);
    expect(d['proxy-groups'][2].proxies).toEqual(['JP']);
  });

  it('refuses when a rule uses one, or a group would be left empty', () => {
    expect(removeManyBlockers(data, ['HK', 'JP'])).toEqual([
      { kind: 'rule', index: 0 },
      { kind: 'last-member', group: 'Asia' },
    ]);
    expect(() => removeManyChanges(data, ['HK', 'JP'])).toThrow('server in use');
    // US alone empties OnlyUS; HK and US together still do.
    expect(removeManyBlockers(data, ['HK', 'US'])).toEqual([{ kind: 'last-member', group: 'OnlyUS' }]);
  });
});

describe('removing servers', () => {
  const data = parseDocument(CONFIG).toJS();

  it('takes it out of every group', () => {
    const d = run(removeServerChanges(data, 'HK'));
    expect(d.proxies.map((p: { name: string }) => p.name)).toEqual(['JP', 'US']);
    expect(d['proxy-groups'].map((g: { proxies: string[] }) => g.proxies)).toEqual([
      ['Auto', 'JP', 'US', 'DIRECT'],
      ['JP', 'US'],
      ['JP'],
      ['US'],
    ]);
  });

  it('says what stops a removal', () => {
    expect(removeBlockers(data, 'JP')).toEqual([{ kind: 'rule', index: 0 }]);
    expect(removeBlockers(data, 'US')).toEqual([{ kind: 'last-member', group: 'OnlyUS' }]);
    expect(removeBlockers(data, 'HK')).toEqual([]);
    expect(() => removeServerChanges(data, 'JP')).toThrow('server in use');
    expect(() => removeServerChanges(data, 'Nope')).toThrow('no such server');
  });
});

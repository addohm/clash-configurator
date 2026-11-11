import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import {
  addServersChanges,
  applyChange,
  ChangeError,
  groupsWithAllServers,
  parseLink,
  removeBlockers,
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

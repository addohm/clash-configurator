import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { applyChange, type Change, exactNames, intake, linkedCopy, plain, planLink, PROVIDER_NAME, writeYaml } from '..';

// A subscription as a provider sends it (made up).
const SUB = `mixed-port: 7890
proxies:
  - {name: '[CN] Daily 1', type: ss, server: 192.0.2.1, port: 1, cipher: aes-128-gcm, password: x}
  - {name: '[CN] Daily 2', type: ss, server: 192.0.2.2, port: 1, cipher: aes-128-gcm, password: x}
  - {name: HK, type: ss, server: 192.0.2.3, port: 1, cipher: aes-128-gcm, password: x}
  - {name: JP, type: ss, server: 192.0.2.4, port: 1, cipher: aes-128-gcm, password: x}
proxy-groups:
  - {name: Proxy, type: select, proxies: ['[CN] Daily 1', '[CN] Daily 2', HK, JP, DIRECT]}
  - {name: Video, type: select, proxies: [Proxy, DIRECT, HK, JP]}
rules:
  - MATCH,Proxy
`;
const URL = 'https://sub.example.com/api/v1/client/subscribe?token=fake';

function edited(changes: Change[]) {
  const doc = parseDocument(SUB);
  for (const c of changes) applyChange(doc, c);
  return doc;
}

/** The plan for these edits, and the linked result. */
function link(changes: Change[]) {
  const doc = edited(changes);
  const p = planLink(plain(parseDocument(SUB)), plain(doc), URL);
  return { p, d: p.ok ? plain(linkedCopy(doc, p)) : {}, doc };
}

describe('linking servers to the subscription', () => {
  it('with no edits: every group uses the provider', () => {
    const { p, d } = link([]);
    expect(p.ok).toBe(true);
    // Proxy listed its servers before DIRECT; a provider's servers come after.
    expect(p.losses).toEqual([{ kind: 'first', group: 'Proxy', was: '[CN] Daily 1', now: 'DIRECT' }]);
    expect(d['proxies']).toBeUndefined();
    expect(d['proxy-providers']).toEqual({
      [PROVIDER_NAME]: {
        type: 'http',
        url: URL,
        interval: 43200,
        path: `./proxy_providers/${PROVIDER_NAME}.yaml`,
        header: { 'User-Agent': ['Clash-Verge/1.0 (clash-verge-rev; mihomo)'] },
      },
    });
    const groups = d['proxy-groups'] as Record<string, unknown>[];
    expect(groups[0]).toEqual({ name: 'Proxy', type: 'select', proxies: ['DIRECT'], use: [PROVIDER_NAME] });
    // Video lists only HK and JP: a filter keeps it that way.
    expect(groups[1]).toEqual({ name: 'Video', type: 'select', proxies: ['Proxy', 'DIRECT'], use: [PROVIDER_NAME], filter: '^(?:HK|JP)$' });
  });

  it('keeps which servers were kept, and renames, and says new ones will be hidden', () => {
    const { p, d } = link([
      // Remove JP (out of both groups, then the server).
      { op: 'delete', path: ['proxy-groups', 1, 'proxies', 3] },
      { op: 'delete', path: ['proxy-groups', 0, 'proxies', 3] },
      { op: 'delete', path: ['proxies', 3] },
      // Rename HK.
      { op: 'set', path: ['proxies', 2, 'name'], value: 'Hong Kong' },
      { op: 'set', path: ['proxy-groups', 0, 'proxies', 2], value: 'Hong Kong' },
      { op: 'set', path: ['proxy-groups', 1, 'proxies', 2], value: 'Hong Kong' },
    ]);
    expect(p.ok).toBe(true);
    expect(p.losses).toContainEqual({ kind: 'new-servers-hidden' });
    const provider = (d['proxy-providers'] as Record<string, Record<string, unknown>>)[PROVIDER_NAME];
    expect(provider?.['filter']).toBe(exactNames(['[CN] Daily 1', '[CN] Daily 2', 'HK', 'Hong Kong']));
    expect(provider?.['override']).toEqual({ 'proxy-name': [{ pattern: '^(?:HK)$', target: 'Hong Kong' }] });
  });

  it("reports a group that would start somewhere else, or lose its priority order", () => {
    // Video moved JP to the top; with the provider it would start on Proxy.
    const { p } = link([{ op: 'move', path: ['proxy-groups', 1, 'proxies'], from: 3, to: 0 }]);
    expect(p.losses).toContainEqual({ kind: 'first', group: 'Video', was: 'JP', now: 'Proxy' });
    const fb = link([
      { op: 'set', path: ['proxy-groups', 1, 'type'], value: 'fallback' },
      { op: 'move', path: ['proxy-groups', 1, 'proxies'], from: 3, to: 2 },
    ]);
    expect(fb.p.losses).toContainEqual({ kind: 'order', group: 'Video' });
    // Order means nothing to a fastest-server group.
    const ut = link([{ op: 'set', path: ['proxy-groups', 1, 'type'], value: 'url-test' }, { op: 'move', path: ['proxy-groups', 1, 'proxies'], from: 3, to: 2 }]);
    expect(ut.p.losses.filter((l) => l.kind !== 'first' || l.group !== 'Proxy')).toEqual([]);
  });

  it("reports a server's own settings that would be replaced", () => {
    const { p } = link([{ op: 'set', path: ['proxies', 2, 'port'], value: 8443 }]);
    expect(p.losses).toContainEqual({ kind: 'server-settings', server: 'HK' });
  });

  it("keeps the user's own servers in the file", () => {
    const { d } = link([
      { op: 'insert', path: ['proxies'], value: { name: 'Mine', type: 'ss', server: '198.51.100.9', port: 1, cipher: 'aes-128-gcm', password: 'y' } },
      { op: 'insert', path: ['proxy-groups', 0, 'proxies'], value: 'Mine' },
    ]);
    expect((d['proxies'] as { name: string }[]).map((s) => s.name)).toEqual(['Mine']);
    expect((d['proxy-groups'] as Record<string, unknown>[])[0]?.['proxies']).toEqual(['DIRECT', 'Mine']);
  });

  it('is refused when a rule names a subscription server', () => {
    const { p } = link([{ op: 'insert', path: ['rules'], index: 0, value: 'DOMAIN,a.example.com,HK' }]);
    expect(p).toMatchObject({ ok: false, blockers: [{ kind: 'rule', index: 0, server: 'HK' }] });
  });

  it('writes a config intake accepts, with the provider above the groups', () => {
    const { p, doc } = link([]);
    const out = writeYaml(linkedCopy(doc, p), SUB);
    expect(intake(out).ok).toBe(true);
    expect(out.indexOf('proxy-providers:')).toBeLessThan(out.indexOf('proxy-groups:'));
    // The edited document itself is untouched.
    expect(writeYaml(doc, SUB)).toBe(SUB);
  });

  it("warns when servers are found through the provider's own DNS", () => {
    const sub = SUB.replace('mixed-port: 7890', "mixed-port: 7890\ndns:\n  nameserver-policy:\n    '+.example.net,geosite:cn': [https://dns.example/dns-query]")
      .replace('server: 192.0.2.3', 'server: hk.example.net')
      .replace('server: 192.0.2.4', 'server: jp.example.net');
    const p = planLink(plain(parseDocument(sub)), plain(parseDocument(sub)), URL);
    expect(p.warnings).toEqual([{ kind: 'provider-dns', count: 2, patterns: ['+.example.net'] }]);
    expect(link([]).p.warnings).toEqual([]);
  });

  it('escapes names for the filters', () => {
    expect(exactNames(['[RLT][CN] Daily (1)', 'a.b|c'])).toBe('^(?:\\[RLT\\]\\[CN\\] Daily \\(1\\)|a\\.b\\|c)$');
    expect(new RegExp(exactNames(['[RLT][CN] Daily (1)'])).test('[RLT][CN] Daily (1)')).toBe(true);
  });
});

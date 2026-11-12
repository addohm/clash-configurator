import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { intake, parseLink, proxyDns, stashChanges, toShadowrocket, toStash, unusedBy } from '..';

const FIXTURES = import.meta.glob<string>('../../../fixtures/configs/*', { query: '?raw', import: 'default', eager: true });
const fixture = (name: string): string => {
  const text = FIXTURES[`../../../fixtures/configs/${name}`];
  if (text === undefined) throw new Error(`no fixture ${name}`);
  return text;
};
const lines = (t: string) => t.split(/\r?\n/);
// Merge keys on, as intake reads configs (`<<: *auto` in groups).
const data = (text: string) => parseDocument(text, { merge: true }).toJS() as Record<string, unknown>;

/** The original's lines that aren't in the output, and the output's that aren't in the original. */
function difference(before: string, after: string) {
  const a = lines(before);
  const b = lines(after);
  return { gone: a.filter((l) => !b.includes(l)), added: b.filter((l) => !a.includes(l)) };
}

describe('Stash', () => {
  const original = fixture('provider-basic.yaml');

  it('leaves out the settings Stash sets itself, and changes nothing else', () => {
    const { text, dropped } = toStash(parseDocument(original), original);
    expect(dropped).toEqual([
      { kind: 'setting', key: 'mixed-port' },
      { kind: 'setting', key: 'allow-lan' },
      { kind: 'setting', key: 'unified-delay' },
      { kind: 'setting', key: 'external-controller' },
      { kind: 'setting', key: 'secret' },
      { kind: 'setting', key: 'dns.enable' },
      { kind: 'setting', key: 'dns.ipv6' },
      { kind: 'setting', key: 'dns.enhanced-mode' },
      { kind: 'setting', key: 'dns.fake-ip-range' },
    ]);
    const { gone, added } = difference(original, text);
    expect(gone).toEqual([
      'mixed-port: 7897',
      'allow-lan: false',
      'unified-delay: true',
      'external-controller: 127.0.0.1:9097',
      'secret: fake-secret-123',
      '  enable: true',
      '  ipv6: false',
      '  enhanced-mode: fake-ip',
      '  fake-ip-range: 198.18.0.1/16',
      '    servername: www.example.com',
      '    password: fake-password-2',
    ]);
    expect(added).toEqual(['    sni: www.example.com', '    auth: fake-password-2']);
    expect(intake(text).ok).toBe(true);
  });

  it('keeps the CRLF original laid out the same', () => {
    const crlf = original.replace(/\r?\n/g, '\r\n');
    const lf = toStash(parseDocument(original), original).text;
    expect(lines(toStash(parseDocument(crlf), crlf).text)).toEqual(lines(lf));
  });

  it("leaves out rule types Stash doesn't have", () => {
    const config = data('rules:\n  - DOMAIN,a.com,DIRECT\n  - SUB-RULE,(NETWORK,tcp),sub\n  - IN-PORT,7890,DIRECT\n  - MATCH,DIRECT\n');
    const { changes, dropped } = stashChanges(config);
    expect(changes).toEqual([
      { op: 'delete', path: ['rules', 2] },
      { op: 'delete', path: ['rules', 1] },
    ]);
    expect(dropped).toEqual([
      { kind: 'rule', rule: 'SUB-RULE,(NETWORK,tcp),sub' },
      { kind: 'rule', rule: 'IN-PORT,7890,DIRECT' },
    ]);
  });
});

describe('Shadowrocket', () => {
  const config = data(fixture('provider-basic.yaml'));

  it('writes the .conf: general, groups, rules', () => {
    const { conf, dropped } = toShadowrocket(config);
    expect(lines(conf).slice(2)).toEqual([
      '[General]',
      'bypass-system = true',
      'skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, localhost, *.local',
      'dns-server = https://doh.pub/dns-query, https://dns.alidns.com/dns-query',
      'proxy-dns-server = https://doh.pub/dns-query',
      'ipv6 = false',
      '',
      '[Proxy Group]',
      'Proxy = select, Auto, 🇭🇰 Hong Kong 01, 🇯🇵 Tokyo 01, 🇸🇬 Singapore 01, 🇺🇸 Los Angeles 01, DIRECT',
      'Auto = url-test, 🇭🇰 Hong Kong 01, 🇯🇵 Tokyo 01, 🇸🇬 Singapore 01, 🇺🇸 Los Angeles 01, url=https://www.gstatic.com/generate_204, interval=300, tolerance=50',
      'Asia = url-test, 🇭🇰 Hong Kong 01, 🇯🇵 Tokyo 01, 🇸🇬 Singapore 01, url=https://www.gstatic.com/generate_204, interval=300, tolerance=50',
      '',
      '[Rule]',
      'DOMAIN-SUFFIX,local,DIRECT',
      'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve',
      'GEOIP,CN,DIRECT,no-resolve',
      'FINAL,Proxy',
      '',
    ]);
    expect(dropped).toEqual([{ kind: 'rule', rule: 'GEOSITE,cn,DIRECT' }]);
  });

  it('writes every server as a share link that reads back the same', () => {
    const { nodes, links } = toShadowrocket(config);
    expect(links).toHaveLength(4);
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(nodes), (c) => c.charCodeAt(0)));
    expect(decoded.split('\n')).toEqual(links);
    // write.test.ts checks every field; here, that each server is the one it came from.
    const key = (p: Record<string, unknown>) => [p['name'], p['type'], p['server'], p['port'], p['uuid'] ?? p['password']];
    expect(links.map((l) => key(parseLink(l)))).toEqual((config['proxies'] as Record<string, unknown>[]).map(key));
  });

  it('turns mihomo-only rules and policies into what Shadowrocket has, or leaves them out', () => {
    const { conf, dropped } = toShadowrocket(
      data(`rule-providers:
  ads: {type: http, behavior: domain, format: text, url: 'https://example.com/ads.txt', path: ./a.txt}
  cn: {type: http, behavior: ipcidr, format: mrs, url: 'https://example.com/cn.mrs', path: ./c.mrs}
proxy-groups:
  - {name: Pick, type: select, proxies: [DIRECT, PASS], use: [sub], filter: '(?i)hk|jp'}
  - {name: Best, type: fallback, proxies: [Pick, DIRECT], timeout: 2500}
rules:
  - RULE-SET,ads,REJECT-DROP
  - RULE-SET,cn,DIRECT
  - NETWORK,udp,REJECT
  - AND,((DOMAIN,a.com),(NETWORK,udp)),DIRECT
  - OR,((GEOSITE,cn),(DOMAIN,b.com)),DIRECT
  - DOMAIN-REGEX,^x,DIRECT
  - DOMAIN,c.com,PASS
  - MATCH,Best
`),
    );
    expect(conf).toContain('Pick = select, DIRECT, policy-regex-filter=(?i)hk|jp\n');
    expect(conf).toContain('Best = select, Pick, DIRECT\n');
    expect(conf).toContain(
      ['[Rule]', 'DOMAIN-SET,https://example.com/ads.txt,REJECT', 'PROTOCOL,UDP,REJECT', 'AND,((DOMAIN,a.com),(PROTOCOL,UDP)),DIRECT', 'FINAL,Best'].join('\n'),
    );
    expect(dropped).toEqual([
      { kind: 'group', name: 'Best', reason: 'nested' },
      { kind: 'rule', rule: 'RULE-SET,cn,DIRECT' },
      { kind: 'rule', rule: 'OR,((GEOSITE,cn),(DOMAIN,b.com)),DIRECT' },
      { kind: 'rule', rule: 'DOMAIN-REGEX,^x,DIRECT' },
      { kind: 'rule', rule: 'DOMAIN,c.com,PASS' },
    ]);
  });

  it('resolves server names with the DNS mihomo would use for them, never a mix', () => {
    const servers = `proxies:
  - {name: A, type: trojan, server: a.node.example, port: 443, password: x}
  - {name: B, type: trojan, server: b.node.example, port: 443, password: x}
  - {name: C, type: trojan, server: c.other.example, port: 443, password: x}
`;
    const policy = `dns:
  nameserver-policy:
    '+.node.example': ['https://dns.provider.example/dns-query', 'https://dns2.provider.example/dns-query#Proxy']
    '+.other.example,+.more.example': [223.5.5.5]
    'geosite:cn': [119.29.29.29]
`;
    expect(proxyDns(data(servers + policy))).toEqual(['https://dns.provider.example/dns-query']);
    expect(proxyDns(data(servers + policy + '  proxy-server-nameserver: [udp://1.1.1.1, system]\n'))).toEqual(['1.1.1.1']);
    expect(proxyDns(data(servers))).toEqual([]);
  });

  it("lists servers it can't write as links", () => {
    const { links, dropped } = toShadowrocket(
      data(`proxies:
  - {name: W, type: wireguard, server: 192.0.2.1, port: 51820, private-key: x}
  - {name: P, type: ss, server: 192.0.2.2, port: 8388, cipher: aes-128-gcm, password: x, plugin: obfs}
proxy-providers:
  sub: {type: http, url: 'https://example.com/sub', path: ./sub.yaml}
`),
    );
    expect(links).toEqual([]);
    expect(dropped).toEqual([
      { kind: 'server', name: 'W', reason: 'wireguard' },
      { kind: 'server', name: 'P', reason: 'plugin' },
      { kind: 'setting', key: 'proxy-providers' },
    ]);
  });
});

describe('settings each app leaves out', () => {
  it('matches what each file is written from', () => {
    const keys = ['mixed-port', 'allow-lan', 'mode', 'ipv6', 'tun', 'external-controller', 'dns.enable', 'dns.enhanced-mode', 'dns.nameserver', 'dns.fake-ip-filter'];
    const unused = (app: 'mihomo' | 'stash' | 'shadowrocket') => keys.filter((k) => unusedBy(app, k));
    expect(unused('mihomo')).toEqual([]);
    expect(unused('stash')).toEqual(['mixed-port', 'allow-lan', 'tun', 'external-controller', 'dns.enable', 'dns.enhanced-mode']);
    expect(unused('shadowrocket')).toEqual(['mixed-port', 'allow-lan', 'mode', 'tun', 'external-controller', 'dns.enable', 'dns.enhanced-mode', 'dns.fake-ip-filter']);
  });
});

import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { applyChange, ChangeError, namesInUse, renameChanges, renameRuleTarget, splitRule } from '..';

describe('rules', () => {
  it('splits on top-level commas only', () => {
    expect(splitRule('DOMAIN-SUFFIX,example.com,Proxy')).toEqual(['DOMAIN-SUFFIX', 'example.com', 'Proxy']);
    expect(splitRule('AND,((DOMAIN,a.com),(NETWORK,UDP)),Proxy')).toEqual(['AND', '((DOMAIN,a.com),(NETWORK,UDP))', 'Proxy']);
  });

  it('renames only the target', () => {
    expect(renameRuleTarget('MATCH,Proxy', 'Proxy', 'Main')).toBe('MATCH,Main');
    expect(renameRuleTarget('IP-CIDR,10.0.0.0/8,Proxy,no-resolve', 'Proxy', 'Main')).toBe('IP-CIDR,10.0.0.0/8,Main,no-resolve');
    expect(renameRuleTarget('DOMAIN, Proxy.com, Proxy', 'Proxy', 'Main')).toBe('DOMAIN, Proxy.com, Main');
    expect(renameRuleTarget('AND,((DOMAIN,Proxy),(NETWORK,UDP)),Proxy', 'Proxy', 'M$&')).toBe('AND,((DOMAIN,Proxy),(NETWORK,UDP)),M$&');
    expect(renameRuleTarget('DOMAIN,Proxy,DIRECT', 'Proxy', 'Main')).toBeNull();
  });
});

const CONFIG = `
proxies:
  - {name: HK, type: ss, server: 192.0.2.1, port: 1, cipher: aes-128-gcm, password: x}
  - {name: JP, type: ss, server: 192.0.2.2, port: 1, cipher: aes-128-gcm, password: x, dialer-proxy: HK}
proxy-groups:
  - {name: Proxy, type: select, proxies: [HK, JP, DIRECT]}
  - {name: Auto, type: url-test, proxies: [HK, JP]}
rules:
  - DOMAIN,hk.example.com,HK
  - MATCH,Proxy
sub-rules:
  extra: ['MATCH,HK']
listeners:
  - {name: in, type: socks, port: 1080, listen: 127.0.0.1, proxy: HK}
tunnels:
  - tcp/udp,127.0.0.1:53,198.51.100.53:53,HK
  - {network: [tcp], address: 127.0.0.1:80, target: example.com:80, proxy: HK}
proxy-providers:
  p: {type: http, url: https://example.com/p, proxy: HK}
dns:
  nameserver: [https://dns.example/dns-query#HK, 223.5.5.5]
  nameserver-policy:
    'geosite:cn': https://dns.example/dns-query#HK
    '+.example.org': [tls://dns.example#HK]
`;

describe('renaming', () => {
  it('renames a server everywhere it is named', () => {
    const doc = parseDocument(CONFIG);
    for (const c of renameChanges(doc.toJS(), 'HK', 'Hong Kong')) applyChange(doc, c);
    const text = doc.toString();
    expect(text).not.toMatch(/[,[ ]HK[\],\n}]|#HK/);
    const d = doc.toJS();
    expect(d.proxies[0].name).toBe('Hong Kong');
    expect(d.proxies[1]['dialer-proxy']).toBe('Hong Kong');
    expect(d['proxy-groups'][0].proxies).toEqual(['Hong Kong', 'JP', 'DIRECT']);
    expect(d.rules[0]).toBe('DOMAIN,hk.example.com,Hong Kong');
    expect(d['sub-rules'].extra).toEqual(['MATCH,Hong Kong']);
    expect(d.listeners[0].proxy).toBe('Hong Kong');
    expect(d.tunnels[0]).toBe('tcp/udp,127.0.0.1:53,198.51.100.53:53,Hong Kong');
    expect(d.tunnels[1].proxy).toBe('Hong Kong');
    expect(d['proxy-providers'].p.proxy).toBe('Hong Kong');
    expect(d.dns.nameserver).toEqual(['https://dns.example/dns-query#Hong Kong', '223.5.5.5']);
    expect(d.dns['nameserver-policy']['+.example.org']).toEqual(['tls://dns.example#Hong Kong']);
  });

  it('renames a group in rules and other groups', () => {
    const doc = parseDocument(CONFIG);
    for (const c of renameChanges(doc.toJS(), 'Proxy', 'Main')) applyChange(doc, c);
    expect(doc.toJS().rules).toEqual(['DOMAIN,hk.example.com,HK', 'MATCH,Main']);
  });

  it('refuses names that would break the config', () => {
    const data = parseDocument(CONFIG).toJS();
    const refuse = (from: string, to: string, why: string) =>
      expect(() => renameChanges(data, from, to)).toThrow(new ChangeError(why));
    refuse('HK', 'JP', 'name in use');
    refuse('HK', 'DIRECT', 'name in use');
    refuse('HK', 'Proxy', 'name in use');
    refuse('HK', 'Hong, Kong', 'bad name');
    refuse('HK', ' HK2', 'bad name');
    refuse('HK', '', 'bad name');
    refuse('DIRECT', 'Straight', 'built-in name');
    refuse('Nowhere', 'X', 'no such name');
    expect(renameChanges(data, 'HK', 'HK')).toEqual([]);
  });

  it('knows which names are taken', () => {
    expect([...namesInUse(parseDocument(CONFIG).toJS())]).toEqual(
      expect.arrayContaining(['HK', 'JP', 'Proxy', 'Auto', 'DIRECT', 'REJECT']),
    );
  });
});

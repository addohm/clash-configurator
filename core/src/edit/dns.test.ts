import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import {
  addToDnsList,
  applyChange,
  type Change,
  checkDnsServer,
  checkDomainPattern,
  checkPolicyPattern,
  moveInDnsList,
  policiesOf,
  removeFromDnsList,
  removePolicyChanges,
  setPolicyChanges,
} from '..';

const CONFIG = `
proxies:
  - {name: HK, type: ss, server: 192.0.2.1, port: 1, cipher: aes-128-gcm, password: x}
proxy-groups:
  - {name: Proxy, type: select, proxies: [HK]}
  - {name: Proxy Group, type: select, proxies: [HK]}
dns:
  enable: true
  nameserver: [https://doh.pub/dns-query, 223.5.5.5]
  fake-ip-filter: ['*.lan']
  nameserver-policy:
    'geosite:cn': https://doh.pub/dns-query
    '+.example.org,example.net': [tls://dns.example.com, 1.1.1.1]
`;
const data = () => parseDocument(CONFIG).toJS();
const run = (changes: Change[]) => {
  const doc = parseDocument(CONFIG);
  for (const c of changes) applyChange(doc, c);
  return doc.toJS().dns;
};

describe('DNS values', () => {
  it('accepts the server forms mihomo reads', () => {
    for (const v of [
      '223.5.5.5',
      '223.5.5.5:53',
      '[2001:db8::1]:53',
      '2001:4860:4860::8888',
      'https://dns.google/dns-query',
      'https://1.1.1.1/dns-query#Proxy',
      'https://dns.google/dns-query#Proxy&h3=true',
      'https://dns.google/dns-query#Proxy Group',
      'tls://dns.example.com:853',
      'quic://dns.adguard.com',
      'dhcp://en0',
      'system',
    ]) {
      expect(checkDnsServer(v, data()), v).toBe(v);
    }
  });

  it('refuses the rest', () => {
    for (const v of ['', 'dns.google', 'http://x.com', '999.1.1.1', 'https://a b', 'https://a b#Proxy', 'https://x#Nope', 'a,b']) {
      expect(() => checkDnsServer(v, data()), v).toThrow();
    }
  });

  it('checks fake-IP and per-site patterns', () => {
    expect(checkDomainPattern('+.Example.com')).toBe('+.example.com');
    expect(checkDomainPattern('geosite:CN')).toBe('geosite:cn');
    expect(checkDomainPattern('*.lan')).toBe('*.lan');
    for (const v of ['', 'a b', 'a..b', 'x,y', 'geosite:']) expect(() => checkDomainPattern(v), v).toThrow();
    expect(checkPolicyPattern('+.a.com,b.com')).toBe('+.a.com,b.com');
  });
});

describe('DNS changes', () => {
  it('adds, moves and removes servers and exceptions', () => {
    expect(run(addToDnsList(data(), 'nameserver', 'tls://1.1.1.1')).nameserver).toEqual(['https://doh.pub/dns-query', '223.5.5.5', 'tls://1.1.1.1']);
    expect(run(moveInDnsList(data(), 'nameserver', 1, 0)).nameserver).toEqual(['223.5.5.5', 'https://doh.pub/dns-query']);
    expect(run(removeFromDnsList(data(), 'nameserver', 0)).nameserver).toEqual(['223.5.5.5']);
    expect(run(addToDnsList(data(), 'fake-ip-filter', '+.msftconnecttest.com'))['fake-ip-filter']).toEqual(['*.lan', '+.msftconnecttest.com']);
    expect(() => addToDnsList(data(), 'fake-ip-filter', '*.lan')).toThrow('already a member');
  });

  it('creates a list the config does not have yet', () => {
    expect(run(addToDnsList(data(), 'proxy-server-nameserver', '223.5.5.5'))['proxy-server-nameserver']).toEqual(['223.5.5.5']);
  });

  it('only takes plain addresses for default-nameserver', () => {
    expect(() => addToDnsList(data(), 'default-nameserver', 'https://dns.google/dns-query')).toThrow('needs an address');
    expect(run(addToDnsList(data(), 'default-nameserver', 'https://1.1.1.1/dns-query'))['default-nameserver']).toEqual(['https://1.1.1.1/dns-query']);
  });

  it('reads, sets and removes per-site DNS', () => {
    expect(policiesOf(data())).toEqual([
      { pattern: 'geosite:cn', servers: ['https://doh.pub/dns-query'] },
      { pattern: '+.example.org,example.net', servers: ['tls://dns.example.com', '1.1.1.1'] },
    ]);
    const d = run(setPolicyChanges(data(), '+.corp.example', ['10.0.0.53']));
    expect(d['nameserver-policy']['+.corp.example']).toBe('10.0.0.53');
    expect(run(setPolicyChanges(data(), 'geosite:cn', ['223.5.5.5', '119.29.29.29']))['nameserver-policy']['geosite:cn']).toEqual(['223.5.5.5', '119.29.29.29']);
    expect(Object.keys(run(removePolicyChanges(data(), 'geosite:cn'))['nameserver-policy'])).toEqual(['+.example.org,example.net']);
    expect(() => setPolicyChanges(data(), 'x.com', [])).toThrow('last member');
  });
});

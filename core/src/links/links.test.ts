import { describe, expect, it } from 'vitest';
import { LinkError, parseLink, parseLinks } from '.';

const UUID = '00000000-0000-4000-8000-000000000001';
const code = (link: string) => {
  try {
    parseLink(link);
    return 'parsed';
  } catch (e) {
    return e instanceof LinkError ? e.code : 'crashed';
  }
};

describe('share links', () => {
  it('vless with Reality', () => {
    expect(
      parseLink(
        `vless://${UUID}@192.0.2.10:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.example.com&fp=chrome&pbk=FAKEKEY&sid=0123abcd&type=tcp#%F0%9F%87%AD%F0%9F%87%B0%20HK%2001`,
      ),
    ).toEqual({
      name: '🇭🇰 HK 01',
      type: 'vless',
      server: '192.0.2.10',
      port: 443,
      uuid: UUID,
      udp: true,
      tls: true,
      servername: 'www.example.com',
      'client-fingerprint': 'chrome',
      'reality-opts': { 'public-key': 'FAKEKEY', 'short-id': '0123abcd' },
      flow: 'xtls-rprx-vision',
    });
  });

  it('vless over websocket with TLS', () => {
    expect(parseLink(`vless://${UUID}@ws.example.com:443?security=tls&type=ws&path=%2Fray&host=cdn.example.com&sni=ws.example.com#WS`)).toMatchObject({
      network: 'ws',
      tls: true,
      servername: 'ws.example.com',
      'ws-opts': { path: '/ray', headers: { Host: 'cdn.example.com' } },
    });
  });

  it('trojan, with peer as the SNI', () => {
    expect(parseLink('trojan://fake%40pass@jp.example.net:443?peer=jp.example.net&allowInsecure=1#JP')).toEqual({
      name: 'JP',
      type: 'trojan',
      server: 'jp.example.net',
      port: 443,
      password: 'fake@pass',
      udp: true,
      sni: 'jp.example.net',
      'skip-cert-verify': true,
    });
  });

  it('shadowsocks, SIP002 and the old all-base64 form', () => {
    const want = { type: 'ss', server: '198.51.100.40', port: 8388, cipher: 'aes-256-gcm', password: 'fake-pw' };
    expect(parseLink(`ss://${btoa('aes-256-gcm:fake-pw')}@198.51.100.40:8388#US`)).toMatchObject({ name: 'US', ...want });
    expect(parseLink(`ss://${btoa('aes-256-gcm:fake-pw@198.51.100.40:8388')}#US`)).toMatchObject(want);
    expect(parseLink('ss://2022-blake3-aes-128-gcm:ZmFrZQ%3D%3D@192.0.2.5:443#x')).toMatchObject({ password: 'ZmFrZQ==' });
  });

  it('hysteria2, with port hopping either way', () => {
    expect(parseLink('hysteria2://fake-pw@192.0.2.20:443/?sni=tokyo.example.com&obfs=salamander&obfs-password=ob&mport=20000-30000#Tokyo')).toEqual({
      name: 'Tokyo',
      type: 'hysteria2',
      server: '192.0.2.20',
      port: 443,
      password: 'fake-pw',
      sni: 'tokyo.example.com',
      obfs: 'salamander',
      'obfs-password': 'ob',
      ports: '20000-30000',
    });
    expect(parseLink('hy2://fake-pw@192.0.2.20:443,20000-30000?insecure=1#T')).toMatchObject({ port: 443, ports: '443,20000-30000', 'skip-cert-verify': true });
  });

  it('vmess (base64 JSON)', () => {
    const j = { v: '2', ps: 'HK vmess', add: 'hk.example.net', port: '30001', id: UUID, aid: '0', net: 'ws', path: '/v', host: 'hk.example.net', tls: 'tls' };
    expect(parseLink(`vmess://${btoa(JSON.stringify(j))}`)).toMatchObject({
      name: 'HK vmess',
      type: 'vmess',
      server: 'hk.example.net',
      port: 30001,
      uuid: UUID,
      alterId: 0,
      cipher: 'auto',
      tls: true,
      network: 'ws',
      'ws-opts': { path: '/v', headers: { Host: 'hk.example.net' } },
    });
  });

  it('names: decoded, commas replaced, and the address when there is none', () => {
    expect(parseLink(`trojan://pw@a.example.com:443#One%2C%20Two`)['name']).toBe('One Two');
    expect(parseLink(`trojan://pw@a.example.com:443`)['name']).toBe('a.example.com:443');
  });

  it('a newline in a name becomes a space, so it stays one line', () => {
    expect(parseLink('trojan://pw@a.example.com:443#x%0Aexternal-controller%3A%200.0.0.0')['name']).toBe('x external-controller: 0.0.0.0');
    expect(code('trojan://pw%0A@a.example.com:443')).toBe('unsupported-option');
  });

  it('IPv6 addresses', () => {
    expect(parseLink(`trojan://pw@[2001:db8::1]:443#v6`)['server']).toBe('2001:db8::1');
    // Without brackets, as some subscriptions write them: the last part is the port.
    expect(parseLink(`trojan://pw@2001:db8:0:0:0:0:0:1:443#v6`)).toMatchObject({ server: '2001:db8:0:0:0:0:0:1', port: 443 });
  });

  it('refuses what it cannot read faithfully', () => {
    expect(code('https://example.com')).toBe('unsupported-type');
    expect(code('not a link')).toBe('not-a-link');
    expect(code(`vless://not-a-uuid@a.example.com:443`)).toBe('bad-id');
    expect(code(`vless://${UUID}@a.example.com:70000`)).toBe('bad-port');
    expect(code(`vless://${UUID}@bad host:443`)).toBe('bad-address');
    expect(code(`vless://${UUID}@a.example.com:443?encryption=aes`)).toBe('unsupported-option');
    expect(code(`vless://${UUID}@a.example.com:443?security=reality`)).toBe('unsupported-option');
    expect(code(`vless://${UUID}@a.example.com:443?type=kcp`)).toBe('unsupported-option');
    expect(code('trojan://@a.example.com:443')).toBe('missing-password');
    expect(code(`ss://${btoa('aes-256-gcm:pw')}@a.example.com:443?plugin=obfs-local`)).toBe('unsupported-option');
    expect(code(`ss://${btoa('rot13:pw')}@a.example.com:443`)).toBe('unsupported-option');
    expect(code('hy2://pw@a.example.com:443?obfs=other')).toBe('unsupported-option');
    expect(code(`vmess://${btoa('[1]')}`)).toBe('not-a-link');
  });
});

describe('lists of links', () => {
  const list = [`trojan://pw@a.example.com:443#A`, '', `trojan://pw@b.example.com:443#B`, 'nonsense'].join('\n');

  it('reads one per line and reports bad lines', () => {
    const r = parseLinks(list);
    expect(r.servers.map((s) => s['name'])).toEqual(['A', 'B']);
    expect(r.errors).toEqual([{ line: 4, code: 'not-a-link', detail: '' }]);
  });

  it('reads a base64 subscription', () => {
    expect(parseLinks(btoa(list)).servers).toHaveLength(2);
  });
});

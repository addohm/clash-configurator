import { describe, expect, it } from 'vitest';
import { parseLink, writeLink } from '.';

const UUID = '00000000-0000-4000-8000-000000000001';
const LINKS = [
  `vless://${UUID}@192.0.2.10:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.example.com&fp=chrome&pbk=FAKEKEY&sid=0123abcd&type=tcp#%F0%9F%87%AD%F0%9F%87%B0%20HK%2001`,
  `vless://${UUID}@ws.example.com:443?security=tls&type=ws&path=%2Fray&host=cdn.example.com&sni=ws.example.com#WS`,
  `vless://${UUID}@g.example.com:443?security=tls&type=grpc&serviceName=svc&sni=g.example.com#gRPC`,
  'trojan://fake%40pass@jp.example.net:443?peer=jp.example.net&allowInsecure=1#JP',
  `ss://${btoa('aes-256-gcm:fake-pw')}@198.51.100.40:8388#US`,
  'hysteria2://fake-pw@192.0.2.20:443/?sni=tokyo.example.com&obfs=salamander&obfs-password=ob&mport=20000-30000#Tokyo',
  `trojan://pw@[2001:db8::1]:443#v6`,
  `vmess://${btoa(JSON.stringify({ v: '2', ps: 'HK vmess', add: 'hk.example.net', port: '30001', id: UUID, aid: '0', net: 'ws', path: '/v', host: 'hk.example.net', tls: 'tls' }))}`,
];

describe('writing share links', () => {
  for (const link of LINKS) {
    it(`reads back the same server: ${link.slice(0, 40)}…`, () => {
      const server = parseLink(link);
      const written = writeLink(server);
      if (!written.ok) throw new Error(written.reason);
      expect(parseLink(written.link)).toEqual(server);
    });
  }

  it('reads a mihomo Stash-style hysteria2 with auth', () => {
    const w = writeLink({ name: 'H', type: 'hysteria2', server: 'h.example.com', port: 443, auth: 'pw' });
    expect(w.ok && parseLink(w.link)['password']).toBe('pw');
  });

  it("says what it can't write", () => {
    expect(writeLink({ name: 'W', type: 'wireguard', server: 'x', port: 1 })).toEqual({ ok: false, reason: 'unsupported-type', detail: 'wireguard' });
    expect(writeLink({ name: 'S', type: 'ss', server: 'x', port: 1, cipher: 'aes-128-gcm', password: 'p', plugin: 'obfs' })).toMatchObject({ ok: false, detail: 'plugin' });
  });
});

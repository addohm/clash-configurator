import { describe, expect, it } from 'vitest';
import { intake, readInput } from '..';

const UUID = '00000000-0000-4000-8000-000000000001';
const LINKS = [
  `vless://${UUID}@192.0.2.10:443?security=reality&sni=www.example.com&fp=chrome&pbk=KEY&sid=ab&type=tcp#HK%2001`,
  'trojan://pw@jp.example.net:443?sni=jp.example.net#JP',
  'trojan://pw@jp2.example.net:443?sni=jp2.example.net#JP',
].join('\n');

const FIXTURES = import.meta.glob<string>('../../../fixtures/configs/*.yaml', { query: '?raw', import: 'default', eager: true });

describe('server lists become a basic config', () => {
  it('reads plain links, and base64 ones (v2rayN style)', () => {
    for (const text of [LINKS, btoa(LINKS), btoa(LINKS).replace(/(.{60})/g, '$1\n')]) {
      const r = readInput(text);
      expect(r.format).toBe('links');
      expect(r.servers).toBe(3);
      const checked = intake(r.text);
      if (!checked.ok) throw new Error(checked.refusal.code);
      const d = checked.data as Record<string, unknown>;
      expect((d['proxies'] as { name: string }[]).map((s) => s.name)).toEqual(['HK 01', 'JP', 'JP 2']);
      expect(d['proxy-groups']).toEqual([
        { name: 'Proxy', type: 'select', proxies: ['Auto', 'HK 01', 'JP', 'JP 2', 'DIRECT'] },
        { name: 'Auto', type: 'url-test', proxies: ['HK 01', 'JP', 'JP 2'] },
      ]);
      expect(d['rules']).toEqual(['MATCH,Proxy']);
    }
  });

  it('reads names with raw spaces, as some subscriptions write them', () => {
    const r = readInput(btoa('trojan://pw@a.example.com:443#My Server\ntrojan://pw@b.example.com:443#Other One'));
    expect(r.format).toBe('links');
    expect(r.servers).toBe(2);
  });

  it('keeps going past links it cannot read, and says which', () => {
    const r = readInput(`${LINKS}\nssr://whatever\n`);
    expect(r.servers).toBe(3);
    expect(r.skipped).toEqual([{ line: 4, code: 'unsupported-type' }]);
  });

  it('reads SIP008 JSON (Shadowsocks)', () => {
    const json = JSON.stringify({
      version: 1,
      servers: [
        { server: '198.51.100.1', server_port: 8388, password: 'pw', method: 'aes-256-gcm', remarks: 'US, West' },
        { server: '198.51.100.2', server_port: 8388, password: 'pw', method: 'aes-256-gcm', plugin: 'v2ray-plugin' },
        { server: 'bad host', server_port: 1, password: 'pw', method: 'aes-256-gcm' },
      ],
    });
    const r = readInput(json);
    expect(r.format).toBe('sip008');
    expect(r.servers).toBe(1);
    expect(r.skipped).toEqual([{ line: 2, code: 'sip008-plugin' }, { line: 3, code: 'sip008-entry' }]);
    const checked = intake(r.text);
    if (!checked.ok) throw new Error('refused');
    expect((checked.data['proxies'] as { name: string }[])[0]).toMatchObject({ name: 'US West', type: 'ss', cipher: 'aes-256-gcm' });
  });

  it('leaves Clash configs alone, whatever their shape', () => {
    for (const [path, text] of Object.entries(FIXTURES)) {
      expect(readInput(text), path).toEqual({ format: 'clash', text });
    }
    const onlyServers = 'proxies:\n  - {name: A, type: ss, server: 192.0.2.1, port: 1, cipher: aes-128-gcm, password: x}\n';
    expect(readInput(onlyServers).format).toBe('clash');
  });

  it('leaves what it cannot read to the safety checks', () => {
    expect(readInput('nonsense').format).toBe('clash');
    expect(readInput('ssr://a\nssr://b').format).toBe('clash');
  });
});

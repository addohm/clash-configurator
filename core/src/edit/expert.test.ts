import { describe, expect, it } from 'vitest';
import { checkFolder, checkHijack, checkHostPort, checkHours, checkHttpsUrl, checkPorts, checkSecret, DASHBOARDS, intake, KNOWN_DASHBOARD_SOURCES, randomSecret } from '..';

const refused = (f: () => unknown) => expect(f).toThrow('bad value');

describe('expert settings', () => {
  it('controller addresses', () => {
    expect(checkHostPort('127.0.0.1:9090')).toBe('127.0.0.1:9090');
    expect(checkHostPort(':9090')).toBe(':9090');
    expect(checkHostPort('[::1]:9090')).toBe('[::1]:9090');
    for (const v of ['', '127.0.0.1', '127.0.0.1:99999', 'a b:1', 'http://x:1']) refused(() => checkHostPort(v));
  });

  it('download addresses are https', () => {
    expect(checkHttpsUrl('https://github.com/x.zip')).toBe('https://github.com/x.zip');
    for (const v of ['http://x.com/a', 'ftp://x', 'not a url', 'https://']) refused(() => checkHttpsUrl(v));
  });

  it('dashboard folders stay inside the app folder', () => {
    expect(checkFolder('ui')).toBe('ui');
    expect(checkFolder('./dashboards/ui')).toBe('./dashboards/ui');
    for (const v of ['', '../etc', '/etc', 'C:\\x', 'a|b']) refused(() => checkFolder(v));
  });

  it('sniffer ports', () => {
    expect(checkPorts('80, 8080-8880')).toEqual([80, '8080-8880']);
    for (const v of ['', '0', '70000', '9000-8000', 'http']) refused(() => checkPorts(v));
  });

  it('TUN DNS hijack entries', () => {
    expect(checkHijack('any:53')).toBe('any:53');
    expect(checkHijack('TCP://any:53')).toBe('tcp://any:53');
    expect(checkHijack('198.18.0.2:53')).toBe('198.18.0.2:53');
    for (const v of ['any', 'http://any:53', 'any:0']) refused(() => checkHijack(v));
  });

  it('update intervals and passwords', () => {
    expect(checkHours('24')).toBe(24);
    for (const v of ['0', '721', '1.5', '']) refused(() => checkHours(v));
    expect(checkSecret('pa ss')).toBe('pa ss');
    refused(() => checkSecret('x\u0000'));
    expect(randomSecret()).toMatch(/^[0-9a-f]{36}$/);
  });

  it('offers only dashboards the safety checks trust', () => {
    for (const d of DASHBOARDS) {
      expect(KNOWN_DASHBOARD_SOURCES.some((p) => d.url.toLowerCase().startsWith(p)), d.name).toBe(true);
      const r = intake(`external-ui-url: ${d.url}\nproxies: [{name: a, type: ss, server: 192.0.2.1, port: 1, cipher: aes-128-gcm, password: x}]\n`);
      expect(r.ok && r.findings.some((f) => f.id === 'dashboard-download')).toBe(false);
    }
  });
});

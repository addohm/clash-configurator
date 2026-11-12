import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { countryGroups, countryOf, intake, LIST_IDS, parseLink, scratchConfig, toShadowrocket, toStash } from '..';

const server = (name: string, n: number) => parseLink(`trojan://pw${n}@192.0.2.${n}:443#${encodeURIComponent(name)}`);
const SERVERS = [
  server('🇭🇰 Hong Kong 01', 1),
  server('香港 02', 2),
  server('JP-Tokyo', 3),
  server('[JP] Osaka', 4),
  server('US LA', 5),
  server('Mystery box', 6),
];

describe('countries from server names', () => {
  it('reads flags, names in English and Chinese, cities and codes', () => {
    const codes = ['🇭🇰 HK 01', '香港 02', 'Tokyo 3', '[JP] 04', 'US LA', 'UK London', 'Los Angeles', 'Jerusalem', 'Hongkong-IPLC', '台灣 01', 'Plain'].map(
      (n) => countryOf(n)?.code ?? null,
    );
    expect(codes).toEqual(['HK', 'HK', 'JP', 'JP', 'US', 'GB', 'US', null, 'HK', 'TW', null]);
  });

  it('makes a group per country with two or more servers', () => {
    expect(countryGroups(SERVERS)).toEqual([
      { name: '🇭🇰 Hong Kong', servers: ['🇭🇰 Hong Kong 01', '香港 02'] },
      { name: '🇯🇵 Japan', servers: ['JP-Tokyo', '[JP] Osaka'] },
    ]);
  });
});

describe('the config built from scratch', () => {
  const all = { servers: SERVERS, auto: true, countries: true, lists: LIST_IDS, dns: true } as const;
  const data = (text: string) => parseDocument(text).toJS() as Record<string, any>;

  it('passes the safety checks, with nothing flagged', () => {
    for (const app of ['mihomo', 'stash', 'shadowrocket'] as const) {
      const r = intake(scratchConfig({ ...all, app }));
      if (!r.ok) throw new Error(r.refusal.code);
      expect(r.findings.filter((f) => f.severity !== 'info')).toEqual([]);
    }
  });

  it('has groups to pick by hand, by speed and by country, and one per service', () => {
    const d = data(scratchConfig({ ...all, app: 'mihomo' }));
    expect(d['proxy-groups'].map((g: { name: string; type: string }) => `${g.name}:${g.type}`)).toEqual([
      'Proxy:select',
      'Auto:url-test',
      '🇭🇰 Hong Kong:url-test',
      '🇯🇵 Japan:url-test',
      '🤖 AI:select',
      '📺 Streaming:select',
      '✈️ Telegram:select',
    ]);
    expect(d['proxy-groups'][0].proxies).toEqual(['Auto', '🇭🇰 Hong Kong', '🇯🇵 Japan', ...SERVERS.map((s) => s['name']), 'DIRECT']);
    expect(d['proxy-groups'][4].proxies).toEqual(['Proxy', 'Auto', '🇭🇰 Hong Kong', '🇯🇵 Japan', 'DIRECT']);
  });

  it('routes the ticked lists, China last before the catch-all', () => {
    const d = data(scratchConfig({ ...all, app: 'mihomo' }));
    expect(d.rules.slice(6)).toEqual([
      'RULE-SET,category-ads-all,REJECT',
      'RULE-SET,category-ai-not-cn,🤖 AI',
      'RULE-SET,youtube,📺 Streaming',
      'RULE-SET,netflix,📺 Streaming',
      'RULE-SET,disney,📺 Streaming',
      'RULE-SET,spotify,📺 Streaming',
      'RULE-SET,telegram,✈️ Telegram',
      'RULE-SET,ip-telegram,✈️ Telegram,no-resolve',
      'RULE-SET,cn,DIRECT',
      'RULE-SET,ip-cn,DIRECT',
      'MATCH,Proxy',
    ]);
    expect(d['rule-providers']['ip-cn']).toEqual({
      type: 'http',
      behavior: 'ipcidr',
      format: 'mrs',
      url: 'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/cn.mrs',
      interval: 86400,
    });
  });

  it("gives Stash and Shadowrocket blackmatrix7's lists in their formats", () => {
    const stash = data(scratchConfig({ ...all, app: 'stash', lists: ['ads', 'china'] }));
    expect(stash.rules.slice(6)).toEqual([
      'RULE-SET,AdvertisingLite-domains,REJECT',
      'RULE-SET,AdvertisingLite,REJECT,no-resolve',
      'RULE-SET,China-domains,DIRECT',
      'RULE-SET,China,DIRECT',
      'GEOIP,CN,DIRECT',
      'MATCH,Proxy',
    ]);
    expect(stash['rule-providers']['China-domains'].url).toBe(
      'https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/China/China_Domain.yaml',
    );
    const sr = toShadowrocket(data(scratchConfig({ ...all, app: 'shadowrocket', lists: ['ads', 'china'] })));
    const rules = sr.conf.slice(sr.conf.indexOf('[Rule]')).split('\n').slice(7, 13);
    expect(rules).toEqual([
      'DOMAIN-SET,https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/AdvertisingLite/AdvertisingLite_Domain.list,REJECT',
      'RULE-SET,https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/AdvertisingLite/AdvertisingLite.list,REJECT,no-resolve',
      'DOMAIN-SET,https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/China/China_Domain.list,DIRECT',
      'RULE-SET,https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/China/China.list,DIRECT',
      'GEOIP,CN,DIRECT',
      'FINAL,Proxy',
    ]);
    expect(sr.dropped).toEqual([]);
    const st = parseDocument(scratchConfig({ ...all, app: 'stash' }));
    expect(toStash(st, st.toString()).dropped).toEqual([
      { kind: 'setting', key: 'mixed-port' },
      { kind: 'setting', key: 'allow-lan' },
      { kind: 'setting', key: 'dns.enable' },
      { kind: 'setting', key: 'dns.ipv6' },
      { kind: 'setting', key: 'dns.enhanced-mode' },
      { kind: 'setting', key: 'dns.fake-ip-range' },
    ]);
  });

  it('leaves out what was not asked for, and says what each part is for', () => {
    const text = scratchConfig({
      app: 'mihomo',
      servers: SERVERS.slice(0, 1),
      auto: true,
      countries: true,
      lists: [],
      dns: false,
      notes: { header: 'Made from scratch.', proxies: 'Your servers.\nOne per entry.' },
    });
    const d = data(text);
    expect(Object.keys(d)).toEqual(['mixed-port', 'allow-lan', 'mode', 'log-level', 'ipv6', 'proxies', 'proxy-groups', 'rules']);
    expect(d['proxy-groups']).toEqual([{ name: 'Proxy', type: 'select', proxies: ['🇭🇰 Hong Kong 01', 'DIRECT'] }]);
    expect(text.startsWith('# Made from scratch.\n')).toBe(true);
    expect(text).toContain('\n\n# Your servers.\n# One per entry.\nproxies:\n');
    expect(text).toContain('proxies: [ 🇭🇰 Hong Kong 01, DIRECT ]');
  });
});

/**
 * Scratch mode's config, built from nothing (PLAN.md Q23, Q35): the user's
 * servers, groups to pick them by hand, by speed and by country, ticked
 * rule lists, and DNS that works from inside China. Every section carries
 * a short comment saying what it's for, since Scratch is also a way to
 * learn how a Clash config works.
 */
import { Document, isMap, isScalar, isSeq, type Scalar } from 'yaml';
import type { AppId } from '../apps';
import type { Server } from '../links';
import { countryOf } from './countries';
import { LIST_IDS, LIST_TARGET, type ListId, listSources } from './lists';

export interface ScratchOptions {
  app: AppId;
  servers: Server[];
  /** A group that picks the fastest server by itself. */
  auto: boolean;
  /** A fastest-server group per country (two or more servers). */
  countries: boolean;
  lists: readonly ListId[];
  /** DNS that works from inside China. */
  dns: boolean;
  /** One comment per top-level section (`proxies`, `dns`, ...) and `header`, from the page's text. */
  notes?: Partial<Record<string, string>>;
}

/** Group names for the lists that get their own group. */
export const LIST_GROUPS: Partial<Record<ListId, string>> = { ai: '🤖 AI', streaming: '📺 Streaming', telegram: '✈️ Telegram' };

const TEST_URL = 'https://www.gstatic.com/generate_204';

/** addohm.net's fake-IP exceptions (its Meta/Quest block left out: see PLAN.md Q35). */
export const FAKE_IP_EXCEPTIONS = [
  '*.lan', '*.local', '*.lan.lan', '*.local.lan', '*.lan.localdomain', '*.local.localdomain',
  'connectivitycheck.gstatic.com', 'connectivitycheck.android.com', 'captive.apple.com', '*.msftconnecttest.com', '*.msftncsi.com',
  'time.android.com', 'time.facebook.com', 'time1.google.com', 'pool.ntp.org', '+.pool.ntp.org',
  'stun.l.google.com',
];

const CHINA_DNS = ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'];

function uniqueNames(servers: Server[]): Server[] {
  const seen = new Set<string>();
  return servers.map((s) => {
    const base = String(s['name']);
    let name = base;
    for (let i = 2; seen.has(name); i++) name = `${base} ${i}`;
    seen.add(name);
    return { ...s, name };
  });
}

/** The country groups the servers make: name and members, two or more servers each. */
export function countryGroups(servers: readonly Server[]): { name: string; servers: string[] }[] {
  const by = new Map<string, { name: string; servers: string[] }>();
  for (const s of servers) {
    const c = countryOf(String(s['name']));
    if (!c) continue;
    const g = by.get(c.code) ?? { name: `${c.flag} ${c.name}`, servers: [] };
    g.servers.push(String(s['name']));
    by.set(c.code, g);
  }
  return [...by.values()].filter((g) => g.servers.length >= 2);
}

export function scratchConfig(o: ScratchOptions): string {
  const servers = uniqueNames(o.servers);
  const names = servers.map((s) => String(s['name']));
  const countries = o.countries ? countryGroups(servers) : [];
  const ticked = LIST_IDS.filter((id) => o.lists.includes(id));
  const auto = o.auto && names.length > 1;

  const fastest = (name: string, members: string[]) => ({ name, type: 'url-test', proxies: members, url: TEST_URL, interval: 300, tolerance: 50 });
  // Where a pick-by-hand group can send traffic: the whole choice, fastest first.
  const choices = [...(auto ? ['Auto'] : []), ...countries.map((g) => g.name)];
  const groups: Record<string, unknown>[] = [{ name: 'Proxy', type: 'select', proxies: [...choices, ...names, 'DIRECT'] }];
  if (auto) groups.push(fastest('Auto', names));
  for (const g of countries) groups.push(fastest(g.name, g.servers));
  for (const id of ticked) {
    const group = LIST_GROUPS[id];
    if (group) groups.push({ name: group, type: 'select', proxies: ['Proxy', ...choices, 'DIRECT'] });
  }

  const providers: Record<string, unknown> = {};
  const rules: string[] = [
    'DOMAIN-SUFFIX,local,DIRECT',
    'DOMAIN-SUFFIX,lan,DIRECT',
    'IP-CIDR,127.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve',
    'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,172.16.0.0/12,DIRECT,no-resolve',
  ];
  // China last before the catch-all: its IP list may look names up.
  for (const id of [...ticked.filter((id) => id !== 'china'), ...ticked.filter((id) => id === 'china')]) {
    const target = LIST_TARGET[id] === 'reject' ? 'REJECT' : LIST_TARGET[id] === 'direct' ? 'DIRECT' : (LIST_GROUPS[id] ?? 'Proxy');
    for (const src of listSources(o.app, id)) {
      providers[src.name] = { type: 'http', behavior: src.behavior, format: src.format, url: src.url, interval: 86400 };
      const resolve = src.behavior === 'domain' || id === 'china';
      rules.push(`RULE-SET,${src.name},${target}${resolve ? '' : ',no-resolve'}`);
    }
    // Stash and Shadowrocket know China's addresses themselves.
    if (id === 'china' && o.app !== 'mihomo') rules.push('GEOIP,CN,DIRECT');
  }
  rules.push('MATCH,Proxy');

  const config: Record<string, unknown> = { 'mixed-port': 7890, 'allow-lan': false, mode: 'rule', 'log-level': 'info', ipv6: false };
  if (o.dns) {
    config['dns'] = {
      enable: true,
      ipv6: false,
      'enhanced-mode': 'fake-ip',
      'fake-ip-range': '198.18.0.1/16',
      'fake-ip-filter': FAKE_IP_EXCEPTIONS,
      'default-nameserver': ['223.5.5.5', '119.29.29.29'],
      nameserver: CHINA_DNS,
      'proxy-server-nameserver': CHINA_DNS,
    };
  }
  config['proxies'] = servers;
  config['proxy-groups'] = groups;
  if (Object.keys(providers).length > 0) config['rule-providers'] = providers;
  config['rules'] = rules;
  return write(config, o.notes ?? {});
}

/** As YAML: blank lines between sections, each with its comment; group members on one line. */
function write(config: Record<string, unknown>, notes: Partial<Record<string, string>>): string {
  const doc = new Document(config);
  const comment = (text: string) =>
    text
      .split('\n')
      .map((l) => ` ${l}`)
      .join('\n');
  if (notes['header']) doc.commentBefore = comment(notes['header']);
  if (isMap(doc.contents)) {
    doc.contents.items.forEach((pair, i) => {
      const key = pair.key as Scalar;
      if (!isScalar(key)) return;
      const note = notes[String(key.value)];
      if (i > 0 && (note || isMap(pair.value) || isSeq(pair.value))) key.spaceBefore = true;
      if (note) key.commentBefore = comment(note);
    });
    const groups = doc.contents.get('proxy-groups');
    if (isSeq(groups)) {
      for (const g of groups.items) {
        const members = isMap(g) ? g.get('proxies') : null;
        if (isSeq(members)) members.flow = true;
      }
    }
  }
  return doc.toString({ lineWidth: 0 });
}

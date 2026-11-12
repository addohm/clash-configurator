/**
 * Every mihomo output is checked by mihomo itself (PLAN.md Q14): written to
 * a temporary folder and loaded with `mihomo -t`. Skipped when there's no
 * mihomo binary: set MIHOMO_BIN, or put one at tools/bin/mihomo(.exe).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  addGroupChanges,
  addToDnsList,
  setPolicyChanges,
  addRuleChanges,
  addServersChanges,
  build,
  buildDoc,
  groupsOf,
  insertPosition,
  serverNames,
  setGroupTypeChanges,
  setRuleTargetChanges,
  type Change,
  defaultFixes,
  groupsWithAllServers,
  intake,
  linkedCopy,
  parseLinks,
  planLink,
  readInput,
  writeYaml,
  renameChanges,
  type Session,
  startSession,
} from '../core/src';

// One made-up link of each kind the page can add (fake servers and keys).
const UUID = '00000000-0000-4000-8000-0000000000aa';
const LINKS = [
  `vless://${UUID}@192.0.2.50:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.example.com&fp=chrome&pbk=SbVKOEMjK0sIlbwg4akyBg5mL5KZwwB-ed4eEE7YnRc&sid=0123abcd&type=tcp#Added VLESS`,
  `vless://${UUID}@ws.example.com:443?security=tls&type=ws&path=%2Fray&host=cdn.example.com&sni=ws.example.com#Added VLESS WS`,
  'trojan://fake-pw@jp.example.net:443?peer=jp.example.net#Added Trojan',
  `ss://${btoa('aes-256-gcm:fake-pw')}@198.51.100.60:8388#Added SS`,
  'hysteria2://fake-pw@192.0.2.61:443/?sni=hy.example.com&obfs=salamander&obfs-password=ob&mport=20000-30000#Added Hy2',
  `vmess://${btoa(JSON.stringify({ v: '2', ps: 'Added VMess', add: 'vm.example.net', port: '443', id: UUID, aid: '0', net: 'ws', path: '/v', host: 'vm.example.net', tls: 'tls' }))}`,
].join('\n');

const FIXTURES = import.meta.glob<string>('../fixtures/configs/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const PRIVATE = import.meta.glob<string>('../fixtures/private/*.{yaml,yml}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function findMihomo(): string | null {
  const candidates = [
    process.env['MIHOMO_BIN'],
    join(import.meta.dirname, '..', 'tools', 'bin', process.platform === 'win32' ? 'mihomo.exe' : 'mihomo'),
    join(homedir(), '.local', 'opt', 'mihomo', 'mihomo'),
  ];
  return candidates.find((c): c is string => !!c && existsSync(c)) ?? null;
}

const mihomo = findMihomo();
// mihomo downloads its geo data into its home folder on first use: keep one.
const home = join(homedir(), '.cache', 'clash-configurator-mihomo');
const work = mkdtempSync(join(tmpdir(), 'cc-mihomo-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** Runs `mihomo -t` on the text; returns null if it loads, else mihomo's complaint. */
function mihomoTest(name: string, text: string): string | null {
  if (!mihomo) throw new Error('no mihomo');
  mkdirSync(home, { recursive: true });
  const file = join(work, `${name}.yaml`);
  writeFileSync(file, text);
  try {
    execFileSync(mihomo, ['-t', '-d', home, '-f', file], { stdio: 'pipe', timeout: 120_000 });
    return null;
  } catch (e) {
    const out = String((e as { stdout?: Buffer }).stdout ?? '') + String((e as { stderr?: Buffer }).stderr ?? '');
    return out.split('\n').filter((l) => /level=(error|fatal)|test failed/.test(l)).join('\n') || 'failed';
  }
}

function output(s: Session): string {
  const b = build(s);
  if (!b.ok) throw new Error(`build failed: ${JSON.stringify(b)}`);
  return b.output;
}

describe.skipIf(!mihomo)('mihomo loads every output', () => {
  const sessions: [string, Session][] = [];
  for (const [path, text] of Object.entries(FIXTURES)) {
    const name = path.split('/').pop()?.replace('.yaml', '') ?? path;
    const r = intake(text);
    if (!r.ok) continue;
    // As the page would start it: the fixes that start ticked, applied.
    sessions.push([name, startSession(text, { kind: 'paste' }, 'mihomo', 'simple', defaultFixes(r.findings))]);
  }
  for (const [name, s] of [...sessions]) {
    const before = build(s);
    if (!before.ok) continue;
    const data = before.doc.toJS() as Record<string, unknown>;
    // Rename the first server and the first group, with names that need
    // quoting. Renames are worked out against the config as it is now, so
    // they come before the changes that move rules around.
    const edits: Change[] = [];
    const first = (section: string) => ((data[section] as { name: string }[] | undefined) ?? [])[0]?.name;
    const server = first('proxies');
    if (server) edits.push(...renameChanges(data, server, 'Renamed "server" #1: new'));
    const group = first('proxy-groups');
    if (group) edits.push(...renameChanges(data, group, 'Renamed group: 2 [x]'));
    edits.push(
      { op: 'set', path: ['mode'], value: 'global' },
      { op: 'set', path: ['dns', 'enable'], value: true },
      { op: 'insert', path: ['rules'], index: 0, value: 'DOMAIN-SUFFIX,example.net,DIRECT' },
    );
    sessions.push([`${name}-edited`, { ...s, changes: [...s.changes, ...edits] }]);

    // Servers added from share links, joining the groups that list every server.
    const parsed = parseLinks(LINKS);
    if (parsed.errors.length > 0) throw new Error(`links: ${JSON.stringify(parsed.errors)}`);
    const added = addServersChanges(data, parsed.servers, groupsWithAllServers(data)).changes;
    sessions.push([`${name}-added-servers`, { ...s, changes: [...s.changes, ...added] }]);

    // Groups and rules: a new group of two servers, a rule sending a site to
    // it, MATCH pointed at it, and the first group switched to fallback.
    const servers = serverNames(data).slice(0, 2);
    if (servers.length > 0) {
      const step = (prev: Change[], make: (d: Record<string, unknown>) => Change[]): Change[] => {
        const b = buildDoc({ ...s, changes: [...s.changes, ...prev] });
        if (!b.ok) throw new Error('build failed');
        return [...prev, ...make(b.doc.toJS() as Record<string, unknown>)];
      };
      let ge: Change[] = addGroupChanges(data, { name: 'Test Group', type: 'url-test', members: servers });
      ge = step(ge, (d) => addRuleChanges(d, { type: 'DOMAIN-SUFFIX', value: 'example.org', target: 'Test Group' }));
      ge = step(ge, (d) => {
        const last = insertPosition(d);
        const rules = (d['rules'] as unknown[] | undefined) ?? [];
        return last < rules.length ? setRuleTargetChanges(d, last, 'Test Group') : [];
      });
      ge = step(ge, (d) => (groupsOf(d).length > 0 ? setGroupTypeChanges(d, 0, 'fallback') : []));
      sessions.push([`${name}-groups-rules`, { ...s, changes: [...s.changes, ...ge] }]);
    }

    // DNS: on, servers of each kind, an exception and per-site DNS. A
    // server dialled through the first group checks the #Name form.
    let de: Change[] = [{ op: 'set', path: ['dns', 'enable'], value: true }];
    de = [...de, ...addToDnsList(data, 'nameserver', 'tls://1.1.1.1:853')];
    de = [...de, ...addToDnsList(data, 'proxy-server-nameserver', '223.5.5.5')];
    de = [...de, ...addToDnsList(data, 'default-nameserver', '119.29.29.29')];
    de = [...de, ...addToDnsList(data, 'fake-ip-filter', '+.corp.example')];
    const via = groupsOf(data)[0]?.name;
    de = [...de, ...setPolicyChanges(data, '+.example.org,example.net', [via ? `https://dns.google/dns-query#${via}` : 'https://dns.google/dns-query', '8.8.8.8'])];
    sessions.push([`${name}-dns`, { ...s, changes: [...s.changes, ...de] }]);
  }

  // As if each had come from a subscription URL: servers linked (Q28).
  for (const [name, s] of [...sessions]) {
    const b = buildDoc(s);
    const start = intake(s.original);
    if (!b.ok || !start.ok) continue;
    const plan = planLink(start.data, b.doc.toJS() as Record<string, unknown>, 'https://sub.example.com/api?token=fake');
    if (!plan.ok) continue;
    const text = writeYaml(linkedCopy(b.doc, plan), s.original);
    it(`${name} (servers linked)`, () => {
      expect(intake(text).ok).toBe(true);
      expect(mihomoTest(`${name}-linked`, text)).toBeNull();
    });
  }

  // A server list made into a basic config (Q29).
  it('a basic config made from share links', () => {
    const r = readInput(btoa(LINKS));
    expect(r.format).toBe('links');
    expect(mihomoTest('from-links', r.text)).toBeNull();
  });

  for (const [name, s] of sessions) {
    it(name, () => {
      expect(mihomoTest(name, output(s))).toBeNull();
    });
  }
});

describe.skipIf(!mihomo || Object.keys(PRIVATE).length === 0)('mihomo loads real configs after intake', () => {
  for (const [path, text] of Object.entries(PRIVATE)) {
    const name = path.split('/').pop() ?? path;
    it(name, () => {
      const r = intake(text);
      if (!r.ok) throw new Error(`refused: ${r.refusal.code}`);
      const s = startSession(text, { kind: 'paste' }, 'mihomo', 'simple', defaultFixes(r.findings));
      // Only mihomo's error lines are shown, never the config.
      expect(mihomoTest(`private-${name}`, output(s))).toBeNull();
    });
    it(`${name} (servers linked)`, () => {
      const r = intake(text);
      if (!r.ok) throw new Error(`refused: ${r.refusal.code}`);
      const s = startSession(text, { kind: 'paste' }, 'mihomo', 'simple', defaultFixes(r.findings));
      const b = buildDoc(s);
      if (!b.ok) throw new Error('build failed');
      const plan = planLink(r.data, b.doc.toJS() as Record<string, unknown>, 'https://sub.example.com/api?token=fake');
      if (!plan.ok) return; // e.g. a rule names a server: linking isn't offered
      expect(mihomoTest(`private-linked-${name}`, writeYaml(linkedCopy(b.doc, plan), text))).toBeNull();
    });
  }
});

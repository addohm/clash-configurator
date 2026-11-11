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
  addServersChanges,
  build,
  type Change,
  defaultFixes,
  groupsWithAllServers,
  intake,
  parseLinks,
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
  }

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
  }
});

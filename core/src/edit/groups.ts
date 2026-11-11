/**
 * Groups: changing their type and members, adding and removing them, as
 * changes that mihomo will load. It refuses (checked with `mihomo -t`):
 * an empty group, a group inside itself (a loop), and the removed `relay`
 * type. A group that is still used somewhere can't be removed.
 */
import { type Change, ChangeError } from './changes';
import { BUILT_IN_TARGETS, namesInUse, renameChanges } from './references';
import { groupsOf, serverNames } from './servers';

type Config = Record<string, unknown>;

/** The types the page offers. mihomo fills in the health check's URL and interval itself. */
export const GROUP_TYPES = ['select', 'url-test', 'fallback', 'load-balance'] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

const isObject = (v: unknown): v is Config => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function rawGroup(config: Config, index: number): Config {
  const g = list(config['proxy-groups'])[index];
  if (!isObject(g)) throw new ChangeError('no such group');
  return g;
}

/** True if the group gets members some other way too: providers, a filter, or all servers. */
export function hasOtherMembers(group: Config): boolean {
  return list(group['use']).length > 0 || group['include-all'] === true || group['include-all-proxies'] === true;
}

/** True if putting `member` into `group` would make a group contain itself. */
export function wouldLoop(config: Config, group: string, member: string): boolean {
  const byName = new Map(groupsOf(config).map((g) => [g.name, g.members]));
  if (!byName.has(member)) return false; // a server or built-in can't loop
  const seen = new Set<string>();
  const walk = (name: string): boolean => {
    if (name === group) return true;
    if (seen.has(name)) return false;
    seen.add(name);
    return (byName.get(name) ?? []).some(walk);
  };
  return walk(member);
}

/** Everything a group may list: servers, other groups and the built-in targets. */
export function memberChoices(config: Config, group: string): string[] {
  const groups = groupsOf(config).map((g) => g.name).filter((g) => g !== group && !wouldLoop(config, group, g));
  return [...serverNames(config), ...groups, ...[...BUILT_IN_TARGETS].filter((b) => b === 'DIRECT' || b === 'REJECT')];
}

export function setGroupTypeChanges(config: Config, index: number, type: GroupType): Change[] {
  rawGroup(config, index);
  if (!GROUP_TYPES.includes(type)) throw new ChangeError('bad type');
  return [{ op: 'set', path: ['proxy-groups', index, 'type'], value: type }];
}

export function addMemberChanges(config: Config, index: number, member: string): Change[] {
  const g = rawGroup(config, index);
  const name = String(g['name'] ?? '');
  if (list(g['proxies']).includes(member)) throw new ChangeError('already a member');
  if (member === name || wouldLoop(config, name, member)) throw new ChangeError('loop');
  if (!namesInUse(config).has(member)) throw new ChangeError('no such name');
  return [{ op: 'insert', path: ['proxy-groups', index, 'proxies'], value: member }];
}

export function removeMemberChanges(config: Config, index: number, position: number): Change[] {
  const g = rawGroup(config, index);
  const members = list(g['proxies']);
  if (position >= members.length) throw new ChangeError('no such member');
  if (members.length === 1 && !hasOtherMembers(g)) throw new ChangeError('last member');
  return [{ op: 'delete', path: ['proxy-groups', index, 'proxies', position] }];
}

export function moveMemberChanges(config: Config, index: number, from: number, to: number): Change[] {
  const n = list(rawGroup(config, index)['proxies']).length;
  if (from >= n || to >= n || to < 0) throw new ChangeError('index past the end');
  return from === to ? [] : [{ op: 'move', path: ['proxy-groups', index, 'proxies'], from, to }];
}

/** Checks a name for a new group: the same rules as renaming. */
export function checkNewName(config: Config, name: string): void {
  if (name.trim() === '' || name.trim() !== name || name.includes(',')) throw new ChangeError('bad name');
  if (namesInUse(config).has(name)) throw new ChangeError('name in use');
}

export function addGroupChanges(config: Config, group: { name: string; type: GroupType; members: string[] }): Change[] {
  checkNewName(config, group.name);
  if (!GROUP_TYPES.includes(group.type)) throw new ChangeError('bad type');
  if (group.members.length === 0) throw new ChangeError('last member');
  const known = namesInUse(config);
  for (const m of group.members) if (!known.has(m)) throw new ChangeError('no such name');
  return [{ op: 'insert', path: ['proxy-groups'], value: { name: group.name, type: group.type, proxies: [...group.members] } }];
}

/** Where a group is still used, read from the changes a rename would need. */
export type GroupUse = { kind: 'rule'; index: number } | { kind: 'group'; group: string } | { kind: 'other'; path: string };

export function groupUses(config: Config, name: string): GroupUse[] {
  const placeholder = `${name} (old)`.replace(/,/g, ' ');
  let changes: Change[];
  try {
    changes = renameChanges(config, name, namesInUse(config).has(placeholder) ? `${placeholder} ${Date.now()}` : placeholder);
  } catch {
    return [];
  }
  const groups = groupsOf(config);
  const uses: GroupUse[] = [];
  for (const c of changes) {
    const [section, i, field] = c.path;
    if (section === 'proxy-groups' && field === 'name') continue; // its own definition
    if (section === 'rules' && typeof i === 'number') uses.push({ kind: 'rule', index: i });
    else if (section === 'proxy-groups' && typeof i === 'number') {
      const g = groups.find((x) => x.index === i);
      if (g && !uses.some((u) => u.kind === 'group' && u.group === g.name)) uses.push({ kind: 'group', group: g.name });
    } else uses.push({ kind: 'other', path: c.path.join('.') });
  }
  return uses;
}

export function removeGroupChanges(config: Config, name: string): Change[] {
  const g = groupsOf(config).find((x) => x.name === name);
  if (!g) throw new ChangeError('no such group');
  if (groupUses(config, name).length > 0) throw new ChangeError('group in use');
  return [{ op: 'delete', path: ['proxy-groups', g.index] }];
}

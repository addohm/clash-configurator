/**
 * Rules: reading them for the page, and the changes that add, retarget,
 * move and remove them, plus removing rule providers. Rules are checked top
 * to bottom and the first match decides, so new ones go just above the
 * final MATCH, where they take effect.
 */
import { type Change, ChangeError } from './changes';
import { namesInUse, ruleTargetOf, splitRule } from './references';

type Config = Record<string, unknown>;

const isObject = (v: unknown): v is Config => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const CONTROL = /[\u0000-\u001F\u007F]/;

export interface RuleView {
  index: number;
  text: string;
  type: string;
  /** What it matches; empty for MATCH. */
  payload: string;
  target: string;
  /** Anything after the target, like no-resolve. */
  options: string[];
}

export function readRule(text: string, index: number): RuleView {
  const parts = splitRule(text).map((p) => p.trim());
  const type = (parts[0] ?? '').toUpperCase();
  if (type === 'MATCH') return { index, text, type, payload: '', target: parts[1] ?? '', options: parts.slice(2) };
  return { index, text, type, payload: parts[1] ?? '', target: parts[2] ?? '', options: parts.slice(3) };
}

export function rulesOf(config: Config): RuleView[] {
  return list(config['rules']).flatMap((r, i) => (typeof r === 'string' ? [readRule(r, i)] : []));
}

/** The rule types the page can add, with how their value is checked. */
export const ADDABLE_RULES = [
  'DOMAIN-SUFFIX',
  'DOMAIN',
  'DOMAIN-KEYWORD',
  'IP-CIDR',
  'IP-CIDR6',
  'GEOSITE',
  'GEOIP',
  'PROCESS-NAME',
  'DST-PORT',
  'RULE-SET',
] as const;
export type AddableRule = (typeof ADDABLE_RULES)[number];

/** Rule types matched on an IP address, where `no-resolve` makes sense. */
export const IP_RULES: ReadonlySet<string> = new Set(['IP-CIDR', 'IP-CIDR6', 'GEOIP', 'IP-ASN', 'SRC-IP-CIDR']);

const IPV4_CIDR = /^(\d{1,3})(\.\d{1,3}){3}\/(\d|[12]\d|3[0-2])$/;
const IPV6_CIDR = /^[0-9a-f:]+\/(\d|[1-9]\d|1[01]\d|12[0-8])$/i;
const DOMAIN = /^[a-z0-9*+_-]+(\.[a-z0-9*_-]+)*\.?$/i;

/** Checks a value for a rule type; returns it tidied, or throws ChangeError('bad value'). */
export function checkRuleValue(type: AddableRule, raw: string, config: Config): string {
  const v = raw.trim();
  if (v === '' || v.includes(',') || CONTROL.test(v)) throw new ChangeError('bad value');
  switch (type) {
    case 'DOMAIN':
    case 'DOMAIN-SUFFIX':
      if (!DOMAIN.test(v)) throw new ChangeError('bad value');
      return v.toLowerCase();
    case 'DOMAIN-KEYWORD':
    case 'PROCESS-NAME':
      return v;
    case 'IP-CIDR':
      if (!IPV4_CIDR.test(v) || v.split(/[./]/).slice(0, 4).some((o) => Number(o) > 255)) throw new ChangeError('bad value');
      return v;
    case 'IP-CIDR6':
      if (!IPV6_CIDR.test(v)) throw new ChangeError('bad value');
      return v.toLowerCase();
    case 'GEOSITE':
      if (!/^[a-z0-9!@_-]+$/i.test(v)) throw new ChangeError('bad value');
      return v.toLowerCase();
    case 'GEOIP':
      if (!/^[a-z!]{2,10}$/i.test(v)) throw new ChangeError('bad value');
      return v.toUpperCase();
    case 'DST-PORT':
      if (!/^\d{1,5}(-\d{1,5})?(\/\d{1,5}(-\d{1,5})?)*$/.test(v) || v.split(/[-/]/).some((p) => Number(p) < 1 || Number(p) > 65535)) {
        throw new ChangeError('bad value');
      }
      return v;
    case 'RULE-SET': {
      const providers = config['rule-providers'];
      if (!isObject(providers) || !(v in providers)) throw new ChangeError('no such rule list');
      return v;
    }
  }
}

/** Where a new rule goes: just above the final MATCH, or at the end if there is none. */
export function insertPosition(config: Config): number {
  const rules = list(config['rules']);
  const last = rules[rules.length - 1];
  return typeof last === 'string' && readRule(last, 0).type === 'MATCH' ? rules.length - 1 : rules.length;
}

function checkTarget(config: Config, target: string): void {
  if (!namesInUse(config).has(target)) throw new ChangeError('no such target');
}

export function addRuleChanges(config: Config, rule: { type: AddableRule; value: string; target: string; noResolve?: boolean }): Change[] {
  if (!ADDABLE_RULES.includes(rule.type)) throw new ChangeError('bad type');
  const value = checkRuleValue(rule.type, rule.value, config);
  checkTarget(config, rule.target);
  const parts = [rule.type, value, rule.target];
  if (rule.noResolve && IP_RULES.has(rule.type)) parts.push('no-resolve');
  return [{ op: 'insert', path: ['rules'], index: insertPosition(config), value: parts.join(',') }];
}

/** Sends a rule's traffic somewhere else, keeping the rest of the rule as written. */
export function setRuleTargetChanges(config: Config, index: number, target: string): Change[] {
  const text = list(config['rules'])[index];
  if (typeof text !== 'string') throw new ChangeError('no such rule');
  checkTarget(config, target);
  const parts = splitRule(text);
  const at = (parts[0] ?? '').trim().toUpperCase() === 'MATCH' ? 1 : 2;
  if (parts[at] === undefined) throw new ChangeError('no such rule');
  if (ruleTargetOf(text) === target) return [];
  parts[at] = target;
  return [{ op: 'set', path: ['rules', index], value: parts.join(',') }];
}

export function moveRuleChanges(config: Config, from: number, to: number): Change[] {
  const n = list(config['rules']).length;
  if (from < 0 || to < 0 || from >= n || to >= n) throw new ChangeError('index past the end');
  return from === to ? [] : [{ op: 'move', path: ['rules'], from, to }];
}

export function removeRuleChanges(config: Config, index: number): Change[] {
  if (typeof list(config['rules'])[index] !== 'string') throw new ChangeError('no such rule');
  return [{ op: 'delete', path: ['rules', index] }];
}

export interface RuleProviderView {
  name: string;
  behavior: string;
  format: string;
  /** Where it's downloaded from, or the file it reads. */
  source: string;
}

export function ruleProvidersOf(config: Config): RuleProviderView[] {
  const providers = config['rule-providers'];
  if (!isObject(providers)) return [];
  return Object.entries(providers).map(([name, p]) => {
    const o = isObject(p) ? p : {};
    const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
    return { name, behavior: s('behavior'), format: s('format') || 'yaml', source: s('url') || s('path') };
  });
}

/** Rules that use a rule list (RULE-SET,name,...), by position. */
export function ruleSetUses(config: Config, name: string): number[] {
  return rulesOf(config)
    .filter((r) => r.type === 'RULE-SET' && r.payload === name)
    .map((r) => r.index);
}

export function removeRuleProviderChanges(config: Config, name: string): Change[] {
  const providers = config['rule-providers'];
  if (!isObject(providers) || !(name in providers)) throw new ChangeError('no such rule list');
  if (ruleSetUses(config, name).length > 0) throw new ChangeError('rule list in use');
  return [{ op: 'delete', path: ['rule-providers', name] }];
}

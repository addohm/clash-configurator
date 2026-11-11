/**
 * Intake: everything a config goes through before the page uses it
 * (PLAN.md Q4). Refused inputs never reach the page; accepted ones come with
 * the findings to show in the safety report.
 */
import { checkConfig, type Finding } from './checks';
import { parseConfig, type Parsed } from './parse';
import type { Refusal } from './refusal';

export type Intake = (Parsed & { findings: Finding[] }) | { ok: false; refusal: Refusal };

export function intake(input: string | Uint8Array): Intake {
  const parsed = parseConfig(input);
  if (!parsed.ok) return parsed;
  return { ...parsed, findings: checkConfig(parsed.doc, parsed.data) };
}

export { LIMITS } from './limits';
export { REFUSAL_CODES, type Refusal, type RefusalCode } from './refusal';
export { parseConfig, looksLikeShareLinks, type Parsed, type ParseResult } from './parse';
export { checkConfig, FINDING_IDS, isLoopback, isUnsafePath, splitHostPort } from './checks';
export type { Edit, Finding, FindingId, Path, Severity } from './checks';
export { applyEdit, applyFixes, defaultFixes } from './fixes';
export { KNOWN_TOP_LEVEL_KEYS, KNOWN_DASHBOARD_SOURCES } from './known';

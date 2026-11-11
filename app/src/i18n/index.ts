import type { Refusal } from '../../../core/src';
import { en } from './en';

export type { Strings } from './en';

// Only English for now; more locales plug in here later.
export const strings = en;

/** Fills {name} placeholders from `params`; unknown ones are left empty. */
export function format(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}

/** The plain-words reason for a refusal. */
export function refusalText(refusal: Refusal): string {
  return format(strings.refusals[refusal.code], {
    at: refusal.line === undefined ? '' : ` (line ${refusal.line})`,
    limit: '8 MB',
  });
}

import { describe, expect, it } from 'vitest';
import { FINDING_IDS, LIMITS, REFUSAL_CODES, SETTINGS_ERRORS } from '../../../core/src';
import { FETCH_ERRORS } from '../lib/fetch';
import { strings as t, format, refusalText } from '.';

describe('English text', () => {
  it('explains every refusal', () => {
    for (const code of REFUSAL_CODES) expect(t.refusals[code]).toBeTruthy();
  });

  it('explains every fetch error', () => {
    for (const code of FETCH_ERRORS) expect(t.input.fetchErrors[code]).toBeTruthy();
  });

  it('explains every settings-file error', () => {
    for (const code of SETTINGS_ERRORS) expect(t.settingsErrors[code]).toBeTruthy();
  });

  it('explains every finding, with a fix label where there is a fix', () => {
    for (const id of FINDING_IDS) {
      expect(t.findings[id].title).toBeTruthy();
      expect(t.findings[id].explain).toBeTruthy();
    }
  });

  it('fills placeholders', () => {
    expect(format('A {x} and {y}', { x: 1 })).toBe('A 1 and ');
    expect(format('{n} {n|server|servers}', { n: 1 })).toBe('1 server');
    expect(format('{n} {n|server|servers}', { n: 3 })).toBe('3 servers');
    expect(format('{n} {n|entry|entries}', { n: 0 })).toBe('0 entries');
    expect(refusalText({ code: 'duplicate-keys', line: 4 })).toContain('(line 4)');
    expect(refusalText({ code: 'duplicate-keys' })).not.toContain('line');
  });

  it('states the real size limit', () => {
    expect(LIMITS.maxBytes).toBe(8 * 1024 * 1024);
    expect(refusalText({ code: 'too-big' })).toContain('8 MB');
  });
});

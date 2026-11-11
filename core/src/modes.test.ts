import { expect, it } from 'vitest';
import { DEFAULT_MODE, MODES } from './modes';

it('starts in Simple mode, one of the three', () => {
  expect(MODES).toEqual(['simple', 'advanced', 'scratch']);
  expect(DEFAULT_MODE).toBe('simple');
});

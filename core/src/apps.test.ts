import { describe, expect, it } from 'vitest';
import { TARGET_APPS, targetApp } from './apps';

describe('target apps', () => {
  it('has each app once', () => {
    const ids = TARGET_APPS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['mihomo', 'stash', 'shadowrocket']);
  });

  it('gives every app a config file first', () => {
    for (const app of TARGET_APPS) {
      expect(app.files[0]?.kind).toBe('config');
    }
  });

  it('gives Shadowrocket a .conf and a nodes file', () => {
    expect(targetApp('shadowrocket').files).toEqual([
      { kind: 'config', ext: 'conf' },
      { kind: 'nodes', ext: 'txt' },
    ]);
  });

  it('refuses an unknown app', () => {
    // @ts-expect-error: not an AppId
    expect(() => targetApp('clash-premium')).toThrow('unknown app');
  });
});

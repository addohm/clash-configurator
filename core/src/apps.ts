/**
 * The apps a config can be made for (PLAN.md Q6, Q7), described once.
 *
 * The user picks one first; the page greys out settings it can't use and
 * gives back that app's own files. Names shown to the user live in the
 * page's text (app/src/i18n), not here.
 */

export type AppId = 'mihomo' | 'stash' | 'shadowrocket';

export interface OutputFile {
  /** What the file is for, e.g. 'config' or 'nodes'. */
  kind: 'config' | 'nodes';
  /** The file name's extension, without the dot. */
  ext: 'yaml' | 'conf' | 'txt';
}

export interface TargetApp {
  id: AppId;
  /** The files this app gets back, in the order they're offered. */
  files: readonly OutputFile[];
}

export const TARGET_APPS: readonly TargetApp[] = [
  // Clash Verge Rev, FlClash, Clash Meta for Android, Clash Party
  { id: 'mihomo', files: [{ kind: 'config', ext: 'yaml' }] },
  { id: 'stash', files: [{ kind: 'config', ext: 'yaml' }] },
  // A .conf for settings, groups and rules, plus a nodes file of share links
  {
    id: 'shadowrocket',
    files: [
      { kind: 'config', ext: 'conf' },
      { kind: 'nodes', ext: 'txt' },
    ],
  },
];

export function targetApp(id: AppId): TargetApp {
  const app = TARGET_APPS.find((a) => a.id === id);
  if (!app) throw new Error(`unknown app: ${id}`);
  return app;
}

// Every piece of text the page shows, in English. Another language is a copy
// of this file with the same keys (PLAN.md Q13).
export const en = {
  title: 'Clash Configurator',
  tagline: 'Bring your Clash config, change what you need, take it back to your app.',
  local: 'Everything stays on this device.',
  firstBuild: 'This is the first build: there is nothing to edit yet.',
  modes: {
    label: 'Mode',
    simple: 'Simple',
    simpleHint: 'Step by step, one part of the config at a time.',
    advanced: 'Advanced',
    advancedHint: 'Every setting on one page.',
    scratch: 'Scratch',
    scratchHint: 'Build a new config from nothing, and learn how one works.',
  },
  apps: {
    mihomo: 'Clash Verge Rev, FlClash, Clash Meta for Android, Clash Party (mihomo)',
    stash: 'Stash',
    shadowrocket: 'Shadowrocket',
  },
} as const;

export type Strings = typeof en;

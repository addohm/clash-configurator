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

  // Why a config was refused. {at} becomes " (line 4)" when the line is known.
  refusals: {
    empty: "There's nothing here. Paste a config, or choose a file.",
    'too-big': "This is too big to be a Clash config (over {limit}), so it wasn't read.",
    binary: "This isn't text, so it can't be a Clash config.",
    html: 'This is a web page, not a config. If it came from a link, the link may need you to sign in, or it may have expired.',
    'share-links': "This is a list of server links, not a full Clash config. Scratch mode can build a config from them.",
    'not-yaml': "This isn't a valid config: its layout is broken{at}.",
    'multiple-documents': 'This holds more than one config. Use one at a time.',
    tags: "This contains special YAML instructions{at} that Clash configs never use. They're a common way to attack apps, so it was refused.",
    'alias-bomb': "This is built to grow to a huge size and freeze any app that reads it, so it was refused.",
    'too-deep': 'This is nested far too deeply to be a real config{at}, so it was refused.',
    'too-many-nodes': 'This has far more entries than any real config, so it was refused.',
    'duplicate-keys': 'The same setting appears twice{at}. Apps disagree on which one counts, so fix the file first.',
    'bad-key': 'This contains a setting name used to attack programs{at}, so it was refused.',
    'not-a-map': "This isn't laid out like a Clash config.",
    'not-clash': "This doesn't look like a Clash config: it has no servers.",
  },

  // Why a saved settings file couldn't be loaded. {detail} names the part.
  settingsErrors: {
    'too-big': 'This file is too big to be a saved settings file.',
    'not-json': "This isn't a saved settings file: it can't be read.",
    'not-settings': "This isn't a Clash Configurator settings file.",
    'newer-version': 'This was saved by a newer version of Clash Configurator. Update the app, then load it again.',
    'bad-field': 'This settings file is damaged ({detail}).',
    'bad-change': 'This settings file is damaged: change {detail} is invalid.',
    'bad-original': "The config inside this settings file didn't pass the safety checks.",
  },

  // What the safety report says about a risky setting, and what its fix does.
  findings: {
    'controller-open-no-secret': {
      title: 'Anyone on your network can control Clash',
      explain:
        "Clash's remote control listens on your whole network ({value}) and has no password. On hotel or café Wi-Fi, a stranger could change your settings or see what you visit.",
      fix: 'Only allow this device',
    },
    'controller-open': {
      title: 'Clash can be controlled from your network',
      explain: "Clash's remote control listens on your whole network ({value}). It has a password, but there's rarely a reason to open it up.",
      fix: 'Only allow this device',
    },
    'controller-no-secret': {
      title: "Clash's remote control has no password",
      explain: 'Only this device can reach it, but a website open in your browser could still send it commands.',
      fix: 'Add a random password',
    },
    'allow-lan': {
      title: 'Other devices can use your proxy',
      explain: 'Sharing with the local network lets anyone on the same Wi-Fi send their traffic through your proxy.',
      fix: 'Turn sharing off',
    },
    'listener-open': {
      title: 'An extra entrance is open to your network: {name}',
      explain: 'This listener ({listen}) accepts connections from other devices, not just this one.',
      fix: 'Only allow this device',
    },
    'dns-listen-open': {
      title: 'Clash answers name lookups for your whole network',
      explain: 'Its DNS server ({value}) can be used by other devices, not just this one.',
      fix: 'Only allow this device',
    },
    'dashboard-download': {
      title: 'The dashboard is downloaded from {host}',
      explain: 'Your app would download a web page from there and run it as its control panel. Only keep this if you trust that site.',
      fix: "Don't download it",
    },
    'insecure-download': {
      title: "A download isn't encrypted: {host}",
      explain: 'This is fetched over plain http, so anyone along the way could swap it for something else.',
      fix: 'Use https instead (the site must support it)',
    },
    'unsafe-path': {
      title: "A file path leaves the app's folder: {value}",
      explain: "A config should only save files in your app's own folder. This one points somewhere else, which could overwrite other files.",
      fix: 'Remove the path',
    },
    scripts: {
      title: 'The config runs scripts',
      explain: 'Scripts are code that runs inside your app. Only keep them if you wrote them or fully trust whoever did.',
      fix: 'Remove the scripts',
    },
    mitm: {
      title: 'The config can read your secure connections',
      explain: 'These settings decrypt your https traffic for the sites listed, passwords included.',
      fix: 'Remove them',
    },
    rewrite: {
      title: 'The config changes web pages or requests',
      explain: 'Rewrite rules change what websites send you, or what you send them.',
      fix: 'Remove them',
    },
    tunnels: {
      title: 'Port forwards are set up ({count})',
      explain: 'Tunnels forward ports on this device to other places through the proxy.',
      fix: '',
    },
    hosts: {
      title: 'Some sites go to fixed addresses ({count})',
      explain: "The hosts section skips the normal lookup for these sites. Check that none of them is a site you log in to.",
      fix: '',
    },
    'hidden-characters': {
      title: 'Some names contain hidden characters ({count})',
      explain: 'Invisible characters can make a server or rule look like something it isn\'t.',
      fix: '',
    },
    'unknown-keys': {
      title: "Settings this page doesn't know: {keys}",
      explain: "They're kept exactly as they are.",
      fix: '',
    },
  },
} as const;

export type Strings = typeof en;

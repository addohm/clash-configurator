// Every piece of text the page shows, in English. Another language is a copy
// of this file with the same keys (PLAN.md Q13).
export const en = {
  title: 'Clash Configurator',
  tagline: 'Bring your Clash config, change what you need, take it back to your app.',
  local: 'Everything stays on this device.',
  notBuiltYet: 'This part comes in a later build.',
  info: 'What is this?',
  settingName: 'Setting:',

  // The numbered steps of Simple mode (PLAN.md Q11).
  steps: {
    progress: 'Step {n} of {total}',
    change: 'Change',
    app: 'Pick your app',
    input: 'Bring your config',
    report: 'Safety report',
    edit: 'Make your changes',
    review: 'Review and save',
  },

  pickApp: {
    intro: "Which app will use the config? You'll get a file made for it, and settings it can't use are greyed out.",
    picked: 'Making a config for {app}.',
  },

  input: {
    intro: 'Paste your Clash config below, or open the file. It stays on this device.',
    pasteLabel: 'Your config',
    placeholder: 'Paste your Clash config here (it starts with lines like "mixed-port: 7890" or "proxies:")',
    pasteInfo:
      'Your Clash app can show or export the config it uses. In Clash Verge Rev: Profiles, right-click your profile, then Edit File, and copy everything.',
    openFile: 'Open a file',
    openSettings: 'Open saved settings',
    openSettingsInfo: 'A settings file you saved here before. It holds your config and your changes, so you can carry on where you left off.',
    check: 'Check it',
    dropHint: 'You can also drop a file here.',
    tooBig: 'That file is too big to be a Clash config (over 8 MB), so it was not opened.',
    loaded: 'Checked {name}.',
    pasted: 'the pasted config',
    restored: 'Restored your saved settings.',
  },

  edit: {
    ready: 'Your config is ready to edit: {servers} servers, {groups} groups and {rules} rules.',
    sections: {
      basics: 'Basics',
      servers: 'Servers',
      groups: 'Groups',
      rules: 'Rules',
      dns: 'DNS',
    },
    sectionOf: 'Part {n} of {total}',
    next: 'Next',
    done: 'Done: review it',
    back: 'Back',
    undo: 'Undo last change',
    changes: '{count} changes so far.',
    noChanges: 'No changes yet.',
    failed: "That change couldn't be made: {reason}",
    save: 'Save',
    cancel: 'Cancel',
    notSet: 'Not set: your app uses its default ({value}).',
    notSetPlain: 'Not set: your app uses its default.',
  },

  basics: {
    intro: 'How your app handles traffic overall.',
    mode: 'Mode',
    modeInfo:
      'Rules: each site goes where your rules say (the usual choice). Everything through the proxy: every site uses the proxy. Direct: nothing uses the proxy.',
    modes: { rule: 'Rules', global: 'Everything through the proxy', direct: 'Direct (proxy off)' },
    ports: 'Ports',
    portsInfo:
      'The local "door" other programs on this device use to reach the proxy. Only change it if another program already uses this number. Your app may set its own.',
    portNames: {
      'mixed-port': 'Mixed port (web and other apps)',
      port: 'Web port (HTTP)',
      'socks-port': 'SOCKS port',
      'redir-port': 'Redirect port',
      'tproxy-port': 'Transparent proxy port',
    },
    badPort: 'A port is a whole number from 1 to 65535.',
    allowLan: 'Share with other devices on your network',
    allowLanInfo:
      'Lets other devices on the same Wi-Fi send their traffic through this proxy. Leave it off on public or hotel Wi-Fi.',
    ipv6: 'Use IPv6',
    ipv6Info:
      'IPv6 is the newer kind of internet address. Turn it off if sites fail to load or your real location leaks; turn it on if your network needs it.',
  },

  servers: {
    intro: 'The servers your traffic can go through. Renaming one updates every group and rule that uses it.',
    count: '{count} servers',
    name: 'Name',
    type: 'Type',
    address: 'Address',
    rename: 'Rename',
    remove: 'Remove',
    renameErrors: {
      'name in use': 'Another server or group already has that name.',
      'bad name': "Names can't be empty, start or end with a space, or contain a comma.",
      'built-in name': "That's a built-in name.",
      'no such name': 'That server no longer exists.',
    },
    blocked: "Can't remove it yet:",
    blockers: {
      rule: 'rule {n} sends traffic to it',
      dialer: '{server} connects through it',
      'last-member': 'it is the only member of the group {group}',
    },
    add: 'Add servers',
    addInfo:
      'Paste share links, one per line (vless://, trojan://, ss://, hysteria2://, vmess://), or a whole subscription block. They are read here; nothing is fetched.',
    addPlaceholder: 'vless://...\ntrojan://...',
    addTo: 'Add them to these groups:',
    addToInfo: "A server that's in no group can't be picked in your app. Groups that already list every server are ticked.",
    addButton: 'Add {count} servers',
    addRead: 'Read the links',
    linkErrors: {
      'not-a-link': "isn't a share link",
      'unsupported-type': 'is a kind of link this page cannot add yet',
      'bad-address': 'has an address that cannot be read',
      'bad-port': 'has a port that cannot be read',
      'bad-id': 'has an ID (UUID) that cannot be read',
      'missing-password': 'has no password',
      'unsupported-option': 'uses an option this page cannot convert ({detail}), so it was left out',
    },
    lineError: 'Line {line} {reason}.',
    added: 'Added {count} servers.',
  },

  report: {
    refusedTitle: "This can't be used",
    tryAgain: 'Try another config',
    clean: 'Nothing risky found.',
    summary: '{problems} to look at, {notes} to know about.',
    severities: { danger: 'Danger', warning: 'Warning', info: 'Note' },
    keepAsIs: 'Ticked fixes are made in your new config. Untick any you want to keep as they are.',
    continue: 'Continue',
  },

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
    mihomo: 'mihomo apps',
    mihomoHint: 'Clash Verge Rev, FlClash, Clash Meta for Android, Clash Party',
    stash: 'Stash',
    stashHint: 'iPhone and iPad, and Mac',
    shadowrocket: 'Shadowrocket',
    shadowrocketHint: 'iPhone and iPad. Gets a settings file and a server list.',
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

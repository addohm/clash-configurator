# Changelog

All notable changes to clash-configurator. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- `tools\update` offers to install each new build (quietly, for your user,
  with a Start menu entry) and start it. A new menu option, **Start the
  app**, opens the installed app or else the last build. It offers to close
  an open app window before building or installing over it (2026-11-11).

### Fixed

- `tools\update`: when an update changes the build script itself, it starts
  the new version, which carries on from step 2. Before, the rest of that
  run used the old script (2026-11-11).
- Tests pass on a Windows checkout, where Git turns line endings into CRLF.
  The output tests now run every fixture with both LF and CRLF
  (2026-11-11).
- `tools\update`: when GitHub refuses SSH sign-in, it says how to switch to
  HTTPS. It no longer prints a stray `RemoteException` line in git errors
  (2026-11-11).

### Added

- Standard docs: README, CLAUDE, CHANGELOG, DEPLOY, SECURITY and ROADMAP (2026-11-10).
- Docs filled in with what's known so far, with TODO questions for the rest (2026-11-10).
- PLAN.md: design decisions Q1–Q27 and the build order (2026-11-11).
- The skeleton (2026-11-11):
  - the config core (TypeScript) with its first tests
  - the page (Svelte 5), with its text in one English file
  - the Windows app shell (Tauri 2): no plugins, a strict Content Security
    Policy, frozen prototypes
  - `tools\update`, a menu-driven script that updates, checks, builds and
    runs the app on Windows
  - a placeholder icon
  - the MIT license
- Safe intake, step 2 (2026-11-11), in `core/src/intake/`:
  - It refuses hostile input before using it: too big, not text, web pages,
    share-link lists, broken YAML, more than one document, YAML tags,
    alias bombs, deep nesting, too many entries, duplicate keys, keys that
    attack JavaScript objects, and configs with no servers.
  - It flags risky settings, most serious first, each with a fix: an open or
    passwordless controller, LAN sharing, open listeners and DNS, outside
    dashboards, plain-http downloads, file paths outside the app's folder,
    scripts, MITM, rewrites, tunnels, hosts, hidden characters, and settings
    it doesn't know.
  - Fixes edit the original document, so comments and order stay.
  - Plain-English text for every refusal and finding, in `app/src/i18n/en.ts`.
  - Made-up and booby-trapped test configs in `fixtures/`, plus a test that
    runs any real configs in `fixtures/private/`.
- Editing and mihomo output, step 3 (2026-11-11), in `core/src/edit/`:
  - Changes (set, delete, insert, move) are kept as a list on top of the
    original. Values are written by the YAML library, so a typed value can't
    add settings.
  - Output keeps the original's comments, order, quoting and list layout. An
    unchanged config comes back byte for byte.
  - Renaming a server or group updates every place that names it: groups,
    rules, sub-rules, dialer-proxy, listeners, tunnels, providers and DNS.
    Names with commas, built-in names and names already in use are refused.
  - The saved settings file (JSON): the original plus the changes, app, mode
    and source. Loading checks every field and runs the original through
    intake again.
  - Every edited result goes through intake, so the user's own changes get
    the same checks.
  - `tests/mihomo.test.ts` loads every output with `mihomo -t`.
    `tools\update` downloads a pinned, hash-checked mihomo into `tools\bin\`
    for it.
- Simple mode, first part, step 4a (2026-11-11):
  - The numbered steps with a progress bar; finished steps can be reopened.
  - Pick your app.
  - Bring your config: paste it, open a file, drop a file, or open a saved
    settings file. Files over 8 MB are refused before they're read.
  - The safety report: refusals in plain words; risky settings, most serious
    first, with their fixes ticked or not, and the setting each is about.
  - The ⓘ tooltip: hover, tap or keyboard; tap elsewhere or Escape closes it.
  - Page tests in a simulated browser (happy-dom), including one with
    JavaScript's object prototype frozen, as the app runs it.
  - Dropping a file on the page works in the Windows app: Tauri's own
    drag-and-drop handling is off, so the page gets the file.
  - Editing, review and saving come in 4b and 4c.
- Simple mode, step 4b-1 (2026-11-11): the edit step.
  - The config's parts as cards (Basics, Servers, Groups, Rules, DNS), one
    at a time with Next and Back; Undo takes back the last edit. Groups,
    Rules and DNS come in 4b-2 and 4b-3.
  - Basics: mode, ports, sharing with the network, IPv6, as the config has
    them, with ⓘ tooltips.
  - Servers: the list; rename (every group, rule and DNS reference follows);
    remove (taken out of every group, or refused with the reason: a rule
    sends traffic to it, another server connects through it, or it's a
    group's only member); add from share links, into the groups that list
    every server (changeable).
  - Share links (`core/src/links/`): vless (incl. Reality, ws, grpc, h2,
    xhttp), trojan, ss (SIP002 and old), hysteria2 (incl. port hopping and
    salamander), vmess. Options that can't be converted faithfully are
    refused, not guessed. All 43 links of a real subscription parse.
  - Edits change the open config in place: a few milliseconds each on a
    config with 5,830 rules, instead of a full rebuild.
  - New top-level settings go above the servers, groups and rules.
  - mihomo loads every test config with servers added from each kind of
    link.

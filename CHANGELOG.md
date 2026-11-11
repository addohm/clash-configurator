# Changelog

All notable changes to clash-configurator. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

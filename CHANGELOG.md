# Changelog

All notable changes to clash-configurator. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

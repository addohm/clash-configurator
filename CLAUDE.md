# CLAUDE.md

Orientation for Claude working on clash-configurator. Read this first.

## What this is

A one-page Clash config editor, planned as a Windows Tauri app first (Linux
and a website later): config in, safety check, guided edits, config out.
Every design decision is in PLAN.md (Q1, Q2, ...); ROADMAP.md tracks the
build order. The owner said go on 2026-11-11; build one step at a time.

## Layout

- README.md, CHANGELOG.md, DEPLOY.md, SECURITY.md, ROADMAP.md: the standard docs
- CLAUDE.md: this file
- PLAN.md: the design decisions log (Q1, Q2, ...); read it before building
- core/src/: the config core in plain TypeScript, no UI; tests sit beside the
  code as `*.test.ts`
  - core/src/intake/: what every input goes through. `parse.ts` refuses
    hostile input (limits in `limits.ts`), `checks.ts` flags risky settings
    with fixes, `fixes.ts` applies them, `known.ts` lists known settings and
    dashboard sources
  - core/src/edit/: `changes.ts` (the change list and its checks),
    `output.ts` (YAML out, keeping the original's layout), `references.ts`
    (renames that update every reference), `session.ts` (original + changes
    -> built config), `settings.ts` (the saved settings file)
- tests/: tests that need Node, with their own `tsconfig.json` (Node types).
  `mihomo.test.ts` runs `mihomo -t` on every output
- app/: the page (Svelte 5). `app/src/i18n/en.ts` holds every piece of text
  the page shows; nothing user-facing is written inline
- src-tauri/: the Windows app shell (Tauri 2, Rust): `tauri.conf.json` (CSP,
  window, installer), `capabilities/` (what the page may ask for), `icons/`
- tools/update.cmd + update.ps1: the owner's build script (menu: update,
  build, checks, dev mode)
- tools/art/: the placeholder icon and the script that draws it
- fixtures/: `configs/` (made-up, accepted), `hostile/` (must be refused);
  `fixtures/private/` is git-ignored, for real ones
- vite.config.ts (page builds to dist/), vitest.config.ts (core tests),
  tsconfig.json (strict)

## Workflow

1. Start from the latest: pull before changing anything.
2. Make the change with tests.
3. **Update the docs in the same commit.** Every change updates the docs it
   affects:
   - README.md: setup and usage
   - CHANGELOG.md: an entry under *Unreleased*
   - DEPLOY.md: when deploying or running it live changes
   - SECURITY.md: when secrets, access or permissions change
   - ROADMAP.md: when something on it is done, or new plans are made
   - this file: when the layout, workflow or conventions change
4. Run the checks, then commit: `npm run check` (svelte-check, warnings
   fail, then `tsc -p tests`) and `npm test` (vitest, including mihomo). `tools\update` runs
   the same ones on the owner's PC.

## Conventions

- Remote: `origin` is `addohm/clash-configurator` on GitHub, reached through
  the `deploy-ws-clash-configurator` SSH host alias.
- Branch: `main`.

- Stack (PLAN.md Q14): TypeScript config core (separate from the UI),
  Svelte 5 + Vite page, Tauri 2 app, Rust fetcher.
- The owner builds and tests on Windows by pulling and running the build
  script; this sandbox can't build the Windows app (Q24).
- Real provider configs hold credentials: git-ignored folder only (Q26).

- This sandbox has no Node and no sudo: Node 26 is in `~/.local/opt/node`.
  Run `. ~/.local/opt/env.sh` first in every shell call. It can't build the
  Tauri app (no webkit2gtk), so Rust and Tauri changes are unbuilt until the
  owner runs `tools\update`: review them closely by eye, and say so.
- Check a Tauri config edit against
  `node_modules/@tauri-apps/cli/config.schema.json` (python3 jsonschema).
- The build script must run on Windows PowerShell 5.1: ASCII only, no `??` or
  ternaries. Parse-check it with `~/.local/opt/pwsh-7.7.0/pwsh`
  (`DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1`). It asks rather than taking
  options, in revtunnel's style (say/ok/warn/bad/step/banner/ask).
- Packages: exact versions (`.npmrc` save-exact), no install scripts
  (ignore-scripts). TypeScript stays on 6.x until svelte-check supports 7.
- Heavy jobs (installs, builds) run under `nice -n 19`: the CPU is shared.
- Svelte 5 runes (`$state`, `onclick=`), strict TypeScript. Comments say why,
  briefly.
- The core must run in a browser: no Node APIs, and no `@types/node`. Tests
  read fixtures with `import.meta.glob(..., { query: '?raw' })`.
- mihomo for the tests is at `~/.local/opt/mihomo/mihomo` here (v1.19.33,
  hash checked); its geo data is cached in `~/.cache/clash-configurator-mihomo`.
  On the owner's PC, `tools\update` puts it in `tools\bin\` (pinned version
  and hash at the top of `update.ps1`).
- Changes that name list positions (rules[3]) are worked out against the
  config as it is at that moment; add them in the order they were made.
- Every refusal code and finding id has English text in `app/src/i18n/en.ts`;
  `en.test.ts` fails if one is missing. Add both together.
- Treat inputs as hostile: walk the YAML document (aliases count once), not
  the plain-object view, when scanning a whole config.

## Don't

- Commit secrets (`.env`, keys, tokens).

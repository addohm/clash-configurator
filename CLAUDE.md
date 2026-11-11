# CLAUDE.md

Orientation for Claude working on clash-configurator. Read this first.

## What this is

A one-page Clash config editor, planned as a Windows Tauri app first (Linux
and a website later): config in, safety check, guided edits, config out. No
code yet; every design decision is in PLAN.md, with a build order. Don't
build until the owner says go.

## Layout

- README.md, CHANGELOG.md, DEPLOY.md, SECURITY.md, ROADMAP.md: the standard docs
- CLAUDE.md: this file
- PLAN.md: the design decisions log (Q1, Q2, ...); read it before building

No source folders yet.

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
4. Run the checks (none yet; TODO: the lint and test commands once there's
   code), then commit.

## Conventions

- Remote: `origin` is `addohm/clash-configurator` on GitHub, reached through
  the `deploy-ws-clash-configurator` SSH host alias.
- Branch: `main`.

- Stack (PLAN.md Q14): TypeScript config core (separate from the UI),
  Svelte 5 + Vite page, Tauri 2 app, Rust fetcher.
- The owner builds and tests on Windows by pulling and running the build
  script; this sandbox can't build the Windows app (Q24).
- Real provider configs hold credentials: git-ignored folder only (Q26).

TODO: coding style and naming, once there's code.

## Don't

- Commit secrets (`.env`, keys, tokens).

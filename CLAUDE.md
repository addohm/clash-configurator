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
    `output.ts` (YAML out: splices unchanged entries from the original
    text, rewrites only what changed), `compare.ts` (the review's line
    comparison, a patience diff), `references.ts`
    (renames that update every reference), `session.ts` (original + changes
    -> built config), `settings.ts` (the saved settings file)
  - core/src/edit/link.ts: linking servers to the subscription (a proxy
    provider): the plan, what's lost, what blocks it (PLAN.md Q28)
  - core/src/subscription/: server lists (share links, SIP008) made into a
    basic config (Q29)
  - core/src/links/: share links (vless, trojan, ss, hysteria2, vmess) to
    mihomo server entries; refuses what it can't convert faithfully
  - core/src/edit/servers.ts: adding servers (into chosen groups) and
    removing them (refused when a rule, a dialer-proxy or an emptied group
    would break)
  - core/src/edit/groups.ts, rules.ts: group type/members/add/remove (no
    empty groups, loops or `relay`) and rule read/add/retarget/move/remove,
    rule providers
  - core/src/edit/dns.ts: checks for DNS servers and site patterns, and the
    DNS list and per-site changes
- fetcher/: the Rust library that fetches subscription URLs (checks in
  `src/lib.rs`), its own crate so it builds and tests here without Tauri:
  `cd fetcher && CARGO_TARGET_DIR=$PWD/target nice -n 19 cargo test`
  (`-- --ignored` adds a live HTTPS fetch). src-tauri uses it by path
- tests/: tests that need Node, with their own `tsconfig.json` (Node types).
  `mihomo.test.ts` runs `mihomo -t` on every output
- app/: the page (Svelte 5). `app/src/i18n/en.ts` holds every piece of text
  the page shows; nothing user-facing is written inline
  - app/src/lib/: `store.svelte.ts` (the page's state: steps, intake result,
    session), `Info.svelte` (the ⓘ tooltip), `Step.svelte` (a numbered step)
  - app/src/steps/: one component per Simple-mode step (`Review.svelte`
    is step 5); `lib/save.ts` saves through the app's `save_file` command,
    or downloads in a browser; `lib/fetch.ts` asks the app's
    `fetch_subscription` (only in the app); `lib/memory.ts` is what's
    remembered between runs (localStorage, keys `clash-configurator:*`)
  - app/src/edit/: the edit step (`EditStep.svelte`) and one card per part
    (`Basics.svelte`, `Servers.svelte`, `Groups.svelte`, `Rules.svelte`,
    `Dns.svelte`); `lib/StringList.svelte` is the editable list they share
  - `App.test.ts`: page tests in happy-dom; `frozen.test.ts` runs the main
    path with Object.prototype frozen, as the app does
- src-tauri/: the Windows app shell (Tauri 2, Rust): `tauri.conf.json` (CSP,
  window, installer), `capabilities/` (what the page may ask for), `icons/`,
  `src/main.rs` (the `save_file` command: Save dialog, then write; and
  `fetch_subscription`, which calls ../fetcher)
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
- The window has `dragDropEnabled: false`: on Windows, Tauri otherwise takes
  dropped files itself and the page never sees them.
- Check a Tauri config edit against
  `node_modules/@tauri-apps/cli/config.schema.json` (python3 jsonschema).
- The build script must run on Windows PowerShell 5.1: ASCII only, no `??` or
  ternaries. Parse-check it with `~/.local/opt/pwsh-7.7.0/pwsh`
  (`DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1`). It asks rather than taking
  options, in revtunnel's style (say/ok/warn/bad/step/banner/ask).
- Packages: exact versions (`.npmrc` save-exact), no install scripts
  (ignore-scripts). TypeScript stays on 6.x until svelte-check supports 7.
- Rust TLS: rustls with the ring backend (`rustls-no-provider` + ring), never
  reqwest's default aws-lc, which can need CMake and NASM on Windows. After
  a Cargo change, check `cargo tree -i reqwest -e features --target
  x86_64-pc-windows-msvc` for aws-lc.
- Heavy jobs (installs, builds) run under `nice -n 19`: the CPU is shared.
- Svelte 5 runes (`$state`, `onclick=`), strict TypeScript. Comments say why,
  briefly.
- No inline styles anywhere in the page (`style="..."`): the app's CSP
  blocks them. Use classes; for values, set them from code (`style:` is fine).
- Keep intake results, sessions and anything holding a YAML document in
  `$state.raw`, replaced whole: deep proxies of big configs are slow.
- Big lists in the page: page them, and don't render a dropdown per row
  (5,830 rules x every group was ~2,700 elements); open one at a time.
- Output must keep unchanged parts byte for byte: real configs mix
  indentation and spacing, and the review's comparison is only useful if it
  shows real changes. Test new edits with "only these lines change".
- `store.startMemory()` runs once from main.ts: it reads what was remembered
  and keeps remembering (effects). Page tests don't call it, so they start
  clean; `memory.test.ts` does, and clears localStorage first.
- Edits go through `store.edit(changes)`: it applies them to the open
  document in place (fast), adds them to the session, and bumps
  `store.version`; `store.data` is the plain view to read. Work out changes
  from `store.data` at the moment of the edit. Undo rebuilds from the
  original.
- The core must run in a browser: no Node APIs, and no `@types/node`. Tests
  read fixtures with `import.meta.glob(..., { query: '?raw' })`.
- mihomo for the tests is at `~/.local/opt/mihomo/mihomo` here (v1.19.33,
  hash checked); its geo data is cached in `~/.cache/clash-configurator-mihomo`.
  On the owner's PC, `tools\update` puts it in `tools\bin\` (pinned version
  and hash at the top of `update.ps1`).
- Git for Windows checks text files out with CRLF line endings, so on the
  owner's PC every fixture is CRLF. Tests must not depend on line endings
  (split on `/\r?\n/`, or convert first); the output tests run both.
- Changes that name list positions (rules[3]) are worked out against the
  config as it is at that moment; add them in the order they were made.
- Every refusal code and finding id has English text in `app/src/i18n/en.ts`;
  `en.test.ts` fails if one is missing. Add both together.
- Treat inputs as hostile: walk the YAML document (aliases count once), not
  the plain-object view, when scanning a whole config.

## Don't

- Commit secrets (`.env`, keys, tokens).

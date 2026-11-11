# Security

## Reporting a problem

TODO: who to tell, and how (an email address?). Please don't open a public
issue for a vulnerability.

## Secrets

None yet. Never commit them (`.env`, keys, tokens).

- Real configs used for testing hold working credentials. They go in
  `fixtures/private/`, which git ignores (PLAN.md Q26).
- The release signing keys (build step 9) will live only on the owner's PC,
  never on GitHub (PLAN.md Q17, Q24).

## How the app is locked down

- **Every input is treated as hostile** (`core/src/intake/`, PLAN.md Q4).
  It's only read as data: no YAML tags, so nothing is built or run. Size,
  nesting, entry count and alias expansion are capped before anything else
  reads it. Keys like `__proto__` are refused. Risky settings are flagged
  with a fix, and the dangerous ones start ticked.

- **The page can't do anything but show itself.** The Tauri app loads no
  plugins: no file, shell or network access from the page
  (`src-tauri/capabilities/default.json`). Each feature that needs more adds
  one narrow permission, noted here.
- **Strict Content Security Policy** (`src-tauri/tauri.conf.json`): scripts
  and styles only from the app itself, no inline scripts, no frames, no
  plugins, no outside connections.
- **`freezePrototype`** is on, so a crafted config can't change how
  JavaScript objects behave (PLAN.md Q4).
- **Share links are read on the device, never fetched.** Every field is
  checked, options that can't be converted faithfully are refused, control
  characters are refused, and newlines in names become spaces.
- **Opened files are size-checked before they're read:** a config over 8 MB
  is refused without loading it.
- **Saved settings files are treated as hostile too:** every field is
  checked, every change is validated (no poison keys, control characters or
  huge values), and the original goes through intake again.
- **mihomo for the tests** is downloaded by `tools\update` from its GitHub
  release, at a pinned version, and used only if its SHA-256 matches.
- **Packages:** exact versions, locked with hashes in `package-lock.json` and
  `src-tauri/Cargo.lock`. `.npmrc` stops npm packages running install
  scripts.
- **Known, accepted:** `npm audit` reports a low-severity issue in
  `deepmerge`, used by the Svelte build plugin. It only runs while building,
  on our own build settings, and isn't in the app.

## Access

- The repo is `addohm/clash-configurator` on GitHub. This workspace pushes
  with a per-workspace deploy key (SSH alias `deploy-ws-clash-configurator`).
- No GitHub Actions: nothing runs or is stored on GitHub (PLAN.md Q24).
- No production: the app is built on the owner's PC.

TODO: is the repo private? Who else has push access?

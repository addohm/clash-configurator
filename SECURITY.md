# Security

## Reporting a problem

TODO: who to tell, and how (an email address?). Please don't open a public
issue for a vulnerability.

## Secrets

None yet. Never commit them (`.env`, keys, tokens).

- Real configs used for testing hold working credentials. They go in
  `fixtures/private/`, which git ignores (PLAN.md Q26).
- The release signing key (for updates and `SHA256SUMS.txt`) lives only on
  the owner's PC, in `%USERPROFILE%\.clash-configurator\`, protected by a
  password, never on GitHub (PLAN.md Q17, Q20, Q24). Its public half is in
  `src-tauri/tauri.conf.json`. `tools\release` asks for the password and
  keeps it and the key in two environment variables only while it builds
  and signs.

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
- **Fetching:** the page's only way to reach the network is the app's
  `fetch_subscription` command, for a URL the user typed. `fetcher/`
  allows http(s) only and public addresses only (names are resolved there,
  and redirects are checked again, at most 5), reads at most 8 MB counted
  after decompression, gives up after 30 s, and accepts text only. Errors
  never echo the URL, which can hold the user's token. The system proxy is
  used if set; through a proxy, only addresses written in the URL are
  checked, since the proxy resolves names.
- **Saving:** the page's only way to write a file is the app's `save_file`
  command (`src-tauri/src/main.rs`): it shows a Save dialog and writes only
  where the user chose, a file name with no folders in it, up to 64 MB.
  The dialog plugin is used from Rust only; the page gets none of its
  permissions.
- **Send to phone** (`sharer/`, PLAN.md Q19, Q34) is the only thing that
  listens on the network, and only when the user clicks it. It serves
  plain HTTP on one of the PC's private addresses (never 0.0.0.0, never a
  public address), on a random port, behind a 128-bit random path, for at
  most 5 minutes; 30 s after every file has been fetched; or until 20
  wrong requests (someone guessing), whichever comes first. It answers GET
  and HEAD only, reads at most 8 KB of request, and serves only the page
  and the files it was given (at most 4, 16 MB each, names checked). The
  phone's page is escaped and has its own strict CSP. Plain HTTP because
  phones' apps can't trust a certificate made on this PC: anyone watching
  the same Wi-Fi could read the files (they hold server passwords), so the
  panel says to use a network you trust. Windows asks once whether the app
  may use the network.
- **Updates** (PLAN.md Q20): at start the app asks
  `github.com/addohm/clash-configurator/releases/latest/download/latest.json`
  whether there's a newer version; nothing else is sent. It downloads and
  installs only when the user clicks, and Tauri's updater installs it only
  if its signature matches the public key built into the app, and the
  version inside the signature matches the one announced
  (`requireSignedVersion`), so an old signed release can't be passed off as
  new. The check and install are the app's own commands (`update_check`,
  `update_install`): the page gets none of the updater plugin's
  permissions.
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
- **What the app remembers** (the last subscription URL, which holds the
  user's token, the app picked, and the last session) stays in the app's
  own storage on this PC, for the Windows user (WebView2's local storage).
  It's read back as untrusted: the URL must still look like one, and the
  session goes through the same checks as a settings file. **Forget what
  this app remembers** clears it. In a browser (the website, later) this
  would be the browser's storage for the site, so on a shared computer
  people should use Forget.
- **Saved settings files are treated as hostile too:** every field is
  checked, every change is validated (no poison keys, control characters or
  huge values), and the original goes through intake again.
- **mihomo for the tests** is downloaded by `tools\update` from its GitHub
  release, at a pinned version, and used only if its SHA-256 matches.
- **Packages:** exact versions, locked with hashes in `package-lock.json` and
  `src-tauri/Cargo.lock`. The QR code is drawn by `uqr` (no dependencies of
  its own), on the page, as an SVG path. `.npmrc` stops npm packages running install
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

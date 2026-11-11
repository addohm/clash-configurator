# Deploying clash-configurator

There's nothing online: it's a Windows app, built and tested on the owner's
PC (PLAN.md Q18, Q24). The website version comes later.

## First-time setup

On the Windows PC, install the tools listed in README.md, clone the repo and
run `tools\update`. Pick **1** from the menu.

## Shipping a change

1. A change is committed and pushed to `main` (from this workspace or any
   other).
2. On the PC, run `tools\update` and pick **1**. It gets the latest
   (fast-forward only), installs the packages from `package-lock.json`, runs
   the checks and builds the app. It stops on the first failure. If the update
   changed the build script itself, it starts the new version and carries on
   with that. The first
   time, the checks download mihomo into `tools\bin\` (hash checked) to
   load every test config with.
3. It offers to start the new build. The app is
   `src-tauri\target\release\clash-configurator.exe`, and the installer is in
   `src-tauri\target\release\bundle\nsis\`.

To roll back, check out an older commit (`git checkout <commit>`), then pick
**2** (build what's here). `git checkout main` goes back.

Releases (signed checksums, the update file, the GitHub release) come with
build step 9 in ROADMAP.md. TODO: write that up then.

## Configuration

None. The app has no settings files or environment variables yet.

## Troubleshooting

- **"Permission denied (publickey)" or "refused this PC's SSH sign-in":** the
  checkout uses GitHub's SSH address and this PC has no key for it. Switch to
  HTTPS: `git remote set-url origin https://github.com/addohm/clash-configurator.git`.
  Git signs you in through the browser once.
- **"... is not installed" or "too old":** run the `winget` line it prints,
  open a new terminal, and run `tools\update` again.
- **"uncommitted changes" or "diverged":** the script won't touch a checkout
  with local edits. Commit or stash them (`git stash`), or ask for help with
  the merge.
- **The build fails in Rust:** the full error is above the red line. The first
  build needs internet to download Rust packages and NSIS (the installer
  maker).
- **"Windows protected your PC":** expected, the app is unsigned. More info,
  then Run anyway.

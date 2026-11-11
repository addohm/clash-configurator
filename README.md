# clash-configurator

A free, public, one-page tool: bring a Clash config (pasted, uploaded or by
subscription URL), it checks it's safe, fills the page with what's in it,
guides you through changes with plain-English tooltips, and gives back a file
for your app (mihomo apps, Stash or Shadowrocket). Everything stays on your
device. It's planned as a Windows app first, then Linux and a website.

Early days: the app opens, but there's nothing to edit yet. The design is in
[PLAN.md](PLAN.md), and the build order in [ROADMAP.md](ROADMAP.md).

## Getting started

On Windows you need:

- [Git](https://git-scm.com/): `winget install Git.Git`
- [Node.js](https://nodejs.org/) 22 or newer: `winget install OpenJS.NodeJS.LTS`
- [Rust](https://rustup.rs/): `winget install Rustlang.Rustup`
- The Microsoft C++ build tools:
  `winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`

Then clone the repo and run the build script from its folder:

```
git clone https://github.com/addohm/clash-configurator.git
cd clash-configurator
tools\update
```

It shows a menu. Its options:

1. Update: get the latest from GitHub, check, build and install
2. Build and install what's here
3. Run the checks only
4. Start the app in development mode (the page reloads as you edit)
5. Start the app

If something's missing, it says what to install. The first build takes
several minutes, while Rust compiles everything; later ones are quicker.

After a build it offers to install the app, for your user only, with no
admin needed. Say yes, and from then on open **Clash Configurator** from the
Start menu like any other app; you only run `tools\update` to get a new
version. Option 5 opens the installed app (or, if you never installed it,
the last build). If the app is open when you build or install, the script
offers to close it first.

The app is unsigned, so Windows may show "Windows protected your PC". Click
**More info**, then **Run anyway**.

### Testing with your own configs

Put real configs in `fixtures\private\` (git ignores them) and pick **3** in
`tools\update`. The tests check that each one is accepted, and that mihomo
loads it after the default fixes. The script downloads mihomo itself the
first time, into `tools\bin\`, and checks its hash.

### Working without the app

The page and the core also run without Rust, in any browser:

```
npm ci
npm run dev       # the page at http://localhost:5173
npm run check     # type checks
npm test          # unit tests
```

## Usage

So far, Simple mode covers these steps:

1. **Pick your app:** mihomo apps (Clash Verge Rev, FlClash, Clash Meta for
   Android, Clash Party), Stash or Shadowrocket.
2. **Bring your config:** paste it, open or drop the file, or open settings
   you saved before.
3. **Safety report:** anything that can't be used is refused, with the
   reason. Risky settings are listed with a fix: dangerous ones start
   ticked, and you can untick any.

4. **Make your changes:** the config's parts one at a time, with **Undo**.
   - **Basics:** mode, ports, sharing with your network, IPv6.
   - **Servers:** rename (groups and rules follow), remove, or add servers
     by pasting share links (vless, trojan, ss, hysteria2, vmess).
   - Groups, Rules and DNS come next.

Review and saving come after that. Advanced and Scratch modes come later.

## Docs

- [CHANGELOG.md](CHANGELOG.md): what changed in each version
- [DEPLOY.md](DEPLOY.md): how it's deployed
- [SECURITY.md](SECURITY.md): secrets, access, reporting problems
- [ROADMAP.md](ROADMAP.md): what's done and what's next
- [PLAN.md](PLAN.md): the design decisions, question by question
- [CLAUDE.md](CLAUDE.md): notes for Claude working on it
- [fixtures/README.md](fixtures/README.md): the test configs

## License

MIT: see [LICENSE](LICENSE).

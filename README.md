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
git clone git@github.com:addohm/clash-configurator.git
cd clash-configurator
tools\update
```

It shows a menu. Its options:

1. Update: get the latest from GitHub, check, build and run
2. Build and run what's here
3. Run the checks only
4. Start the app in development mode (the page reloads as you edit)

If something's missing, it says what to install. The first build takes
several minutes, while Rust compiles everything; later ones are quicker.

The app is unsigned, so Windows may show "Windows protected your PC". Click
**More info**, then **Run anyway**.

### Working without the app

The page and the core also run without Rust, in any browser:

```
npm ci
npm run dev       # the page at http://localhost:5173
npm run check     # type checks
npm test          # unit tests
```

## Usage

Nothing to use yet: the first build only shows the three modes (Simple,
Advanced, Scratch).

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

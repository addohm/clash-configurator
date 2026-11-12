# Plan

Decisions log for clash-configurator, worked out question by question. Each
entry gives the question number and date. Nothing here is built yet.

## Decided

- **Q1 (2026-11-10): what it is.** A one-page website: config in, config out.
  - Input: a pasted or uploaded Clash config, or a subscription URL.
  - It checks the config is safe before using it.
  - It pre-fills the page with what the config already has.
  - A simple, step-by-step workflow helps the user add or change settings.
    The most likely used settings are all there.
  - Every setting has a mouseover tooltip that explains it to a layman in the
    simplest terms.
  - Output: the config, properly formatted for a Clash app.
  - Clean, modern and simple UI.
  - Takes cues from addohm.net's Clash and Compose tabs (see below).
- **Q2 (2026-11-10): who it's for, and privacy.** Public and free, no
  logins or accounts. Everything is local, in the user's browser: our server
  never saves anyone's config or subscription URL. A user's settings can be
  saved to a file of their own, so they can load them again in a new browser
  (see Q9).
- **Q3 (2026-11-10): subscription URLs.** Our server fetches the URL for the
  user, checks that what comes back is a safe config, and only then passes it
  to the page to fill it in. It's held only for that request: never saved or
  logged. This is the one step that isn't purely in the browser. Pasted and
  uploaded configs never leave the browser.
  - The fetcher needs: a size cap, a short timeout, no private or internal
    addresses (checked again on every redirect), a Clash User-Agent, rate
    limits, and no logging of URLs.
- **Q4 (2026-11-10): what "unsafe" means.** Anything that could harm the
  web server or give someone access to it, and anything else bad. Everything
  that comes in (pasted, uploaded or fetched) is treated as hostile:
  - Never run: YAML is read with a safe loader only (no custom tags), with
    no eval and no shell.
  - Can't exhaust the server or the tab: size caps, depth and alias limits
    (no "billion laughs"), timeouts, no decompression bombs, no user regexes
    run on the server.
  - Can't reach inside: the fetcher blocks private, loopback, link-local and
    cloud-metadata addresses, checked again on every redirect.
  - Not an open proxy: the fetcher returns only a checked Clash config, never
    the raw response, and is rate-limited.
  - Can't inject into the page: config text is always shown as text (no raw
    HTML), behind a strict Content Security Policy.
  - Settings that are bad for the user (controller open with no password,
    allow-lan, dashboards from unknown sites, plain-http downloads) are
    flagged, with the fix ticked by default. Settings we don't know are kept
    and listed. (Assumed from "anything bad"; not confirmed yet.)
  - Code injection (added 2026-11-10), every way in:
    - Into the server: YAML tags, template strings, shell, file paths, and
      header or CRLF tricks in the URL are never interpreted.
    - Into the page: no raw HTML from configs; keys like `__proto__` and
      `constructor` can't pollute JavaScript objects.
    - Into the output: what the user types is written by a YAML serializer,
      never pasted into text, so a value can't smuggle in extra settings.
    - Into the user's Clash app: anything in the config that loads or runs
      outside code (scripts, remote dashboards, remote rule or proxy lists)
      is flagged.
    - The saved settings file is treated as hostile when loaded back.
- **Q5 (2026-11-10): hosting.** Not decided. It must not be tied to GitHub
  Pages (or any one platform): plain static files plus a small fetcher
  service that can run on any server.
- **Q6 (2026-11-10): target apps.** mihomo (Clash Verge Rev, FlClash, Clash
  Meta for Android, Clash Party), Stash, and Shadowrocket.
  - Shadowrocket gets two defined files, as on addohm.net's Clash tab: a
    `.conf` (settings, groups, rules; addohm.net's `shadowrocket_conf.py`) and
    a nodes file (base64 share links; `shadowrocket_sub.py`).
- **Q7 (2026-11-10): app differences.** The user picks their app first (and
  can switch). Settings that app can't use are greyed out with a tooltip
  saying so. They get that app's own file(s): mihomo YAML, Stash YAML, or
  Shadowrocket `.conf` plus nodes file.
- **Q8 (2026-11-10): staying up to date.** The new file is just the
  original file with the user's changes: everything they didn't change stays
  as it was (order, settings we don't know). When the input came from a
  subscription URL, servers stay linked to it, so the user's app keeps them
  current: mihomo and Stash through a proxy provider pointing at their URL,
  Shadowrocket by adding the provider's URL as the subscription next to our
  `.conf`. Pasted configs keep their servers in the file.
  - Build note: groups that name servers one by one need to keep working
    once the servers come from a provider.
- **Q9 (2026-11-10): saved settings and memory.** The saved settings file
  is the original file plus the changes the user wants to make; loading it
  restores the page exactly. The page may remember anything it needs, as long
  as it stays local to the user (in their browser, never on our server).
  - The file holds working server passwords and possibly the subscription
    URL, so the page says to keep it private when saving.
- **Q10 (2026-11-10, corrected 2026-11-11): settings offered** ("for now").
  The input is a working config, usually from a provider, that already has
  its servers, groups, rules, rule providers and DNS. The page shows what's
  there and lets the user change it or add their own entries. Nothing is
  ready-made or pre-selected; that only makes sense for a start-from-scratch
  mode. Seven sections, most used first:
  1. Basics: mode, port, IPv6, sharing with the local network
  2. Servers: view, rename, remove; add by share link (vless, hy2, trojan,
     ss, vmess)
  3. Groups: change type (manual pick, fastest, fallback, load-balance) and
     members; add a group
  4. Rules and rule providers: reorder, change the target group, remove; add
     a site, IP or app rule
  5. DNS: main servers, proxy-server-nameserver, fake-IP or real-IP mode,
     fake-IP exceptions, per-site DNS (nameserver-policy)
  6. Advanced: TUN, sniffing
  7. Advanced: dashboard and controller password, geo data files
- **Q11 (2026-11-11): workflow.** Simple by default, plus Advanced (and
  Scratch, Q22):
  - Simple: numbered steps down one page (pick app, bring config, safety
    report, the sections as cards showing what the config has, with Skip, review
    what changed and download), with a progress bar and jumping between steps.
  - Advanced: everything at once on one page, still with the tooltips.
- **Q12 (2026-11-11): tooltips.** A small ⓘ next to every setting: hover on
  a computer, tap on a phone (tap elsewhere to close), and keyboard focus.
  One or two plain sentences on what it does and when you'd want it, no
  jargon, with the real setting name in small grey text.
- **Q13 (2026-11-11): language.** English for now, built so more locales
  can be added later: all text, tooltips included, in one place per locale.
- **Q14 (2026-11-11): what it's built with, and how it ships.** Both a
  website and a local app; the local app is the most secure version and the
  one people will trust most. Stack (left to Claude):
  - Config core (read, check, edit, convert to each app's files): plain
    TypeScript, separate from the UI, the most heavily tested part. The `yaml`
    library, which keeps the original's order and comments and limits aliases.
  - Page: Svelte 5 + Vite, built to static files. Plain CSS with light and
    dark themes, a few accessible pieces for tooltips and popups.
  - Local app: Tauri 2 wrapping the same page. It fetches subscription URLs
    itself, so it needs no server.
  - Fetcher: one Rust library that checks the real address at connect time
    (redirects included), used by both the Tauri app and the website's small
    fetcher server.
  - Tests: unit tests on the core against real-world configs, browser tests
    on the page, every mihomo output checked with `mihomo -t`, and a manual
    test list for Stash and Shadowrocket.
  - Packages pinned with lockfiles, install scripts off. Rust builds are
    heavy on the shared CPU: run them at low priority and in small pieces.
- **Q15 (2026-11-11): open source.** Public repo, MIT license, so anyone can
  check that the app never sends their config anywhere, and Actions can build
  the apps for free. Anyone can copy it, a rival included.
  - Risk: several of the owner's repos had a malicious "security audit"
    workflow slipped in. Release builds need care: signed tags, and a check
    of `.github/workflows` before every release.
  - The repo isn't made public yet; that's the owner's step, at release.
- **Q16 (2026-11-11): local app devices.** Windows and Linux (one Tauri
  build), Windows first (Q25). No Mac app, ever (changed by Q17). Phones and
  Macs use the website.
- **Q17 (2026-11-11): signing and cost.** Nothing that costs money, and no
  Mac at all. So the apps are unsigned:
  - Windows shows "Windows protected your PC"; the download page walks
    through "More info", "Run anyway".
  - Every release publishes SHA-256 checksums, signed with a free key
    (minisign) kept on the owner's machine, never on GitHub.
- **Q18 (2026-11-11): local first.** Build only the local app (Windows and
  Linux) for now; the internet-accessible website comes later. Until then:
  - The app fetches subscription URLs itself (Rust fetcher inside the app);
    the website's fetcher server (Q3) and hosting (Q5) wait for the website.
  - The page is still built as static files, so the website is mostly a
    hosting job later.
  - Phone and Mac users make their file on a Windows or Linux PC.
- **Q19 (2026-11-11): getting files to a phone.** A normal save, plus a
  "Send to phone" button: the app serves the file(s) on the local Wi-Fi for a
  few minutes behind a random one-time link and shows a QR code; the phone's
  app (Stash, Shadowrocket, Clash Meta for Android) imports from that link.
  It serves only that file and stops after the download or 5 minutes.
  Windows asks once to allow network access; hotel Wi-Fi that isolates
  devices falls back to the normal save.
- **Q20 (2026-11-11): updates.** The app checks the project's GitHub
  releases automatically and tells the user when there's a newer version;
  it only downloads and installs when they click, after checking the
  release's signature (Tauri updater, free key). Besides that check, it only
  goes online for a URL the user gives it, and the download page says so.
- **Q21 (2026-11-11): dropped.** It asked where ready-made rule lists come
  from, but an input config already has its own. Presets belong only to the
  scratch mode (Q22, Q23).
- **Q22 (2026-11-11): three modes.** Simple (the default), Advanced, and
  Scratch: build a config from nothing, which is also a way to learn how a
  Clash config works.
- **Q23 (2026-11-11): scratch mode.** Every step opens with a line or two
  on what that piece is and why it's there.
  1. Pick your app.
  2. Servers: paste share links (vless, hy2, trojan, ss, vmess) or give a
     subscription URL (its servers stay linked, as in Q8).
  3. Groups: a manual-pick group, an optional fastest-server group, and
     country groups made automatically from server names.
  4. Rules: tick lists (ad blocking, China sites direct, streaming, AI
     services, Telegram); everything else goes through the proxy. Sources:
     mihomo's own site data (MetaCubeX) for mihomo, blackmatrix7's
     `ios_rule_script` for Stash and Shadowrocket, set up to download from
     inside China.
  5. DNS: China-friendly settings, filled in and explained, with addohm.net's
     fake-IP exceptions.
  6. Review and download, or open the result in Simple or Advanced mode.
- **Q24 (2026-11-11): building and testing.** The owner builds and tests on
  their Windows PC by pulling and running a build script from the repo. No
  GitHub Actions, so nothing runs or is stored on GitHub. Same pattern as
  pebble's `tools\update.cmd` / `deploy.ps1`: pull, run the checks, build,
  install or run. A second script signs the checksums and the update file
  with the owner's free keys and publishes the release. This sandbox tests
  the core and the page (unit and browser tests, `mihomo -t`), but can't
  build or run the Windows app.
- **Q25 (2026-11-11): Windows first.** Start with the Windows app only. The
  Linux app comes later, also built and tested locally by the owner (WSL or
  a Linux machine) with a Linux version of the build script.
- **Q26 (2026-11-11): test configs.** Both real and made-up:
  - Real: Wannaflix's and addohm.net's configs. The copies in this sandbox
    (addohmnet-modern `backend/_clash_dumps/`) are only tiny smoke-test
    stubs, so the real files come from the owner: downloaded from
    addohm.net's Clash tab and Wannaflix, then attached in Discord or dropped
    on the PC. They hold working credentials, so they live in a git-ignored
    folder and never reach the public repo.
  - Made up, committed: the shapes common provider panels produce, with fake
    servers and passwords, plus booby-trapped ones that prove the safety
    checks work.
- **Q27 (2026-11-11): name.** Clash Configurator. Look (not objected to):
  light and dark follow the system, one accent colour, clean readable fonts.
- **Q28 (2026-11-12): linked servers, chosen at save.** For a config from a
  subscription URL, the review step has a "Keep servers updating from my
  subscription" switch, on by default. Linked, the saved config takes its
  servers from the subscription (a proxy provider) and keeps the user's
  choices that can be kept: which servers they kept (a name filter),
  renames, and servers they added themselves (left in the file). If an edit
  can't carry over (the order of servers inside a group, one server's own
  settings), the switch lists it first; switching off writes the servers
  into the file, keeping every edit, without updates. Linking isn't offered
  when a rule or setting names one of the subscription's servers directly.
- **Q30 (2026-11-12): sidebar app layout.** The owner found the page "not
  responsive", with long lists making for a lot of scrolling. Replaces Q11's
  "numbered steps down one page": like Clash Verge Rev, the steps and the
  edit parts sit in a sidebar on the left and the content fills the window;
  long lists scroll inside their own panel, sized to the window, with a
  search box; servers, rules and long lists can be ticked for bulk actions
  (remove selected, keep only selected); groups show the list and the
  chosen group's details side by side. Narrow windows stack it.
- **Q31 (2026-11-12): expert DNS settings in Advanced mode only.** Changes
  Q10's DNS part. Simple mode's DNS keeps: on/off, fake or real addresses,
  and the main DNS servers. Per-site DNS (nameserver-policy), the servers
  for finding proxy servers (proxy-server-nameserver), default, backup and
  direct servers, and fake-IP exceptions are shown only in Advanced mode
  (owner's pick over folding them in Simple), so they can't be edited until
  Advanced mode exists. They stay in the config untouched meanwhile.
- **Q32 (2026-11-12): Update from my subscription.** For a config from a
  URL: fetch the provider's latest full config and re-apply the user's
  edits to it, worked out by meaning (servers and groups by name, rules by
  kind and value, settings by name), not by line. Where only one side
  changed something, it's taken without asking. Where both did, the owner's
  rule: user changes are never overwritten silently, so it asks, with a
  pre-selected answer by kind: what the connection needs (server
  addresses, ports, keys and passwords, per-site DNS, the DNS for finding
  servers and DNS servers, hosts, proxy providers) defaults to the
  provider's; preferences (rules, groups, basics, other DNS, TUN, sniffing,
  controller, geo data) default to the user's. A report lists what was
  re-applied and what couldn't be (e.g. a server the provider removed);
  "Undo update" restores the session from before. Also: the save-time
  warning when linked servers depend on the provider's own DNS.

- **Q29 (2026-11-12): many kinds of subscription.** "There are a plethora
  of different subscription URL types, don't just focus on Wannaflix." So
  besides full Clash configs (as Wannaflix sends), an input may be a Clash
  file with only servers, a list of share links (plain, or base64 as
  v2rayN-style panels send it) or SIP008 JSON. Server lists become a basic
  Clash config to edit: the servers, a "Proxy" group (pick by hand, "Auto"
  first), an "Auto" group (fastest), and `MATCH,Proxy`; the safety report
  says so and lists entries it couldn't read. This settles the open
  "server lists as input" question. Linking works for share-link lists too
  (mihomo reads them as a provider; checked by running mihomo), not for
  SIP008. The provider's name (profile-title, content-disposition) names
  the saved file, and its profile-update-interval sets the linked
  servers' update interval.

## From addohm.net (addohmnet-modern), studied 2026-11-10

Worth borrowing:
- `backend/clash/services/clash_compose.py`: `compose()` merging, loop checks
  (`leads_to`), `filter:` expansion
- `fake_ip_defaults.py`: 30 recommended fake-ip-filter patterns with plain
  comments
- `auto_groups.py`: url-test / fallback / load-balance group templates
- The fake-ip and nameserver-policy merge and validation code
- `formats.py`: one table describing every output format
- Help-text tone: plain words that say what happens, e.g. "A health-checked
  group tests its servers every few minutes and skips dead ones on its own"

Not reusable as it is for a public tool:
- Subscription fetching has no size cap and no SSRF guard
- YAML intake has no size, depth or alias-bomb limits, and passes
  `external-controller` and `secret` straight through
- Everything tied to logins, the database, device tokens and the Wannaflix
  importer

## Open

- Website: hosting (Q5) and its fetcher server (Q3) wait until after the
  local app (Q18). It must cost nothing (Q17).
- Q4: flagging settings that put the user at risk, fix ticked, was assumed
  from "anything bad" and never objected to. Confirm when the safety report
  is built.
- Where to report security problems (SECURITY.md).
- Making the repo public: the owner's step, at the first release (Q15).

## Build order

The owner said go on 2026-11-11. Each step is commit-sized; the owner builds
and tests on Windows. Progress is in ROADMAP.md.

1. Skeleton: TypeScript core, Svelte page, Tauri shell, and `tools\update`
   (pull, checks, build, run), as in pebble.
2. Core intake: size, depth and alias limits, safe parsing, the hostile and
   injection checks, with made-up and booby-trapped test configs.
3. Core editing: read a config, apply changes while keeping the original's
   order and comments, write mihomo YAML checked by `mihomo -t`, and the
   saved settings file.
4. Page, Simple mode: the numbered steps, sections 1-5, ⓘ tooltips.
5. Rust fetcher in the app, with subscription servers kept linked (Q8).
6. Stash YAML, then Shadowrocket `.conf` plus nodes file.
7. Advanced mode (sections 6-7), then Scratch mode.
8. Send to phone.
9. Update check, the release script (checksums and update file signed on the
   owner's PC), and the release kit: zip and tag, LISTING.md, icon, banner.

Later: the Linux app, the website, more locales.

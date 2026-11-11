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
- **Q10 (2026-11-10): settings offered** ("for now"). Seven sections, most
  used first:
  1. Basics: mode, port, IPv6, sharing with the local network
  2. Servers: view, rename, remove; add by share link (vless, hy2, trojan,
     ss, vmess)
  3. Groups: manual pick, fastest, fallback; ready-made country groups
  4. Rules: site or app to a group; ready-made lists (ads, China direct,
     streaming, AI services, Telegram)
  5. DNS: main servers, proxy-server-nameserver, fake-IP or real-IP mode,
     fake-IP exceptions (addohm.net's recommended set), per-site DNS
     (nameserver-policy)
  6. Advanced: TUN, sniffing
  7. Advanced: dashboard and controller password, geo data files
- **Q11 (2026-11-11): workflow.** Two modes, simple by default:
  - Simple: numbered steps down one page (pick app, bring config, safety
    report, the sections as cards with a recommended choice and Skip, review
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
  build). No Mac app, ever (changed by Q17). Phones and Macs use the website.
- **Q17 (2026-11-11): signing and cost.** Nothing that costs money, and no
  Mac at all. So the apps are unsigned:
  - Windows shows "Windows protected your PC"; the download page walks
    through "More info", "Run anyway".
  - Every release publishes SHA-256 checksums, signed with a free key
    (minisign) kept on the owner's machine, never on GitHub.

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

Still to drill. Questions come one at a time.

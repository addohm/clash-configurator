# Changelog

All notable changes to clash-configurator. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

- Send to phone (roadmap step 8, PLAN.md Q19, Q34, 2026-11-12): in the
  Windows app, Review offers the new file(s) on the local Wi-Fi for five
  minutes with a QR code. The phone's page has a button for its app
  (Clash Meta or FlClash, Stash, Shadowrocket's servers then config), using
  each app's own add-from-link, plus plain downloads. The panel counts
  down, says what the phone fetched, offers the PC's other addresses, and
  stops early once everything is fetched or if someone guesses at links.
  New: the `sharer/` crate (tested on its own; the build script runs its
  tests) and the `uqr` package for the QR code. Not yet tried with a phone.

- Stash and Shadowrocket files (roadmap step 6, PLAN.md Q33, 2026-11-12):
  - **Stash** gets its own YAML: the mihomo file laid out the same, without
    the settings Stash sets itself (ports, LAN sharing, controller, TUN,
    sniffing, geo data, some DNS keys) or rule types it lacks, and with
    Hysteria2 and VLESS fields under Stash's names.
  - **Shadowrocket** gets a `.conf` (DNS, including the DNS for the
    servers' own names; groups; rules, MATCH as FINAL; hosts) and a server
    list of share links, saved as two files.
  - Review lists what each app's file left out (rules in a fold-out), and
    compares the original with the Stash file itself.
  - Edit cards tag settings the chosen app doesn't use ("Not used by
    Stash"); TUN and the controller say so for the whole part.
  - Share links can be written as well as read (`writeLink`), and a link
    read in keeps its UUID's case.
  - Linking servers to the subscription is for mihomo apps only for now.
  - Wording: "You haven't changed anything" when there are no edits;
    linking's notes say "untick" rather than "switch it off".

- Advanced mode, part 1 (roadmap step 7, 2026-11-12): every part of the
  config on one page (PLAN.md Q11), no step-by-step guidance. A bar at the
  top holds which app the config is for, the change count, Undo and
  Review and save; the sidebar jumps to each part. Lists keep their own
  scrolling panels. DNS shows the expert settings (Q31). Bringing the
  config and the safety report come first; with no app picked, it's for
  mihomo apps. Reviewing and saving is its own view, with Back to editing.
- Advanced mode, part 2 (2026-11-12): the two expert parts (PLAN.md Q10
  parts 6 and 7), with ⓘ tooltips:
  - **TUN and sniffing:** TUN on/off, network stack, auto-route, finding
    the real adapter, strict route, DNS lookups to answer itself; sniffing
    on/off, using the name it reads, which protocols (HTTP, TLS, QUIC) on
    which ports, and sites not to read.
  - **Controller and geo data:** the remote control's address and password
    (shown on request, or made random), the dashboard (only well-known
    ones offered, with a folder), the kind of country files, automatic
    updates and their interval, and https addresses for each geo file.
  - Values are checked as they're entered; an empty field removes a
    setting. A new section set deep inside (`sniffer.sniff.TLS`) goes in
    with the other settings, not after the rules.
  - mihomo loads every test config with all of these changed.

- **Update from my subscription** (PLAN.md Q32, 2026-11-12): for a config
  from a subscription URL, a button in the edit step (and Advanced's bar)
  gets the provider's latest full config and makes the user's changes
  again on top of it, worked out by meaning: servers and groups by name
  (renames spotted), rules by kind and value, settings by name, lists by
  what was added and removed. Where only one side changed something, it's
  taken. Where both did, it asks, with the provider's version suggested for
  what the connection needs (server details, per-site DNS, DNS for finding
  servers, hosts) and the user's for preferences. A short report says how
  many changes were made again and which couldn't be (a server the
  provider dropped, say); **Undo update** puts everything back. Checked on
  the real WF configs with mihomo.
- The review warns, when servers are kept updating from the subscription,
  if some are found through the provider's own DNS settings (22 of WF's 43,
  under +.teacher2060.com): those settings don't update with them.

### Changed

- The page is now an app with a sidebar (PLAN.md Q30, 2026-11-12): the steps
  and the edit parts are in a sidebar on the left, with a line under each
  finished step, and the open step fills the rest of the window. The edit
  step keeps its title, Undo and the change count at the top and Back/Next
  at the bottom, with the part in between filling the window. Narrow
  windows stack the sidebar on top.
- The lists (Q30, part 2, 2026-11-12):
  - Servers: a table that fills the window and scrolls inside, with a
    search box and tick boxes: **Remove ticked** and **Keep only ticked**
    remove many servers in one edit (one Undo), refused with the reason if
    a rule uses one or a group would be left empty. Adding servers is
    folded away below.
  - Groups: the list on the left, the chosen group on the right (type,
    members, rename, remove), or the new-group form with a member search.
  - Rules: a table (200 per page) in its own scrolling panel, with tick
    boxes and **Remove ticked**; adding a rule and the rule lists are
    folded away below.
  - DNS: the lists side by side on wide windows; any list longer than 12
    gets its own search box.
- Simple mode's DNS part keeps only DNS on/off, fake or real addresses and
  the main DNS servers (PLAN.md Q31, 2026-11-12). Per-site DNS, the servers
  for finding proxy servers, default/backup/direct servers and fake-IP
  exceptions are expert settings for Advanced mode (not built yet); the
  config keeps them as they are, and the DNS part says where they went.

- `tools\update` offers to install each new build (quietly, for your user,
  with a Start menu entry) and start it. A new menu option, **Start the
  app**, opens the installed app or else the last build. It offers to close
  an open app window before building or installing over it (2026-11-11).

### Fixed

- Counts read properly: "1 change", "1 server", "1 entry was" (a
  `{count|one|other}` form in the page's text, 2026-11-12).
- `tools\update`: when an update changes the build script itself, it starts
  the new version, which carries on from step 2. Before, the rest of that
  run used the old script (2026-11-11).
- Tests pass on a Windows checkout, where Git turns line endings into CRLF.
  The output tests now run every fixture with both LF and CRLF
  (2026-11-11).
- `tools\update`: when GitHub refuses SSH sign-in, it says how to switch to
  HTTPS. It no longer prints a stray `RemoteException` line in git errors
  (2026-11-11).

### Added

- Standard docs: README, CLAUDE, CHANGELOG, DEPLOY, SECURITY and ROADMAP (2026-11-10).
- Docs filled in with what's known so far, with TODO questions for the rest (2026-11-10).
- PLAN.md: design decisions Q1–Q27 and the build order (2026-11-11).
- The skeleton (2026-11-11):
  - the config core (TypeScript) with its first tests
  - the page (Svelte 5), with its text in one English file
  - the Windows app shell (Tauri 2): no plugins, a strict Content Security
    Policy, frozen prototypes
  - `tools\update`, a menu-driven script that updates, checks, builds and
    runs the app on Windows
  - a placeholder icon
  - the MIT license
- Safe intake, step 2 (2026-11-11), in `core/src/intake/`:
  - It refuses hostile input before using it: too big, not text, web pages,
    share-link lists, broken YAML, more than one document, YAML tags,
    alias bombs, deep nesting, too many entries, duplicate keys, keys that
    attack JavaScript objects, and configs with no servers.
  - It flags risky settings, most serious first, each with a fix: an open or
    passwordless controller, LAN sharing, open listeners and DNS, outside
    dashboards, plain-http downloads, file paths outside the app's folder,
    scripts, MITM, rewrites, tunnels, hosts, hidden characters, and settings
    it doesn't know.
  - Fixes edit the original document, so comments and order stay.
  - Plain-English text for every refusal and finding, in `app/src/i18n/en.ts`.
  - Made-up and booby-trapped test configs in `fixtures/`, plus a test that
    runs any real configs in `fixtures/private/`.
- Editing and mihomo output, step 3 (2026-11-11), in `core/src/edit/`:
  - Changes (set, delete, insert, move) are kept as a list on top of the
    original. Values are written by the YAML library, so a typed value can't
    add settings.
  - Output keeps the original's comments, order, quoting and list layout. An
    unchanged config comes back byte for byte.
  - Renaming a server or group updates every place that names it: groups,
    rules, sub-rules, dialer-proxy, listeners, tunnels, providers and DNS.
    Names with commas, built-in names and names already in use are refused.
  - The saved settings file (JSON): the original plus the changes, app, mode
    and source. Loading checks every field and runs the original through
    intake again.
  - Every edited result goes through intake, so the user's own changes get
    the same checks.
  - `tests/mihomo.test.ts` loads every output with `mihomo -t`.
    `tools\update` downloads a pinned, hash-checked mihomo into `tools\bin\`
    for it.
- Simple mode, first part, step 4a (2026-11-11):
  - The numbered steps with a progress bar; finished steps can be reopened.
  - Pick your app.
  - Bring your config: paste it, open a file, drop a file, or open a saved
    settings file. Files over 8 MB are refused before they're read.
  - The safety report: refusals in plain words; risky settings, most serious
    first, with their fixes ticked or not, and the setting each is about.
  - The ⓘ tooltip: hover, tap or keyboard; tap elsewhere or Escape closes it.
  - Page tests in a simulated browser (happy-dom), including one with
    JavaScript's object prototype frozen, as the app runs it.
  - Dropping a file on the page works in the Windows app: Tauri's own
    drag-and-drop handling is off, so the page gets the file.
  - Editing, review and saving come in 4b and 4c.
- Simple mode, step 4b-1 (2026-11-11): the edit step.
  - The config's parts as cards (Basics, Servers, Groups, Rules, DNS), one
    at a time with Next and Back; Undo takes back the last edit. Groups,
    Rules and DNS come in 4b-2 and 4b-3.
  - Basics: mode, ports, sharing with the network, IPv6, as the config has
    them, with ⓘ tooltips.
  - Servers: the list; rename (every group, rule and DNS reference follows);
    remove (taken out of every group, or refused with the reason: a rule
    sends traffic to it, another server connects through it, or it's a
    group's only member); add from share links, into the groups that list
    every server (changeable).
  - Share links (`core/src/links/`): vless (incl. Reality, ws, grpc, h2,
    xhttp), trojan, ss (SIP002 and old), hysteria2 (incl. port hopping and
    salamander), vmess. Options that can't be converted faithfully are
    refused, not guessed. All 43 links of a real subscription parse.
  - Edits change the open config in place: a few milliseconds each on a
    config with 5,830 rules, instead of a full rebuild.
  - New top-level settings go above the servers, groups and rules.
  - mihomo loads every test config with servers added from each kind of
    link.
- Simple mode, step 4b-2 (2026-11-11): Groups and Rules.
  - Groups: type (pick by hand, fastest, first that works, spread out) and
    members (add, reorder, take out); rename; remove when nothing uses it,
    else what uses it; add a group. It won't make an empty group, a group
    inside itself, or the `relay` type mihomo dropped (all checked with
    `mihomo -t`).
  - Rules: in plain words ("Site and its subdomains: example.com goes to
    Proxy"), searched and paged 50 at a time for long provider lists; change
    where one goes, move, remove; add one (checked by kind) just above the
    last rule, so it takes effect. Rule lists: shown with where they come
    from and which rules use them; unused ones can be removed.
  - One target dropdown at a time, so 5,830 rules stay quick.
- Simple mode, step 4b-3 (2026-11-11): DNS.
  - On or off, fake or real addresses, and the server lists the config has
    (main, for finding proxy servers, plus default, backup and direct ones
    when present): add, move, remove.
  - Servers are checked: plain addresses, https://, tls://, quic://,
    udp://, tcp://, dhcp://, system, and `#Name` to look up through a group
    (which must exist; mihomo itself doesn't check). The list for finding
    DNS servers takes plain addresses only.
  - Sites that get their real address (fake-IP exceptions) and per-site
    DNS: add, edit, remove. No ready-made entries (PLAN.md Q10).
  - mihomo loads every test config after DNS edits.
- Review and save, step 4c (2026-11-11):
  - The review step compares the original and the new config line by line,
    only where they differ (with two lines around each change), says what
    the safety checks still flag in the result, and saves.
  - **Save the config** and **Save settings** open a Windows Save dialog
    (a new `save_file` command in the app, using Tauri's dialog plugin);
    in a browser they download. **Show the whole config** shows it to copy.
  - Stash and Shadowrocket users are told their own files come later; they
    get the mihomo config for now.

- Subscription URLs, step 5a (2026-11-12):
  - Step 2 has a box for your subscription URL. The Windows app fetches it
    itself, with a Clash User-Agent so providers send a Clash config, then
    it goes through the same checks as a pasted config. The provider's data
    usage and end date, when it sends them, show in the safety report.
  - `fetcher/`, a Rust library (also for the website later, PLAN.md Q14):
    http(s) only; public addresses only, checked on every redirect (at most
    5), so a link can't reach this PC or the local network; at most 8 MB,
    counted after decompression; 30 s; text only. Clash's fake-IP range is
    allowed, so fetching works while Clash runs. It uses the system proxy
    (often the user's Clash app). It builds with rustls on the ring crypto
    backend, which needs no extra tools on Windows.
  - Its tests (10, including a gzip bomb and a real HTTPS fetch) run here
    and in `tools\update`.
- Linked servers and more kinds of subscription, step 5b (2026-11-12):
  - For a config from a subscription URL, the review has **Keep servers
    updating from my subscription** (PLAN.md Q28), on by default. The saved
    config then gets its servers from the URL (a mihomo proxy provider,
    with the provider's update interval when it sends one), keeping which
    servers you kept (a name filter), renames, and servers you added
    yourself. Edits that can't carry over are listed first (a pick-by-hand
    group that would start on another member, a first-that-works group's
    order, one server's own settings, new servers hidden by your choice);
    switch off to write the servers into the file. It isn't offered when a
    rule or setting names a subscription server directly, or for SIP008.
  - Inputs can be a full Clash config, a Clash file with only servers, a
    list of share links (plain or base64, v2rayN style) or SIP008 JSON
    (Q29). Server lists become a basic config: the servers, Proxy and Auto
    groups, and one rule; the report says so and lists what couldn't be
    read. Names with raw spaces in share links are read.
  - The subscription's name (profile-title or content-disposition) names
    the saved file.
  - mihomo loads the linked version of every test config and of the real
    WF configs, and a config built from share links; running mihomo
    confirmed it reads a base64 share-link list as a provider.

- The app remembers between runs (PLAN.md Q9), on this PC only, in its own
  storage for the Windows user (2026-11-12):
  - the last subscription URL (filled into step 2), the app picked, and the
    "Keep servers updating" choice;
  - the last session (the config and every change, in the same form as a
    saved settings file), offered as **Carry on** or **Start fresh** when
    the app opens. It's checked like any input when brought back; a bad one
    is cleared.
  - **Forget what this app remembers** at the bottom clears it all. A
    config too big for the storage isn't remembered, and the page says so.

### Fixed

- Output now keeps everything that didn't change exactly as it was. Before,
  the whole file was rewritten with one indentation, so a real provider
  config (four spaces in some sections, two in others) came back with
  5,845 lines changed and no edits at all. The writer now copies unchanged
  entries from the original text and rewrites only what changed, at the
  original's indentation: WF configs come back byte for byte, and the two
  safety fixes change exactly two lines (2026-11-11).
- Replacing a `[a, b]` or `{a: 1}` value keeps that style instead of
  turning it into a multi-line list (2026-11-11).
- The comparison uses a patience diff, so a rename that touches thousands
  of rules compares in well under a second instead of timing out
  (2026-11-11).

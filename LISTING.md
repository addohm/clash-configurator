# Clash Configurator: listing and release kit

Copy-paste material for the GitHub page, the release posts and anywhere the
app is announced. Placeholders are in [brackets]. Keep the feature list in
step with README.md.

---

## Basics

| Field | Value |
| --- | --- |
| Name | Clash Configurator |
| Repository | `addohm/clash-configurator` |
| Platform | Windows 10 and 11 (64-bit); Linux later |
| Works with | mihomo apps (Clash Verge Rev, FlClash, Clash Meta for Android, Clash Party), Stash, Shadowrocket |
| Author | addohm |
| License | MIT |
| Price | Free |
| Source | https://github.com/addohm/clash-configurator (once public) |
| Issues | https://github.com/addohm/clash-configurator/issues (once public) |

**Images** (made by `tools/art/make_art.py`)
- Icon: `tools/art/app-icon.png` (1024), `tools/art/icon-400.png`
- Banner / social preview: `tools/art/banner.png` (1600x500). GitHub's social
  preview wants 1280x640: [crop or redraw at release]
- Screenshots: [the safety report; the Servers part; Review with the
  comparison; Send to phone's QR code; Scratch mode's rules step]

**GitHub "About"**

> Edit a Clash config safely: config in, safety check, guided edits, config
> out. For mihomo, Stash and Shadowrocket. Everything stays on your PC.

**Topics**: `clash`, `mihomo`, `clash-meta`, `stash`, `shadowrocket`,
`proxy`, `config-editor`, `tauri`, `svelte`, `windows`

**One-liner** (under the name; 118 characters)

> Bring your Clash config, see what's risky, change it with plain-English
> help, and save it for your app. Nothing leaves your PC.

**Short tagline** (for images or a post title)

> Your Clash config, made safe and simple.

---

## Description

*(Markdown, for the README top or a release post.)*

### Clash Configurator

**Edit your Clash config without learning YAML.**

Your provider hands you a config: thousands of lines of servers, groups and
rules. Clash Configurator reads it, checks it's safe, and lays it out as a few
plain pages you can change with the mouse. Every setting has an ⓘ that says
what it does in everyday words.

#### What it does

- **Brings in any config:** paste it, open the file, or give your subscription
  URL. Lists of share links (vless, trojan, ss, hysteria2, vmess) and SIP008
  work too.
- **Checks it first:** anything hostile is refused, and risky settings (a
  remote control open to your network, a dashboard downloaded from a
  stranger's site, files saved outside the app's folder, ...) are listed
  with a fix.
- **Guided edits:** rename or remove servers (groups and rules follow), add
  servers from share links, change groups, move and retarget rules, set DNS.
  Undo any step. Advanced mode puts everything on one page, with TUN,
  sniffing, the dashboard and geo data.
- **Keeps your file yours:** everything you didn't change stays byte for byte
  as it was, comments and all. Review shows exactly which lines changed.
- **Stays up to date:** keep your servers updating from your subscription, or
  pull your provider's latest config and keep your edits on top (it asks when
  you both changed the same thing).
- **For your app:** mihomo apps get their YAML, Stash its own, Shadowrocket a
  .conf and a server list. Settings your app doesn't use are marked.
- **Send to phone:** a QR code your phone scans on the same Wi-Fi; a tap adds
  the config to Stash, Shadowrocket or Clash Meta.
- **Start from scratch:** pick your app, paste your share links, tick the rule
  lists you want (ads, AI, streaming, Telegram, Chinese sites direct), and get
  a working config, with a note on what each part is for.

#### Private by design

Everything happens on your PC. The app goes online only to fetch a
subscription URL you give it, and to check this project's GitHub releases for
a new version (it installs one only when you click, after checking its
signature). No accounts, no analytics.

#### Download

[Clash-Configurator_X.Y.Z_x64-setup.exe from the latest release]: installs
for your Windows user, no admin needed. Or the portable zip: no install.

Windows may say it "protected your PC": the app isn't code-signed (that costs
money). Click **More info**, then **Run anyway**. Every file's SHA-256 is in
`SHA256SUMS.txt`, signed with the project's key.

---

## FAQ

**Is my subscription URL or config sent anywhere?** No. The URL is fetched
from your PC, and nothing else leaves it. What the app remembers (your last
URL and session) stays in its own storage on your PC; **Forget what this app
remembers** clears it.

**Which apps can use the result?** Clash Verge Rev, FlClash, Clash Meta for
Android, Clash Party and other mihomo apps; Stash; Shadowrocket.

**Does it work in China?** Yes: it runs offline, and Scratch mode's rule lists
and DNS are set up to work from inside China.

**Mac?** No: building and testing for Mac costs money. Linux is planned.

---

## Release post template

> **Clash Configurator [X.Y.Z]**
>
> [Two or three lines on what's new, from CHANGELOG.md.]
>
> Download: [link to the release]. Windows 10 and 11, free and open source.

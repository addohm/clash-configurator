# Roadmap

What's done for clash-configurator, and what's next. Update it in the same commit as the
change.

## Done

- Standard docs (2026-11-10).
- Planning: Q1–Q27 in [PLAN.md](PLAN.md) (2026-11-11).
- Step 1, skeleton: core, page, Tauri shell, Windows build script (2026-11-11).
  Built and started on the owner's Windows PC the same day.
- Step 2, safe intake: refusals, risky-setting checks and fixes, with tests
  (2026-11-11).
- Step 3, editing and mihomo output: changes, renames that update every
  reference, layout-keeping output, the saved settings file, `mihomo -t` on
  every output (2026-11-11).
- Step 4, Simple mode (2026-11-11): pick the app, bring a config, the safety
  report (4a); Basics and Servers (4b-1); Groups and Rules (4b-2); DNS
  (4b-3); review and save (4c). Saving through the Save dialog confirmed
  on the owner's PC (2026-11-12): an edited WF config saved, kept every
  untouched line, and loads in mihomo.
- Step 5, subscription URLs (2026-11-12): the Rust fetcher and the URL
  box (5a); servers linked to the subscription, chosen at save (Q28); other
  kinds of subscription (Q29). Update from my subscription (Q32): the core,
  the button, the questions, the report with Undo update, and the
  save-time warning about provider DNS.
- Step 6, Stash and Shadowrocket files (2026-11-12, PLAN.md Q33): what each
  leaves out listed at review, and the settings the chosen app doesn't use
  tagged in the edit cards (Q7).
- Step 7, Advanced and Scratch modes (2026-11-12): every part on one page
  with the expert DNS settings (Q31), TUN and sniffing, controller,
  dashboard and geo data (Advanced confirmed working on the owner's PC the
  same day); Scratch mode, six explained steps (Q23, Q35).
- Step 8, Send to phone (2026-11-12, Q34).
- Step 9, updates and releases (2026-11-12, Q20, Q36): the update check and
  signed install, `tools\release`, and the release kit (LISTING.md, icon,
  banner, portable zip, signed checksums).

The alpha is complete (2026-11-12): every step of the build order is built.

## Next

Try the alpha on the owner's PC (`tools\update`, option 1), then make the
first release:

- [ ] Stash: pick Stash, bring the WF config, review: the left-out list, the
  comparison, Save the config; load it in Stash.
- [ ] Shadowrocket: both files saved; load them in Shadowrocket.
- [ ] Send to phone: the firewall prompt (allow on private networks), the QR
  code from an iPhone and an Android phone, each app's button (Clash Meta or
  FlClash, Stash, Shadowrocket's two).
- [ ] Scratch mode: paste some share links, tick everything, Make it and
  review; the saved config loads in Clash Verge Rev and the rule lists
  download (inside China if possible).
- [ ] The new icon in the Start menu and the title bar.
- [ ] The first release: `tools\release` (makes the signing key; back it
  up). Making the repo public is the owner's step (Q15); until then the
  update check finds nothing.
- [ ] The update check: after a second release, the first version offers
  it, and Update and restart installs it.

Then: fixes from the above; decide where security reports go (SECURITY.md).

## Ideas

- The Linux app (after Windows)
- The website version (free hosting, its own fetcher)
- More languages, starting with Simplified Chinese

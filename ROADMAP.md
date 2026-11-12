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

## Next

The build order from PLAN.md:

- Step 5, subscription URLs:
  - 5a, done (2026-11-12): the Rust fetcher and the URL box
  - 5b, done (2026-11-12): servers linked to the subscription when saving,
    chosen at save (Q28); other kinds of subscription (Q29)


6. Stash and Shadowrocket output
7. Advanced and Scratch modes:
   - Advanced, part 1, done (2026-11-12): every part on one page, the
     expert DNS settings (PLAN.md Q31)
   - Advanced, part 2, done (2026-11-12): TUN and sniffing; controller,
     dashboard and geo data
   - Scratch mode (Q23)
8. Send to phone
9. Updates, release script and release kit

Moved from step 4 to step 6: greying out the settings the chosen app can't
use (PLAN.md Q7). That needs each app's own format, which step 6 builds.

## Ideas

- The Linux app (after Windows)
- The website version (free hosting, its own fetcher)
- More languages, starting with Simplified Chinese

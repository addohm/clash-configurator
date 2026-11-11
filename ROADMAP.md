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
  (4b-3); review and save (4c). The Save dialog is untested until the
  owner's next build.

## Next

The build order from PLAN.md:


5. Subscription fetcher
6. Stash and Shadowrocket output
7. Advanced and Scratch modes
8. Send to phone
9. Updates, release script and release kit

Moved from step 4 to step 6: greying out the settings the chosen app can't
use (PLAN.md Q7). That needs each app's own format, which step 6 builds.

## Ideas

- Accept a list of share links (a Shadowrocket subscription) as the input,
  by turning it into a basic Clash config. Asked 2026-11-11, not decided;
  the link parser (`core/src/links/`) already reads them.
- The Linux app (after Windows)
- The website version (free hosting, its own fetcher)
- More languages, starting with Simplified Chinese

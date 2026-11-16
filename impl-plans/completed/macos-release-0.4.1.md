# macOS Release 0.4.1

**Status**: Completed (App Review pending)
**Date**: 2026-11-16

## Scope

- `--compare LEFT..RIGHT ...` pair list (2e2613d)
- Preview image-switch fix: local images no longer show as missing after a single click or a pair switch (d3408dc)
- Version bump 0.4.0 -> 0.4.1, App Store bundleVersion 9 (d14b240, tag v0.4.1)

## Evidence

- GitHub release v0.4.1: notarized `chilla_0.4.1_aarch64.dmg` (SHA-256 1dda10444c22b09958ceed55f9d79456b2af3337feb1c67a5ca13e92a2b9650a, `spctl`: Notarized Developer ID) and `chilla.app.zip`.
- Homebrew tap commit b14bcbf: `Casks/chilla.rb` 0.4.1, checksum verified against the published asset; `brew style`, `brew audit --strict --online` and `brew fetch` passed.
- App Store: package `chilla-0.4.1-macos-aarch64.pkg` validated and uploaded; build 9 processed VALID (uses_non_exempt_encryption=false). The 0.4.0 submission (build 8) was cancelled, the version record renamed to 0.4.1, build 9 attached, What's New updated, and the version resubmitted: WAITING_FOR_REVIEW.
- Verification before release: 547 vitest, 322+1 cargo, 67 bun tests, clippy -D warnings, biome, typecheck; GUI check of `--compare` with three pairs and single-click image switching in the file tree.

## Unresolved TODOs

- [ ] Confirm Apple approval and publication of 0.4.1

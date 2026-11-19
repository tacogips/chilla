# macOS Release 0.4.2

**Status**: Completed (App Review pending)
**Date**: 2026-11-20

## Scope

- In-app Markdown link navigation with Back/Forward history: toolbar arrows, Cmd/Ctrl+[ / ], Alt+Left/Right, mouse buttons 3/4; relative, encoded, same-file and cross-file anchor links; mailto/tel/http(s) open externally (896292d, 3e346f7)
- Vitest storage shim so the DOM suite passes on Node 25+ (3e346f7)
- Version bump 0.4.1 -> 0.4.2, App Store bundleVersion 10 (8603111, tag v0.4.2)

## Evidence

- GitHub release v0.4.2: notarized `chilla_0.4.2_aarch64.dmg` (SHA-256 33340a3453c937eecdd1d224d54fa399297bc3395c12cc78ebaaa5ae1e2851ac, stapled, `spctl`: Notarized Developer ID; mounted app reports 0.4.2) and `chilla.app.zip`.
- Homebrew tap commit e3ddfd1: `Casks/chilla.rb` 0.4.2, checksum verified against the public download; `brew style`, `brew audit --strict --online` and `brew fetch` passed. `brew upgrade --cask` to 0.4.2 and a terminal `chilla --version` launch passed Gatekeeper with no prompt.
- App Store: package `chilla-0.4.2-macos-aarch64.pkg` (sandbox, network client only, embedded profile, arm64) validated and uploaded; build 10 processed VALID. Version record 0.4.2 created (release after approval), build 10 attached, What's New set, submitted: WAITING_FOR_REVIEW.
- Verification before release: typecheck, biome, bun test (71), vitest DOM (571 on Node 22 and Node 26), clippy -D warnings, cargo nextest (328); WebKit E2E of the built frontend for link navigation and Back/Forward (24/24).

## Notes

- The 2026-11-20 "malware" prompt on 0.4.1 was a one-off Gatekeeper evaluation of a terminal launch that could not resolve the code identity; the published 0.4.1 artifact was notarized, stapled and accepted, and no XProtect rule matched it. Reinstalling and fresh quarantined first launches passed.
- The first public request for the DMG URL raced the asset upload and GitHub's CDN served a cached 404 for a few minutes; wait for the asset upload to finish before fetching.

## Unresolved TODOs

- [ ] Confirm Apple approval and publication of 0.4.2

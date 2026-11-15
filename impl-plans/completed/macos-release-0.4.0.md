# macOS 0.4.0 Release

**Status**: Completed
**Design Reference**: design-docs/specs/design-macos-dmg-release.md#mac-app-store-distribution
**Created**: 2026-11-15
**Last Updated**: 2026-11-15

## Scope

The user authorized a minor version bump to 0.4.0 and a public release (GitHub, Homebrew, Apple review submission) including the new logo and images. The release includes:

- pair view: `chilla <file_a> <file_b>` shows two files side by side with per-pane eye toggles
- a full-height left-edge strip that expands the folded left pane with the mouse
- the new document/viewer app icon, empty-state artwork, README and product-page images

Local Riela installation and cache files are excluded. The App Store build is 8. Existing Apple listing, legal/business metadata and the automatic release mode are preserved.

## Tasks

### TASK-001: Source publication
- [x] Synchronize versions (package.json, src-tauri/Cargo.toml, Cargo.lock, tauri.conf.json 0.4.0; App Store bundleVersion 8)
- [x] Commit source and push main and the v0.4.0 tag

### TASK-002: Public distribution
- [x] Sign, notarize and validate the app and DMG
- [x] Publish GitHub assets and verify the download checksum
- [x] Update, validate, commit and push the Homebrew cask

### TASK-003: Apple review submission
- [x] Build, sign, validate and upload the sandbox package
- [x] Verify processed build 8
- [x] Attach the build and validate the listing
- [x] Submit and verify the review state

## Progress log

### 2026-11-15

Pair view was implemented through the riela opus-terra workflow (2ddbeb0, 62ae183). The left-edge strip (5e5a03c) and branding (42efca2) were committed separately. Typecheck, biome, strict Clippy, bun test (67), vitest DOM (527) and cargo test (320 + 1) passed. The debug build was checked in the real app: folding the left pane, then clicking low on the left-edge strip, expands it with no leftover gutter. Apple 0.3.7 is READY_FOR_SALE, so 0.4.0 can be submitted.

### 2026-11-15: Publication

**Source**: origin/main had been reset to a single snapshot commit (`cf44590`) whose tree equals the previous local `4c575d3`; work was rebased onto it (old history kept locally on `backup/pre-snapshot-main`). Pushed main and tag `v0.4.0` at `dcc0cd5`.

**GitHub**: Notarization was Accepted for app and DMG. Stapling, strict signatures, Gatekeeper and the mounted-app checks passed. Published `chilla_0.4.0_aarch64.dmg` and `chilla.app.zip` with release notes. Downloaded DMG SHA-256: `04e3d720ee67813bf4bb7c6fd0969dd47efbd1f8534fa04f9983f36138f3983d`.

**Homebrew**: Cask style, strict online audit and fetch passed. Tap commit `29e1e5f` is pushed, and the remote version and checksum are verified.

**Product page**: Added an English/Japanese pair view section and replaced the browse screenshot that still showed the cat (`5f1ab8d`). `npm run check` passed; deployed `chilla-product` to chilla-viewer.com and verified the live pages serve the new assets.

**Apple package**: The App Store build reports 0.4.0, build 8, arm64, with the new icon. Effective entitlements are sandbox, user-selected read-write and network client, with no server entitlement. The altool validation and upload succeeded. The sandboxed runtime/Powerbox/media checks were not re-run for this release; the changes do not touch those paths (pair view is CLI-only, the strip is CSS).

**Apple review**: Build 8 processed VALID with encryption false. Version 0.4.0 was created with build 8 attached, release type AFTER_APPROVAL and copyright preserved. What's New was added. Desktop screenshots are now pair view, README with the new artwork (both fresh 2560x1600 window captures), git diff and video; the old cat README capture was removed. Submitted for review; Apple returned `WAITING_FOR_REVIEW`. Approval and automatic publication are external pending steps.

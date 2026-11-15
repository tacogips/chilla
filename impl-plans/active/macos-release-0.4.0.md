# macOS 0.4.0 Release

**Status**: In Progress
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
- [ ] Commit source and push main and the v0.4.0 tag

### TASK-002: Public distribution
- [ ] Sign, notarize and validate the app and DMG
- [ ] Publish GitHub assets and verify the download checksum
- [ ] Update, validate, commit and push the Homebrew cask

### TASK-003: Apple review submission
- [ ] Build, sign, validate and upload the sandbox package
- [ ] Verify processed build 8
- [ ] Attach the build and validate the listing
- [ ] Submit and verify the review state

## Progress log

### 2026-11-15

Pair view was implemented through the riela opus-terra workflow (2ddbeb0, 62ae183). The left-edge strip (5e5a03c) and branding (42efca2) were committed separately. Typecheck, biome, strict Clippy, bun test (67), vitest DOM (527) and cargo test (320 + 1) passed. The debug build was checked in the real app: folding the left pane, then clicking low on the left-edge strip, expands it with no leftover gutter. Apple 0.3.7 is READY_FOR_SALE, so 0.4.0 can be submitted.

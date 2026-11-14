# macOS 0.3.7 Release

**Status**: Completed
**Design Reference**: design-docs/specs/design-macos-dmg-release.md#mac-app-store-distribution
**Created**: 2026-11-04
**Last Updated**: 2026-11-05

## Scope

The user authorized commit, push, a patch version bump to 0.3.7, a GitHub/Homebrew public release, and Apple review submission. The release includes:

- inline pdf.js PDF rendering, so Chilla shortcuts work with a PDF open
- Ctrl/Cmd+wheel and pinch zoom anchored at the pointer, on every preview
- right/middle-drag pan with momentum fling
- the macOS contextmenu and selection guard
- the picker supersession fix

Local Riela installation and cache files are excluded. The App Store build is 7. Existing Apple listing, legal/business metadata, screenshots and the automatic release mode are preserved.

## Tasks

### TASK-001: Source publication
- [x] Synchronize versions (package.json, src-tauri/Cargo.toml, Cargo.lock, tauri.conf.json 0.3.7; App Store bundleVersion 7)
- [x] Commit source and push main and the v0.3.7 tag

### TASK-002: Public distribution
- [x] Sign, notarize and validate the app and DMG
- [x] Publish GitHub assets and verify the download checksum
- [x] Update, validate, commit and push the Homebrew cask

### TASK-003: Apple review submission
- [x] Build, sign, validate and upload the sandbox package
- [x] Verify processed build 7
- [x] Attach the build and validate the preserved listing
- [x] Submit and verify the review state

## Progress log

### 2026-11-04

Features were implemented through riela opus-terra workflow runs (commits 30f411a, 77c1236, 5b11391). Typecheck, biome, bun test (67) and vitest DOM (504) passed. The debug build GUI was checked in the real app:

- every listed shortcut on a PDF
- Ctrl+wheel zoom on PDF
- Alt+wheel scrolls instead of zooming
- right-drag pan and fling on PDF and Markdown text
- the Cmd+O dialog and q quit

Version is bumped to 0.3.7 and build 7.

### 2026-11-05: Publication

**Source**: Rebased onto remote `1130c5e` (eMudhra TLS trust refresh), so the release includes it. Pushed main and tag `v0.3.7` at `e8d22ec`. Strict Clippy passed after the rebase.

**GitHub**: Notarization was Accepted for both app and DMG. Stapling, strict signatures, Gatekeeper and the mounted-app checks passed. Published `chilla_0.3.7_aarch64.dmg` and `chilla.app.zip` with release notes. Downloaded DMG SHA-256: `59b089e779cc7dcfa0d4b67c5ef720659c623f78d977b80d594608f1cf22f495`.

**Homebrew**: Cask style, strict online audit and fetch passed. Tap commit `8b03913` is pushed, and the remote version and checksum are verified.

**Apple package**: The App Store build reports 0.3.7, build 7, arm64. Effective entitlements are sandbox, user-selected read-write and network client, with no server entitlement. An ad hoc sandboxed runtime copy opened a PDF through LaunchServices with no TCP listener, rendered all 25 pages, and supported Ctrl+wheel zoom and right-drag pan. The altool validation and upload succeeded.

**Apple review**: Build 7 processed VALID with encryption false. Version 0.3.7 was created with build 7 attached, release type AFTER_APPROVAL and copyright preserved. The en-US listing, 3 COMPLETE desktop screenshots and the review detail carried over, and What's New was added. Submitted for review; Apple returned `WAITING_FOR_REVIEW`. Approval and automatic publication are external pending steps.

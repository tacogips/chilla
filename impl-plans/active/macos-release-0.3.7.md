# macOS 0.3.7 Release

**Status**: In Progress
**Design Reference**: design-docs/specs/design-macos-dmg-release.md#mac-app-store-distribution
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

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
- [ ] Commit source and push main and the v0.3.7 tag

### TASK-002: Public distribution
- [ ] Sign, notarize and validate the app and DMG
- [ ] Publish GitHub assets and verify the download checksum
- [ ] Update, validate, commit and push the Homebrew cask

### TASK-003: Apple review submission
- [ ] Build, sign, validate and upload the sandbox package
- [ ] Verify processed build 7
- [ ] Attach the build and validate the preserved listing
- [ ] Submit and verify the review state

## Progress log

### 2026-11-04

Features were implemented through riela opus-terra workflow runs (commits 30f411a, 77c1236, 5b11391). Typecheck, biome, bun test (67) and vitest DOM (504) passed. The debug build GUI was checked in the real app:

- every listed shortcut on a PDF
- Ctrl+wheel zoom on PDF
- Alt+wheel scrolls instead of zooming
- right-drag pan and fling on PDF and Markdown text
- the Cmd+O dialog and q quit

Version is bumped to 0.3.7 and build 7.

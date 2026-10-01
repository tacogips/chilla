# macOS 0.3.5 Release

**Status**: In Progress
**Design Reference**: design-docs/specs/design-macos-dmg-release.md#mac-app-store-distribution
**Created**: 2026-10-01
**Last Updated**: 2026-10-01

## Scope

User authorized commit, push, patch bump, public release and Apple release.
Include current product source/docs; exclude local Riela installation/cache.
Version 0.3.5, App Store build 5. Preserve existing owner-controlled Apple
metadata, legal/compliance answers, territories, pricing and release mode.

## Tasks

### TASK-001: Version And Source Publication
**Status**: In Progress
- [x] Synchronize frontend/Tauri/Cargo version and App Store build number
- [x] Verify combined product changes and complete formatting/syntax visual check
- [ ] Commit source, push main and version tag

### TASK-002: Public macOS And Homebrew Release
**Status**: Pending
- [ ] Sign/notarize and validate app/DMG and mounted artifact
- [ ] Publish and verify GitHub assets
- [ ] Verify downloaded checksum and update/validate/push Homebrew cask

### TASK-003: Apple Release
**Status**: Pending
- [ ] Build/sign/validate/upload fresh sandbox package without server entitlement
- [ ] Verify processed build and native selected-file playback
- [ ] Replace pending 0.3.4 candidate with 0.3.5 while preserving listing metadata
- [ ] Attach build, validate submission and submit for review
- [ ] Record actual Apple state and release evidence

## Progress Log

### 2026-10-01
Prepared 0.3.5/build 5. Live Apple 0.3.4/build 4 is WAITING_FOR_REVIEW;
replace that pending candidate only when new release package is ready.
Current media protocol/native normal+sandbox verification is complete;
combined product release verification is running.

Full verification passed; native visual formatting, relative HTML resources and
Nix syntax colors confirmed. Structured formatting implementation plan archived.

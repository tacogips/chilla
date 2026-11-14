# macOS 0.3.6 Release

**Status**: In Progress
**Design Reference**: design-docs/specs/design-macos-dmg-release.md#mac-app-store-distribution
**Created**: 2026-10-06
**Last Updated**: 2026-10-06

## Scope

User authorized commit, push, 0.3.6 Homebrew/public release and Apple review submission. Include macOS LaunchServices file opening and associated documentation. Exclude local Riela installation/cache. App Store build 6. Preserve existing Apple listing, legal/business metadata, screenshots and automatic release mode.

## Tasks

### TASK-001: Source publication
- [ ] Synchronize versions and commit source
- [ ] Push main and v0.3.6 tag

### TASK-002: Public distribution
- [ ] Sign/notarize/validate app and DMG
- [ ] Publish GitHub assets and verify download checksum
- [ ] Update/validate/commit/push Homebrew cask

### TASK-003: Apple review submission
- [ ] Build/sign/validate/upload sandbox package
- [ ] Verify processed build 6
- [ ] Replace pending 0.3.5 only after new package is ready
- [ ] Attach build and validate preserved listing
- [ ] Submit and verify review state

## Progress log

### 2026-10-06

Version 0.3.5/build 5 remains WAITING_FOR_REVIEW. New file-open feature passed independent design/code review, strict Cargo/Bun checks, and cold/warm LaunchServices runtime log checks. Computer Use native pipe unavailable, so visible rendering could not be checked. Media playback/seek/sandbox behavior was verified in 0.3.5 and its implementation is unchanged. Preparing 0.3.6/build 6.

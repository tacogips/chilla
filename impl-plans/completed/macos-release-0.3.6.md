# macOS 0.3.6 Release

**Status**: Completed
**Design Reference**: design-docs/specs/design-macos-dmg-release.md#mac-app-store-distribution
**Created**: 2026-10-06
**Last Updated**: 2026-10-06

## Scope

User authorized commit, push, 0.3.6 Homebrew/public release and Apple review submission. Include macOS LaunchServices file opening and associated documentation. Exclude local Riela installation/cache. App Store build 6. Preserve existing Apple listing, legal/business metadata, screenshots and automatic release mode.

## Tasks

### TASK-001: Source publication
- [x] Synchronize versions and commit source
- [x] Push main and v0.3.6 tag

### TASK-002: Public distribution
- [x] Sign/notarize/validate app and DMG
- [x] Publish GitHub assets and verify download checksum
- [x] Update/validate/commit/push Homebrew cask

### TASK-003: Apple review submission
- [x] Build/sign/validate/upload sandbox package
- [x] Verify processed build 6
- [x] Replace pending 0.3.5 only after new package is ready
- [x] Attach build and validate preserved listing
- [x] Submit and verify review state

## Progress log

### 2026-10-06

Version 0.3.5/build 5 remains WAITING_FOR_REVIEW. New file-open feature passed independent design/code review, strict Cargo/Bun checks, and cold/warm LaunchServices runtime log checks. Computer Use native pipe unavailable, so visible rendering could not be checked. Media playback/seek/sandbox behavior was verified in 0.3.5 and its implementation is unchanged. Preparing 0.3.6/build 6.

### Source and public distribution

Source commit `440d902` and tag `v0.3.6` pushed. GitHub release assets `chilla_0.3.6_aarch64.dmg` and `chilla.app.zip` published. App and DMG notarization Accepted; strict signatures, staples, Gatekeeper, and mounted app checks passed. Downloaded DMG SHA-256: `af59d980e23fed020eb2200db984803f028488fa2be8ad5c908cada6b79d1b83`. Homebrew cask style, strict online audit and fetch passed; tap commit `c3c4691` pushed and remote checksum/version verified.

Fresh sandbox package built and signed; signature/profile/version/entitlement validation passed, with server entitlement absent. Package SHA-256: `02a6049b49b3f7f5cc8839b3c6aa9cb16c328fb245424d78241842ac88405544`. Native sandbox QA using a release-executable copy confirmed cold PNG and warm Unicode/spaces preview commands succeeded; no TCP listener. Logs protected under `/tmp/chilla-release-0.3.6/`. Computer Use remains unavailable. Apple upload validation and processing are in progress.

### Apple processing and fixture maintenance

Apple archive validation and upload succeeded without errors. Build 6 processed VALID, not expired, with encryption declaration false. Canceled pending 0.3.5 review only after verifying new build readiness. Existing frontend verification fixtures were updated to preserve exact-path expectations and mock the native request queue/listener; independent typecheck/format checks passed. No new tests were added or run, and this fixture-only follow-up does not change shipped runtime code or assets.

### Final Apple review submission

Renamed the editable pending candidate to 0.3.6 after canceling the earlier waiting review, preserving listing metadata, review contact, three COMPLETE screenshots, copyright, existing compliance/business settings and AFTER_APPROVAL release mode. Attached processed VALID build 6, validated listing/build/screenshot/contact gates through the macOS API and submitted a new review request. Apple returned WAITING_FOR_REVIEW. Apple approval and storefront publication remain external pending steps.

Source/tag, signed public distribution, Homebrew cask publication and Apple review submission are complete. Follow-up fixture/documentation commit updates existing test mocks/expectations without changing shipped code. Local typecheck/format/Cargo check/strict Clippy passed; no tests were added or run. GitHub CI and unsigned validation builds were still running during finalization. Temporary QA processes stopped and credentials/profiles remain outside Git.

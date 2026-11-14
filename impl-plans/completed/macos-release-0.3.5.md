# macOS 0.3.5 Release

**Status**: Completed
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
**Status**: Completed
- [x] Synchronize frontend/Tauri/Cargo version and App Store build number
- [x] Verify combined product changes and complete formatting/syntax visual check
- [x] Commit source, push main and version tag

### TASK-002: Public macOS And Homebrew Release
**Status**: Completed
- [x] Sign/notarize and validate app/DMG and mounted artifact
- [x] Publish and verify GitHub assets
- [x] Verify downloaded checksum and update/validate/push Homebrew cask

### TASK-003: Apple Release
**Status**: Completed
- [x] Build/sign/validate/upload fresh sandbox package without server entitlement
- [x] Verify processed build and native selected-file playback
- [x] Replace pending 0.3.4 candidate with 0.3.5 while preserving listing metadata
- [x] Attach build, validate submission and submit for review
- [x] Record actual Apple state and release evidence

## Progress Log

### 2026-10-01
Prepared 0.3.5/build 5. Live Apple 0.3.4/build 4 is WAITING_FOR_REVIEW;
replace that pending candidate only when new release package is ready.
Current media protocol/native normal+sandbox verification is complete;
combined product release verification is running.

Full verification passed; native visual formatting, relative HTML resources and
Nix syntax colors confirmed. Structured formatting implementation plan archived.

### Source, Public Distribution And Apple Upload

Source commit `b8a5547` and tag `v0.3.5` pushed. User explicitly confirmed all
current product changes. Public Developer ID app notarization Accepted; final
DMG notarized/stapled and app/DMG/mounted app passed strict signing and Gatekeeper.
GitHub release publishes `chilla_0.3.5_aarch64.dmg` and `chilla.app.zip`.
Downloaded DMG SHA-256: `6396dcc871b1e98ce40db67cabdfb1579f50f2f0795dca0be1fc761de295a2bc`.
Homebrew cask style/strict online audit/fetch passed; remote version/checksum
verified. Tap commit `52c30a0` pushed after integrating concurrent API metadata.

Fresh Apple 0.3.5/build 5 app and installer signatures/profile/version/entitlements
validated and altool validation/upload succeeded. Package SHA-256:
`db6745fd7d03b313f6b085b167ad0050a9023719fc31155f16ba3b046496df12`.
An ad hoc runtime copy of the release executable retained sandbox/user-selected
read-write/client entitlements without server permission. Powerbox selected the
7.9 MB MP4; Space pause/resume, Ctrl-D 4→19/Ctrl-U 19→4, seek 2:04/resume and
new-token refresh/playback passed. The live process has no TCP listener.
Evidence is protected outside Git under `/tmp/chilla-release-0.3.5/`. Apple
processing/build attachment/review submission remain pending.

### Final Apple Submission

Apple processed build 5 as VALID with no outstanding encryption declaration.
Canceled the pending 0.3.4 review only after the fresh package and runtime
verification were ready. Renamed the editable candidate to 0.3.5, preserving
three COMPLETE desktop screenshots, listing/support URL, review contact,
copyright and owner-controlled compliance/business settings. The first release
does not permit a whatsNew field; retained listing and updated review notes.
Attached build 5, validated metadata, created the review submission and submitted.
Final API observation: version 0.3.5/build 5 and review submission both
WAITING_FOR_REVIEW. Release mode remains AFTER_APPROVAL. Publication on Apple
now depends on review approval; no further local submission action remains.

All requested commit/push/public-release/Homebrew/Apple-submission steps are
complete. Local Riela installation/cache remains untracked. GitHub CI and unsigned
macOS validation were still running when this release record was finalized;
the full local mixed-stack verification and signed distribution checks passed.
Temporary QA processes stopped; credential/profile material was not committed.

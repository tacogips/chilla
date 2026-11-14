# macOS Mounted DMG Trust Gate Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/design-macos-dmg-release.md#mounted-artifact-trust-gate`
**Created**: 2026-09-08
**Last Updated**: 2026-09-09

## Design Document Reference

Validate the application bundle as delivered inside the final signed and
notarized DMG before publishing it, then issue release v0.2.0 and update
the custom Homebrew cask to that verified artifact.

Included: local release-script trust checks, coordinated patch-version metadata,
release documentation, signed/notarized asset publication, and cask verification.

Excluded: application runtime changes, Intel support, and submission to the
official Homebrew cask repository.

## Modules

### TASK-001: Mounted DMG Validation

**Status**: Completed
**Parallelizable**: No
**Deliverable**: `scripts/release-macos-dmg-local.sh`

**Required command contract**:

```text
scripts/release-macos-dmg-local.sh v<version>
```

**Completion Criteria**:

- [x] Mount the final DMG read-only at an isolated mount point
- [x] Validate the mounted app with codesign, stapler, and Gatekeeper
- [x] Detach the mounted image on success and failure
- [x] Upload assets only after the mounted artifact passes

### TASK-002: Patch Version And Documentation

**Status**: Completed
**Parallelizable**: No (depends on TASK-001)
**Deliverables**: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `Cargo.lock`, `README.md`

**Completion Criteria**:

- [x] Align all application version metadata at 0.2.0
- [x] Update the documented local release command to v0.2.0
- [x] Document mounted-DMG validation in the release guidance

### TASK-003: Release And Cask Verification

**Status**: Completed
**Parallelizable**: No (depends on TASK-002)
**Deliverables**: Git tag/release `v0.2.0`, `tacogips/homebrew-tap/Casks/chilla.rb`

**Completion Criteria**:

- [x] Build, sign, notarize, and publish v0.2.0 assets
- [x] Confirm the published DMG checksum
- [x] Update the custom cask version, URL, and checksum
- [x] Install through the cask and confirm Gatekeeper acceptance

## Module Status

| Module | File Path | Status | Tests |
| --- | --- | --- | --- |
| Mounted DMG validation | `scripts/release-macos-dmg-local.sh` | COMPLETED | Signed release run passed |
| Version and docs | Version manifests and `README.md` | COMPLETED | Full mise verification passed |
| Release and cask | GitHub release and tap | COMPLETED | Install and Gatekeeper passed |

## Dependencies

| Feature | Depends On | Status |
| --- | --- | --- |
| Patch metadata | Mounted DMG validation | COMPLETED |
| Signed release | Patch metadata and pushed tag | COMPLETED |
| Cask update | Published signed DMG | COMPLETED |

## Completion Criteria

- [x] Release automation rejects a DMG whose embedded app fails trust checks
- [x] Repository version metadata is 0.2.0
- [x] Repository verification passes
- [x] v0.2.0 is signed, notarized, and published
- [x] The custom Homebrew cask installs v0.2.0 successfully
- [x] The installed app passes strict signature and Gatekeeper assessment

## Progress Log

### Session: 2026-09-08

**Tasks Completed**: Diagnosed the reported failure and confirmed the published
v0.1.18 DMG itself is signed, stapled, and Gatekeeper-accepted while the locally
installed v0.1.17 app is rejected.

**Tasks In Progress**: TASK-001.

**Blockers**: None.

**Notes**: The packaged Riela implementation workflow was stopped after its
manager recursively launched the same workflow. The repository remained clean;
the required design, plan, implementation, and review gates continue manually.

### Session: 2026-09-09

**Tasks Completed**: Implemented the mounted-image trust gate; aligned and fully
verified v0.2.0; published signed, notarized, and stapled GitHub assets; updated
the custom tap; installed the cask; and verified the installed app with strict
code signing, stapler, and Gatekeeper checks.

**Tasks In Progress**: None.

**Blockers**: None.

**Notes**: Published DMG SHA-256 is
`585c4f571f37159a392213d11a5dfe16a4d4f5ce7f83a509323c0b8a76f49eb3`.

# macOS Mounted DMG Trust Gate Implementation Plan

**Status**: Ready
**Design Reference**: `design-docs/specs/design-macos-dmg-release.md#mounted-artifact-trust-gate`
**Created**: 2026-09-08
**Last Updated**: 2026-09-08

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

**Status**: Not Started
**Parallelizable**: No
**Deliverable**: `scripts/release-macos-dmg-local.sh`

**Required command contract**:

```text
scripts/release-macos-dmg-local.sh v<version>
```

**Completion Criteria**:

- [ ] Mount the final DMG read-only at an isolated mount point
- [ ] Validate the mounted app with codesign, stapler, and Gatekeeper
- [ ] Detach the mounted image on success and failure
- [ ] Upload assets only after the mounted artifact passes

### TASK-002: Patch Version And Documentation

**Status**: Not Started
**Parallelizable**: No (depends on TASK-001)
**Deliverables**: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `Cargo.lock`, `README.md`

**Completion Criteria**:

- [x] Align all application version metadata at 0.2.0
- [x] Update the documented local release command to v0.2.0
- [ ] Document mounted-DMG validation in the release guidance

### TASK-003: Release And Cask Verification

**Status**: Not Started
**Parallelizable**: No (depends on TASK-002)
**Deliverables**: Git tag/release `v0.2.0`, `tacogips/homebrew-tap/Casks/chilla.rb`

**Completion Criteria**:

- [ ] Build, sign, notarize, and publish v0.2.0 assets
- [ ] Confirm the published DMG checksum
- [ ] Update the custom cask version, URL, and checksum
- [ ] Install through the cask and confirm Gatekeeper acceptance

## Module Status

| Module | File Path | Status | Tests |
| --- | --- | --- | --- |
| Mounted DMG validation | `scripts/release-macos-dmg-local.sh` | NOT_STARTED | Shell syntax and release run |
| Version and docs | Version manifests and `README.md` | NOT_STARTED | Version consistency checks |
| Release and cask | GitHub release and tap | NOT_STARTED | Download, cask install, Gatekeeper |

## Dependencies

| Feature | Depends On | Status |
| --- | --- | --- |
| Patch metadata | Mounted DMG validation | BLOCKED |
| Signed release | Patch metadata and pushed tag | BLOCKED |
| Cask update | Published signed DMG | BLOCKED |

## Completion Criteria

- [ ] Release automation rejects a DMG whose embedded app fails trust checks
- [x] Repository version metadata is 0.2.0
- [ ] Repository verification passes
- [ ] v0.2.0 is signed, notarized, and published
- [ ] The custom Homebrew cask installs v0.2.0 successfully
- [ ] The installed app passes strict signature and Gatekeeper assessment

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

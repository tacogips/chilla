# macOS DMG Local Signing Release Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/design-macos-dmg-release.md#signing-and-notarization`
**Created**: 2026-05-21
**Last Updated**: 2026-05-21

---

## Design Document Reference

**Source**: `design-docs/specs/design-macos-dmg-release.md`

### Summary
Switch macOS DMG signing to a local release-machine workflow so Homebrew cask consumers receive a signed and notarized Chilla artifact without storing Apple certificate material in GitHub Actions secrets.

### Scope
**Included**: Local signing release script, Taskfile entrypoint, GitHub Actions validation-only workflow, README guidance, implementation-plan progress tracking.
**Excluded**: Apple Developer account provisioning, secret creation, changing Homebrew tap SHA values before a new release artifact exists.

---

## Modules

### 1. Local Release Script

#### `scripts/release-macos-dmg-local.sh`

**Status**: COMPLETED

```bash
scripts/release-macos-dmg-local.sh v<version>
```

**Checklist**:
- [x] Require local macOS host
- [x] Require Apple notarization environment from the local password-manager workflow
- [x] Use the Developer ID certificate installed in the local keychain
- [x] Build, validate, zip, and upload release assets after notarization checks

### 2. macOS Validation Workflow

#### `.github/workflows/release-macos-dmg.yml`

**Status**: COMPLETED

```yaml
jobs:
  build-macos-dmg:
    steps:
      - uses: tauri-apps/tauri-action
      - run: verify unsigned .app/.dmg validation outputs exist
```

**Checklist**:
- [x] Remove Apple certificate/notarization secrets from GitHub Actions
- [x] Keep unsigned workflow builds available for validation
- [x] Avoid publishing unsigned GitHub release assets from CI

### 3. Release Documentation

#### `README.md`

**Status**: COMPLETED

**Checklist**:
- [x] State that Apple certificate material remains local
- [x] Document the local release task and required local environment
- [x] Clarify that Homebrew cask trust comes from the published DMG artifact

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Local release script | `scripts/release-macos-dmg-local.sh` | COMPLETED | Shell review |
| Release task | `Taskfile.yml` | COMPLETED | Manual review |
| Validation workflow | `.github/workflows/release-macos-dmg.yml` | COMPLETED | `actionlint` |
| Release documentation | `README.md` | COMPLETED | Manual review |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Local signing release | Existing macOS DMG release config | Available |
| Homebrew cask update | New signed/notarized GitHub release artifact | Blocked until release |

## Completion Criteria

- [x] Apple certificate material is not required in GitHub Actions
- [x] Local macOS release task signs, notarizes, validates, and uploads trusted assets
- [x] GitHub Actions do not publish unsigned DMG release assets
- [x] Workflow keeps pinned actions and minimal permissions
- [x] README accurately describes the cask signing path

## Progress Log

### Session: 2026-05-21 14:54 JST
**Tasks Completed**: Created follow-up implementation plan for macOS DMG signing enforcement.
**Tasks In Progress**: Updating release workflow and README.
**Blockers**: Apple Developer signing/notarization secrets are not available locally, so notarization can only be validated in GitHub Actions after secrets are configured.
**Notes**: This is a follow-up to `impl-plans/completed/macos-dmg-release.md`.

### Session: 2026-05-21 15:02 JST
**Tasks Completed**: Enforced complete Apple signing/notarization secrets for tag releases, kept unsigned manual validation builds, added signed artifact validation before release upload, updated README, and verified the workflow with `actionlint`.
**Tasks In Progress**: None.
**Blockers**: Superseded by the local-signing decision below.
**Notes**: This intermediate GitHub-secret signing model was replaced before commit.

### Session: 2026-05-21 15:19 JST
**Tasks Completed**: Replaced the GitHub-secret signing model with local signing and notarization. Added `scripts/release-macos-dmg-local.sh`, added `task release-macos-dmg-local`, reduced GitHub Actions to unsigned validation artifacts, and updated docs.
**Tasks In Progress**: None.
**Blockers**: Publishing a trusted Homebrew cask still requires running the local release task with Apple notarization credentials available from the local password-manager workflow, then updating the tap SHA/caveat after the artifact exists.
**Notes**: GitHub Actions no longer need Apple certificate material or notarization secrets.

## Related Plans

- **Previous**: `impl-plans/completed/macos-dmg-release.md`
- **Next**: Homebrew tap SHA/caveat update after a signed release is published
- **Depends On**: `impl-plans/completed/macos-dmg-release.md`

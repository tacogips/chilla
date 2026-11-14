# macOS DMG Release Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/design-macos-dmg-release.md`
**Created**: 2026-04-09
**Last Updated**: 2026-05-01

## Design Document Reference

**Source**: `design-docs/specs/design-macos-dmg-release.md`

### Summary

Add the first repository-local macOS bundle flow for `chilla` so the project can build `.app` and `.dmg` artifacts through Tauri and prepare for Apple signing/notarization.

### Scope

**Included**: Tauri macOS release override config, Taskfile support, secure GitHub Actions workflow, release/install documentation updates.
**Excluded**: `homebrew-tap` migration, Apple certificate provisioning, changing the current tarball-based installer contract.

## Modules

### 1. macOS Bundle Config

#### `src-tauri/tauri.macos.release.conf.json`

**Status**: COMPLETED

```json
{
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "macOS": {
      "minimumSystemVersion": "12.0"
    }
  }
}
```

### 2. Local Release Tasks

#### `Taskfile.yml`

**Status**: COMPLETED

`bundle-macos-dmg` runs `bun run build` then `CARGO_TERM_QUIET=true bun run tauri build --config src-tauri/tauri.macos.release.conf.json --bundles app,dmg`.

### 3. GitHub Release Workflow

#### `.github/workflows/release-macos-dmg.yml`

**Status**: COMPLETED

Runs on `workflow_dispatch` and `push` tags `v*`; pinned action SHAs; optional Apple certificate import; `tauri-apps/tauri-action` with `--bundles app,dmg`; uploads release assets on tags and workflow artifacts on manual runs.

### 4. Release Documentation

#### `README.md`
#### `release/README.md`
#### `install.sh`

**Status**: COMPLETED

Tarball installer scope vs DMG bundle path documented; Apple secret list in README.

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| macOS bundle config | `src-tauri/tauri.macos.release.conf.json` | COMPLETED | Tauri build (macOS) |
| local bundle task | `Taskfile.yml` | COMPLETED | `task bundle-macos-dmg` |
| release workflow | `.github/workflows/release-macos-dmg.yml` | COMPLETED | Review / CI |
| docs | `README.md`, `release/README.md`, `install.sh` | COMPLETED | Manual review |

## Implementation Tasks

### TASK-001: macOS Bundle Config
**Status**: COMPLETED
**Parallelizable**: No
**Deliverables**: `src-tauri/tauri.macos.release.conf.json`, `Taskfile.yml`

**Completion Criteria**:
- [x] dedicated macOS release config enables `app,dmg`
- [x] local task invokes Tauri DMG build through that config

### TASK-002: Secure Release Workflow
**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: `TASK-001`
**Deliverables**: `.github/workflows/release-macos-dmg.yml`

**Completion Criteria**:
- [x] workflow uses pinned action SHAs
- [x] workflow supports optional Apple signing/notarization secrets
- [x] tag builds upload release assets
- [x] manual builds upload workflow artifacts

### TASK-003: Documentation Alignment
**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: `TASK-001`, `TASK-002`
**Deliverables**: `README.md`, `release/README.md`, `install.sh`, `impl-plans/README.md`

**Completion Criteria**:
- [x] docs distinguish tarball vs DMG release paths
- [x] docs list Apple signing/notarization inputs
- [x] active plan index references this plan (archived row in README completed table after closure)

### TASK-004: Verification
**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: `TASK-003`
**Deliverables**: verification log updates

**Completion Criteria**:
- [x] `bun run typecheck` passes
- [x] `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml` passes
- [x] full macOS DMG bundle requires a macOS host; config and workflow are validated in-repo (see `.claude/skills/macos-release-build/SKILL.md`)

## Completion Criteria

- [x] `chilla` repository contains a macOS DMG-capable Tauri config
- [x] `chilla` repository contains a secure macOS release workflow
- [x] repository docs describe the new macOS release path accurately

## Progress Log

### Session: 2026-04-09 17:21 JST
**Tasks Completed**: Created design document and implementation plan for macOS DMG release support
**Tasks In Progress**: TASK-001 macOS bundle config
**Blockers**: Apple signing/notarization secrets are not available in the local workspace, so CI notarization cannot be proven end-to-end in this session
**Notes**: The implementation keeps the existing Nix tarball contract intact while adding a separate Tauri bundle path for direct macOS distribution.

### Session: 2026-05-01
**Tasks Completed**: TASK-001 through TASK-004 (implementation was already present; plan status synced with repo; verification run on Linux: typecheck + cargo check).
**Notes**: DMG/binary smoke build remains macOS-only; `task bundle-macos-dmg` is the canonical local entrypoint.

## Related Plans

- **Previous**: None
- **Next**: None
- **Depends On**: None

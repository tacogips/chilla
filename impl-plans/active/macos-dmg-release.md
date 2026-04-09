# macOS DMG Release Implementation Plan

**Status**: In Progress
**Design Reference**: `design-docs/specs/design-macos-dmg-release.md`
**Created**: 2026-04-09
**Last Updated**: 2026-04-09

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

**Status**: NOT_STARTED

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

**Status**: NOT_STARTED

```yaml
tasks:
  bundle-macos-dmg:
    cmds:
      - CARGO_TERM_QUIET=true bun run tauri build --config src-tauri/tauri.macos.release.conf.json --bundles app,dmg
```

### 3. GitHub Release Workflow

#### `.github/workflows/release-macos-dmg.yml`

**Status**: NOT_STARTED

```yaml
on:
  workflow_dispatch:
  push:
    tags:
      - "v*"
```

### 4. Release Documentation

#### `README.md`
#### `release/README.md`
#### `install.sh`

**Status**: NOT_STARTED

```bash
./install.sh v0.1.3
task bundle-macos-dmg
```

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| macOS bundle config | `src-tauri/tauri.macos.release.conf.json` | NOT_STARTED | Tauri build |
| local bundle task | `Taskfile.yml` | NOT_STARTED | Task smoke check |
| release workflow | `.github/workflows/release-macos-dmg.yml` | NOT_STARTED | Workflow lint by review + local file validation |
| docs | `README.md`, `release/README.md`, `install.sh` | NOT_STARTED | Manual review |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| local bundle task | macOS bundle config | BLOCKED |
| release workflow | macOS bundle config | BLOCKED |
| docs refresh | config + workflow decisions | BLOCKED |

## Implementation Tasks

### TASK-001: macOS Bundle Config
**Status**: IN_PROGRESS
**Parallelizable**: No
**Deliverables**: `src-tauri/tauri.macos.release.conf.json`, `Taskfile.yml`

**Completion Criteria**:
- [ ] dedicated macOS release config enables `app,dmg`
- [ ] local task invokes Tauri DMG build through that config

### TASK-002: Secure Release Workflow
**Status**: NOT_STARTED
**Parallelizable**: No
**Depends On**: `TASK-001`
**Deliverables**: `.github/workflows/release-macos-dmg.yml`

**Completion Criteria**:
- [ ] workflow uses pinned action SHAs
- [ ] workflow supports optional Apple signing/notarization secrets
- [ ] tag builds upload release assets
- [ ] manual builds upload workflow artifacts

### TASK-003: Documentation Alignment
**Status**: NOT_STARTED
**Parallelizable**: No
**Depends On**: `TASK-001`, `TASK-002`
**Deliverables**: `README.md`, `release/README.md`, `install.sh`, `impl-plans/README.md`

**Completion Criteria**:
- [ ] docs distinguish tarball vs DMG release paths
- [ ] docs list Apple signing/notarization inputs
- [ ] active plan index references this plan

### TASK-004: Verification
**Status**: NOT_STARTED
**Parallelizable**: No
**Depends On**: `TASK-003`
**Deliverables**: verification log updates

**Completion Criteria**:
- [ ] `bun run typecheck` passes
- [ ] `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml` passes
- [ ] `bun run tauri build --config src-tauri/tauri.macos.release.conf.json --bundles app,dmg` is at least syntax-validated or documented as blocked by missing signing/runtime prerequisites

## Completion Criteria

- [ ] `chilla` repository contains a macOS DMG-capable Tauri config
- [ ] `chilla` repository contains a secure macOS release workflow
- [ ] repository docs describe the new macOS release path accurately

## Progress Log

### Session: 2026-04-09 17:21 JST
**Tasks Completed**: Created design document and implementation plan for macOS DMG release support
**Tasks In Progress**: TASK-001 macOS bundle config
**Blockers**: Apple signing/notarization secrets are not available in the local workspace, so CI notarization cannot be proven end-to-end in this session
**Notes**: The implementation keeps the existing Nix tarball contract intact while adding a separate Tauri bundle path for direct macOS distribution.

## Related Plans

- **Previous**: None
- **Next**: None
- **Depends On**: None

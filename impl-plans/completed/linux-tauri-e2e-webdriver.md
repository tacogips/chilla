# Linux Tauri WebDriver E2E Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/notes.md#linux-tauri-webdriver-e2e-notes
**Created**: 2026-03-24
**Last Updated**: 2026-03-24

---

## Design Document Reference

**Source**: design-docs/specs/notes.md#linux-tauri-webdriver-e2e-notes

### Summary
Add a Linux-only desktop E2E path that uses `tauri-driver` and `WebKitWebDriver` against the real Tauri app, expose it through Bun and Task targets, and document the workflow in `.agents` skills.

### Scope
**Included**: Linux E2E runner, smoke coverage, Bun/Task entrypoints, Nix shell support, README updates, and `.agents` skill guidance.
**Excluded**: macOS/Windows desktop E2E, CI workflow authoring, and non-Linux native driver support.

---

## Modules

### 1. Linux Tauri E2E Harness

#### scripts/run-tauri-e2e-linux.sh

**Status**: COMPLETED

```text
run-tauri-e2e-linux.sh
- validate Linux runtime prerequisites
- build debug Tauri binary with `bun run tauri build --debug --no-bundle`
- provide DISPLAY or Xvfb fallback
- execute the smoke test entrypoint
```

**Checklist**:
- [x] Validate `tauri-driver`
- [x] Validate `WebKitWebDriver`
- [x] Support `DISPLAY` and `Xvfb`
- [x] Invoke the smoke test entrypoint

#### tests/tauri/tauri-smoke.e2e.ts

**Status**: COMPLETED

```text
tauri-smoke.e2e.ts
- start tauri-driver
- connect Selenium to the real Tauri app
- verify workspace boot and README preview
- clean up the driver process and session
```

**Checklist**:
- [x] Start tauri-driver with Linux native driver settings
- [x] Create the WebDriver session
- [x] Cover a real desktop smoke flow
- [x] Shut down cleanly on success and failure

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Linux runner | `scripts/run-tauri-e2e-linux.sh` | COMPLETED | `bun run test:tauri:e2e:linux` |
| Smoke test | `tests/tauri/tauri-smoke.e2e.ts` | COMPLETED | Linux desktop smoke |
| Tooling entrypoints | `package.json`, `Taskfile.yml`, `flake.nix` | COMPLETED | manual |
| Documentation | `README.md`, `.agents/skills/*`, `design-docs/specs/notes.md` | COMPLETED | review |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Linux desktop smoke test | `tauri-driver`, `WebKitWebDriver`, built debug app | AVAILABLE |
| Shell fallback | `DISPLAY` or `Xvfb` | AVAILABLE |
| Skill updates | Harness command names | COMPLETED |

## Completion Criteria

- [x] Linux Tauri E2E command exists and passes locally
- [x] Bun and Task entrypoints are documented
- [x] Nix dev shell exposes Linux display tooling for headless runs
- [x] `.agents` skills describe when to use browser-only vs desktop-runtime verification
- [x] README documents the Linux E2E flow

## Progress Log

### Session: 2026-03-24 15:00
**Tasks Completed**: Reviewed current browser tests, Tauri config, Linux runtime packages, and upstream `tauri-driver` examples/docs.
**Tasks In Progress**: Implementing the Linux E2E runner and smoke test, then updating repo/skill documentation.
**Blockers**: None.
**Notes**: The repo already exposes `WebKitWebDriver` in the current Nix shell, but `tauri-driver` had to be installed separately.

### Session: 2026-03-24 15:45
**Tasks Completed**: Added the Linux runner, the `tauri-driver` smoke test, Bun/Task/Nix entrypoints, README/design references, and `.agents` skill guidance. Verified `bun run typecheck`, `bun run test`, `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml`, and `bun run test:tauri:e2e:linux`.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: The smoke test launches the real Tauri app, confirms the workspace path, filters to `README.md`, and verifies the rendered Markdown preview under Linux.

## Related Plans

- **Previous**: -
- **Next**: -
- **Depends On**: -

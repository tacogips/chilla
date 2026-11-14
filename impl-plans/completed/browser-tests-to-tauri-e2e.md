# Browser Tests to Tauri E2E Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/notes.md#browser-test-migration-to-tauri-e2e-notes
**Created**: 2026-03-24
**Last Updated**: 2026-03-24

---

## Design Document Reference

**Source**: design-docs/specs/notes.md#browser-test-migration-to-tauri-e2e-notes

### Summary

Replace the repository's automated browser-mode tests with a deterministic Linux desktop Tauri-driver suite that covers the same functional assertions against the real runtime.

### Scope

**Included**: Tauri-driver test expansion, temporary fixture workspace generation, removal of browser test files/config/scripts, dependency cleanup, and verification updates.
**Excluded**: New Windows/macOS desktop E2E support, new browser-mode automation, and CI workflow changes.

---

## Modules

### 1. Desktop E2E Suite

#### tests/tauri/tauri-smoke.e2e.ts

**Status**: COMPLETED

```text
tauri-smoke.e2e.ts
- create a deterministic temporary workspace fixture
- launch the real app against that workspace via a wrapper script
- verify file tree rendering, lazy loading, filter focus, server-side filtering,
  and dark Markdown preview styling in the real Tauri runtime
- clean up WebDriver, tauri-driver, and temporary fixture resources
```

**Checklist**:

- [x] Temporary fixture workspace generation
- [x] App launcher wrapper for startup path injection
- [x] Desktop assertions for workspace/file-tree flow
- [x] Desktop assertions for README dark preview styling
- [x] Cleanup on success and failure

### 2. Browser Suite Removal

#### package.json, vitest.browser.config.ts, tests/browser/\*.browser.tsx, bun.lock, bun.nix

**Status**: COMPLETED

```text
browser suite removal
- delete browser-only Vitest config and tests
- remove browser test script and browser-only dependencies
- keep Bun and Nix dependency metadata aligned with the new graph
```

**Checklist**:

- [x] Remove `test:browser`
- [x] Remove browser-only packages
- [x] Delete browser test files and config
- [x] Verify frozen Bun install and Nix dependency fetch path

---

## Module Status

| Module                | File Path                                                                            | Status      | Tests                                                           |
| --------------------- | ------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------- |
| Desktop E2E suite     | `tests/tauri/tauri-smoke.e2e.ts`                                                     | COMPLETED   | `bun run test:tauri:e2e:linux`                                  |
| Browser suite removal | `package.json`, `vitest.browser.config.ts`, `tests/browser/*`, `bun.lock`, `bun.nix` | COMPLETED   | `bun install --frozen-lockfile`, `nix build .#chilla --no-link` |

## Dependencies

| Feature                           | Depends On                            | Status      |
| --------------------------------- | ------------------------------------- | ----------- |
| Desktop fixture-driven assertions | Existing Linux Tauri-driver harness   | Available   |
| Browser suite removal             | Desktop replacement coverage in place | Completed   |

## Completion Criteria

- [x] All browser E2E assertions are covered by the Linux Tauri-driver suite
- [x] `tests/browser/` and `vitest.browser.config.ts` are removed
- [x] `test:browser` and browser-only dependencies are removed
- [x] `bun run typecheck` passes
- [x] `bun run test` passes
- [x] `bun run test:tauri:e2e:linux` passes
- [x] `nix build .#chilla --no-link` passes

## Progress Log

### Session: 2026-03-24 16:20

**Tasks Completed**: Reviewed the browser-mode test surface, verified the existing Tauri-driver harness, and mapped each browser assertion to a real-runtime desktop scenario.
**Tasks In Progress**: Replacing browser tests with fixture-driven Tauri-driver coverage, then removing browser test scripts/config/dependencies.
**Blockers**: None.
**Notes**: The key implementation detail is passing a deterministic startup path to the app by launching the built binary through a temporary wrapper script.

### Session: 2026-03-24 19:05

**Tasks Completed**: Replaced the browser-only tests with a fixture-driven Tauri-driver suite that validates workspace startup, file-tree rendering, focus retention, lazy loading, restart behavior, server-side filtering, and dark README preview styling; removed `test:browser`, deleted `tests/browser/` and `vitest.browser.config.ts`, and cleaned the Bun/Nix dependency graph.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Final verification passed with `bun install --frozen-lockfile --backend=copyfile --ignore-scripts`, `bun run typecheck`, `bun run test`, `bun run test:tauri:e2e:linux`, and `nix build .#chilla --no-link`. The only remaining textual browser references are Vitest optional peer metadata in `bun.lock`, which do not affect the installed dependency graph.

## Related Plans

- **Previous**: `impl-plans/completed/linux-tauri-e2e-webdriver.md`
- **Next**: -
- **Depends On**: `impl-plans/completed/linux-tauri-e2e-webdriver.md`

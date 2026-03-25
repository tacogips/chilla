# Real Runtime Only Verification Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/notes.md#real-runtime-only-verification-notes
**Created**: 2026-03-24
**Last Updated**: 2026-03-24

---

## Design Document Reference

**Source**: design-docs/specs/notes.md#real-runtime-only-verification-notes

### Summary

Make runtime-facing workspace/document behavior depend on the real Tauri desktop path only.

### Scope

**Included**: document boundary cleanup, deletion of fake-runtime tests, and repo guidance updates.
**Excluded**: Rust command changes, new browser automation, and non-Linux desktop E2E work.

---

## Modules

### 1. Runtime Boundary Cleanup

#### src/lib/tauri/document.ts

**Status**: COMPLETED

```text
document.ts
- remove the browser-only fallback activation and fixture data
- keep typed Tauri invoke/listen wrappers only
- preserve existing public request/response types
```

**Checklist**:

- [x] Remove browser-only fallback detection
- [x] Remove the test-only fallback export
- [x] Keep typed runtime wrappers compiling cleanly

### 2. Fake Runtime Test Removal

#### src/lib/tauri/document.test.ts, src/features/workspace/WorkspaceShell.vitest.tsx

**Status**: COMPLETED

```text
test removal
- delete tests that only validate the removed browser-only fallback
- keep non-mock DOM/unit tests intact
```

**Checklist**:

- [x] Delete `src/lib/tauri/document.test.ts`
- [x] Delete `src/features/workspace/WorkspaceShell.vitest.tsx`
- [x] Keep `vitest.config.ts` and other DOM tests working

### 3. Documentation Alignment

#### design-docs/specs/notes.md, impl-plans/README.md

**Status**: COMPLETED

```text
docs alignment
- remove old fallback-specific guidance
- keep desktop verification guidance centered on Tauri-driver
- track the implementation plan in the plan index
```

**Checklist**:

- [x] Remove obsolete fallback-specific skill guidance
- [x] Add plan entry to `impl-plans/README.md`
- [x] Remove stale fallback references from docs/plans

---

## Module Status

| Module | File Path | Status | Tests |
| ------ | --------- | ------ | ----- |
| Runtime boundary cleanup | `src/lib/tauri/document.ts` | COMPLETED | `bun run typecheck` |
| Fake runtime test removal | `src/lib/tauri/document.test.ts`, `src/features/workspace/WorkspaceShell.vitest.tsx` | COMPLETED | `bun run test`, `bun run test:dom` |
| Documentation alignment | `design-docs/specs/notes.md`, `impl-plans/README.md` | COMPLETED | review + `rg` |

## Dependencies

| Feature | Depends On | Status |
| ------- | ---------- | ------ |
| Real-runtime-only verification | Completed Linux desktop E2E coverage | Available |

## Completion Criteria

- [x] The browser-only fallback is removed from `src/lib/tauri/document.ts`
- [x] Fake-runtime tests are removed
- [x] Fallback-specific documentation references are removed or updated to match the new strategy
- [x] `bun run typecheck` passes
- [x] `bun run test` passes
- [x] `bun run test:dom` passes
- [x] `bun run test:tauri:e2e:linux` passes

## Progress Log

### Session: 2026-03-24 20:05
**Tasks Completed**: Scoped the browser-only fallback implementation and identified the remaining test/doc entrypoints that depended on it.
**Tasks In Progress**: Removing the fallback from `src/lib/tauri/document.ts`, deleting fake-runtime tests, and aligning docs with the real-runtime-only verification model.
**Blockers**: None
**Notes**: `test:dom` remains because the repo still has frontend-local DOM tests; the target is removal of fake Tauri/workspace behavior, not removal of all Vitest usage.

### Session: 2026-03-24 20:25
**Tasks Completed**: Removed the browser-only fallback export path from `src/lib/tauri/document.ts`; deleted `src/lib/tauri/document.test.ts` and `src/features/workspace/WorkspaceShell.vitest.tsx`; updated design/plan docs to reflect the real-runtime-only strategy; and hardened the README preview Tauri E2E assertion to avoid stale DOM handles during rerender.
**Tasks In Progress**: None.
**Blockers**: None
**Notes**: Verification passed with `bun run typecheck`, `bun run test`, `bun run test:dom`, and `bun run test:tauri:e2e:linux`.

## Related Plans

- **Previous**: `impl-plans/completed/browser-tests-to-tauri-e2e.md`
- **Next**: -
- **Depends On**: `impl-plans/completed/browser-tests-to-tauri-e2e.md`

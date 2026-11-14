# Recursive Directory Search Implementation Plan

**Status**: Completed
**Design Reference**: [Recursive Directory Search](../../design-docs/specs/design-file-viewer-mode.md#recursive-directory-search)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

## Tasks and Deliverables

| Task | Deliverables | Status | Dependencies |
| --- | --- | --- | --- |
| 1 | Rust search service/types and async command, registration, filesystem tests | Completed | None; parallelizable |
| 2 | Typed invoke wrapper, search panel, toolbar icons/integration, DOM and contract tests | Completed | Agreed IPC contract; parallelizable |
| 3 | Styles, README, independent mixed-stack review/checks, debug build/launch | Completed | 1 and 2 |

## Contract and Behavior

Use the exact input/output contract in the referenced design. No dependency
changes. Existing DirectoryEntry allows results to use onConfirmEntry directly;
line numbers and snippets appear in results without changing preview contracts.
Search is submitted explicitly, with loading/empty/error/incomplete states and
stale-result guards. Preserve List/Tree lazy caches and current root. Inputs and
results support keyboard activation, closing, and accessible labels.

## Completion Criteria

- [x] Two accessible toolbar icons reveal content/name search.
- [x] Both search recursively from the current directory on submission only.
- [x] Content results show paths, line numbers and literal-match excerpts.
- [x] Filename results match names/relative paths case-insensitively.
- [x] Results open files; close returns to unchanged browser root/view.
- [x] Binary, symlink, oversized, ignored and unreadable cases handled.
- [x] Resource limits/partial results, async execution and stale response guards verified.
- [x] IPC types, focused regressions, full verification and debug launch pass.

## Progress Log

### 2026-09-09
User requests icon actions for recursive content grep and filename finding.
Plan uses a bounded Rust walker with existing Git-ignore helper and no new
dependencies. Frontend results reuse existing file preview activation.

Implemented with required Rust and TypeScript coding agents. Independent review
fixed literal query whitespace handling and added queued-directory revalidation.
Eight focused Rust search tests and 34 focused DOM/IPC tests pass, with formatting,
typecheck and strict Clippy passing. Debug Tauri build succeeded and the binary
launched as PID 60610; launch log: `/tmp/chilla-directory-search-launch.log`.
Independent `CARGO_TERM_QUIET=true mise run verify` passed typechecks, Biome,
Rust formatting/Clippy, 39 Bun tests and 181 Rust tests. `bun run test:dom`
passed 210 tests across 18 files. Desktop-control tools are unavailable,
so launch/process smoke checks do not claim visual UI verification. The time
budget is cooperative between operations, not a hard filesystem/Git-call timeout.

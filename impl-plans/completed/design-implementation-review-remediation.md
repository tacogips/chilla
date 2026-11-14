# Design Implementation Review Remediation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/design-implementation-review.md`
**Created**: 2026-07-03
**Last Updated**: 2026-07-03

## Design Document Reference

This plan remediates the findings listed in `design-implementation-review.md`, with
priority on concrete security and correctness issues that can be proven by code and
tests in this repository.

## Scope

**Included**:
- Media stream hardening: sensitive logging removal, CORS reduction, registry bounds,
  and connection bounds.
- Markdown and EPUB sanitization hardening with explicit URL and element policies.
- Save conflict checking using the existing `revision_token` contract.
- File watcher reliability for atomic rename saves.
- Directory listing, Git diff, GitHub diff, CLI, syntax, and documentation drift
  follow-ups where changes are low-risk and directly verifiable.

**Excluded**:
- A full replacement sanitizer library migration.
- A full diff-source type hierarchy split across Rust and TypeScript.
- Large frontend module decomposition.

## Modules

### 1. Security and Sanitization

**Status**: COMPLETED

**Deliverables**:
- `src-tauri/src/media_stream.rs`
- `src-tauri/src/markdown/mod.rs`
- `src-tauri/src/viewer/epub.rs`
- `src-tauri/tauri.conf.json`

**Checklist**:
- [x] Remove default media token/path logging and wildcard CORS.
- [x] Bound media registry and concurrent connection handling.
- [x] Reject unsafe Markdown URL schemes in raw HTML, links, and media.
- [x] Render EPUB through explicit element and attribute allowlists.
- [x] Add focused Rust sanitizer tests.

### 2. Correctness and Robustness

**Status**: COMPLETED

**Deliverables**:
- `src-tauri/src/document/service.rs`
- `src-tauri/src/commands/document.rs`
- `src-tauri/src/watcher/service.rs`
- `src-tauri/src/viewer/directory_listing.rs`
- `src-tauri/src/viewer/service.rs`
- `src-tauri/src/git_diff.rs`
- `src-tauri/src/github_pr_diff.rs`
- `src-tauri/src/syntax_highlight/mod.rs`
- `src/features/workspace/WorkspaceShell.tsx`
- `src/lib/tauri/document.ts`

**Checklist**:
- [x] Require expected document revision on save and report conflict.
- [x] Watch parent directories and filter atomic replacement events.
- [x] Reuse directory listing metadata and make canonical path fallback non-fatal.
- [x] Surface lossy UTF-8 decoding behavior in preview metadata.
- [x] Avoid redundant syntax file reads where source is already loaded.
- [x] Cap untracked worktree diff expansion and avoid duplicate GitHub cap warnings.

### 3. Contracts and Documentation

**Status**: COMPLETED

**Deliverables**:
- `design-docs/specs/command.md`
- `design-docs/specs/architecture.md`
- `design-docs/specs/design-markdown-workbench.md`
- `README.md`
- `impl-plans/README.md`
- active/completed implementation plan locations

**Checklist**:
- [x] Document CLI two-argument precedence and exit codes.
- [x] Mark superseded Markdown workbench specs clearly.
- [x] Align automatic refresh wording with watcher behavior.
- [x] Move shipped active plans to completed or document why they remain active.
- [x] Document intentional deferred refactors.

## Review Finding Audit

| Finding | Status | Evidence |
|---------|--------|----------|
| 1.1 media token logging/CORS/eviction/connections | Implemented | `media_stream.rs` removes default token/path logs and CORS, caps entries and active connections |
| 1.2 Markdown URL schemes | Implemented | `markdown/mod.rs` URL policy and sanitizer tests |
| 1.3 CSP disabled | Implemented | `tauri.conf.json` now defines a CSP; `assetProtocol.scope` remains broad for current file-view compatibility |
| 1.4 EPUB allowlist | Implemented | `viewer/epub.rs` explicit element/attribute policy and tests |
| 1.5 GitHub token host handling | Documented | `command.md` documents token variables and host restrictions |
| 1.6 media connection bounding | Implemented | `media_stream.rs` connection permit cap |
| 2.1 save conflict | Implemented | `DocumentConflict`, expected revision token command contract, Rust and TS tests |
| 2.2 watcher atomic rename | Implemented | `watcher/service.rs` watches parent directory and filters target paths |
| 2.3 directory listing metadata/canonical fallback | Implemented | `directory_listing.rs` caches metadata in seeds and falls back on canonicalize failure |
| 2.4 lossy UTF-8 | Implemented for local previews | `viewer/service.rs` preview metadata discloses replacement decoding |
| 2.5 CSV row-count ambiguity | Implemented | `CsvRowCountStatus` distinguishes complete, truncated, and parse-error states across Rust/TypeScript |
| 2.6 syntax reread | Implemented | `syntax_highlight/mod.rs` resolves from path/source without `find_syntax_for_file` |
| 2.7 untracked diff process storm | Implemented | `git_diff.rs` caps untracked diff expansion with warning |
| 2.8 duplicate GitHub cap | Implemented | `github_pr_diff.rs` single cap point |
| 2.9 CLI ambiguity | Documented | `command.md` documents path/revision collision precedence |
| 2.10 preview base path | Deferred | Command is unused by current frontend; no behavior change required |
| 3.1 diff-source modeling | Deferred | Broad type refactor excluded; runtime guard remains tested |
| 3.2 list_directory dual contract | Implemented | Rust command accepts only nested `input` payload |
| 3.3 frontend syntax tables | Deferred | Broad architecture refactor excluded |
| 3.4 large frontend modules | Deferred | Broad refactor excluded |
| 3.5 logging | Partially implemented | Sensitive media stream logging removed; unrelated MP4 diagnostics remain |
| 4.1 superseded workbench docs | Implemented | Status notes added to architecture and workbench specs |
| 4.2 command docs | Implemented | `command.md` covers flags, precedence, tokens, and exit codes |
| 4.3 refresh claim | Implemented | Watcher fixed and README wording updated |
| 4.4 stale impl-plans | Implemented | Shipped active plans moved to `completed/`; index updated |
| 5 test gaps | Partially implemented | Added Markdown/EPUB/document/watcher/media HTTP tests; broader WebDriver cases remain deferred |

## Completion Criteria

- [x] Review findings are audited item-by-item with direct evidence.
- [x] Implemented code paths have focused tests.
- [x] `task verify` passes, or each skipped/failed check is explained with evidence.
- [x] Runtime-affecting changes are launched with the local debug app when feasible.
- [x] This plan and the implementation plan index reflect the final status.

## Progress Log

### Session: 2026-07-03
**Tasks Completed**: Initial audit and remediation plan creation.
**Tasks In Progress**: Security/correctness implementation.
**Blockers**: None.
**Notes**: Multi-agent spawning is unavailable because the tool policy requires an
explicit user delegation request.

### Session: 2026-07-03 (completion)
**Tasks Completed**: Security hardening, save conflict checking, watcher and
directory robustness, diff caps, docs/index cleanup, verification, and launch smoke.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: `task verify` passed. `bun run tauri build --debug --no-bundle`
passed. Launched `target/debug/chilla .` with log
`/tmp/chilla-design-review-remediation.log`.

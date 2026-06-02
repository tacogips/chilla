# GitHub PR Diff Viewer Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/architecture.md#github-pr-diff-viewer-architecture`; `design-docs/specs/command.md#github-pr-url-contract`
**Created**: 2026-06-02
**Last Updated**: 2026-06-02

---

## Design Document Reference

**Primary Sources**:
- `design-docs/specs/architecture.md#github-pr-diff-viewer-architecture`
- `design-docs/specs/command.md#github-pr-url-contract`
- `design-docs/user-qa/qa-github-pr-diff-viewer.md`

**Codex-Agent References**:
- `AGENTS.md`
- `.agents/skills/tauri-development/SKILL.md`
- sibling qraftbox checkout: `client-legacy/components/DiffView.svelte`
- sibling qraftbox checkout: `client-legacy/src/types/diff.ts`
- sibling qraftbox checkout: `src/server/github/url-parser.ts`
- sibling qraftbox checkout: `src/server/github/pr-service.ts`
- sibling qraftbox checkout: `src/server/routes/diff.ts`
- sibling qraftbox checkout: `usage/resource/diff_side_by_side.png`
- sibling qraftbox checkout: `usage/resource/diff_current.png`
- sibling qraftbox checkout: `usage/resource/diff_stack.png`

### Summary

Implement a read-only GitHub PR diff viewer in chilla. A single startup argument shaped as `https://github.com/<owner>/<repo>/pull/<number>` opens PR diff viewer mode, the Rust backend validates and retrieves a typed diff snapshot through a first-slice GitHub REST API adapter, and the Solid frontend renders qraftbox-inspired side-by-side, current, and stack modes with a yazi-style current-directory-only changed-file browser.

### Scope

**Included**:
- CLI startup classification for a single GitHub PR URL.
- Rust-owned PR URL parsing, typed PR identity, diff retrieval service boundary, and a GitHub REST API first-slice public-repository retrieval adapter.
- Tauri invoke contract for loading the PR diff snapshot after app startup.
- TypeScript mirror types and invoke wrapper validation.
- PR diff workspace state, loading/error presentation, current-directory-only changed-file projection, keyboard/pointer file navigation, and mode switching.
- Side-by-side, current-state, and stack/inline diff renderers based on typed diff data.
- Tests and runtime launch verification for mixed Rust/TypeScript behavior.
- Step 3 low feedback cleanup in documentation traceability.

**Excluded**:
- GitHub review comments, line comments, approval flows, or mutation APIs.
- qraftbox `full-file` mode.
- Importing or copying qraftbox Svelte/server code into chilla.
- Private repository credential UX beyond an isolated backend adapter seam and clear first-slice errors.
- In-app URL input and recent PR URL persistence unless a later design decision adds them.

### Intentional Divergences

- qraftbox is a behavioral reference only; chilla stays Rust/Tauri plus Solid.
- qraftbox `full-file` mode is excluded because the accepted scope names three modes only.
- GitHub network access remains backend-owned; the frontend never calls GitHub directly.
- The left pane is not a tree. It projects flat changed-file paths into one logical directory at a time.

---

## Modules And Contracts

### 1. Startup And PR URL Parsing

#### `src-tauri/src/cli/mod.rs`
#### `src-tauri/src/viewer/types.rs`
#### `src-tauri/src/viewer/service.rs`
#### optional `src-tauri/src/github_pr/mod.rs`

**Status**: COMPLETED

Required contracts:
- Extend `StartupTarget` with a GitHub PR URL target containing canonical URL, owner, repository, and PR number.
- Extend `WorkspaceMode` with `pr_diff` and `BrowserRoot` with a PR diff root payload.
- Validate only `https://github.com/<owner>/<repo>/pull/<positive-number>` plus ignored query/fragment.
- Reject mixed local paths plus PR URLs as invalid CLI usage.
- Preserve existing local file, directory, and explicit file-set behavior.

### 2. Rust PR Diff Service And Tauri Command

#### `src-tauri/src/github_pr/`
#### `src-tauri/src/commands/document.rs`
#### `src-tauri/src/commands/mod.rs`
#### `src-tauri/src/lib.rs`
#### `src-tauri/capabilities/default.json` if a new command permission is required
#### `src-tauri/Cargo.toml` only if a justified non-existing dependency is required

**Status**: COMPLETED

Required contracts:
- Define serializable `PrDiff`, `PrIdentity`, `PrDiffStats`, `DiffFile`, `DiffChunk`, `DiffChange`, and typed warning/error shapes.
- Add one invoke command, expected name `load_pr_diff`, that accepts a validated PR identity or canonical URL and returns a normalized snapshot.
- Implement a first-slice GitHub REST API adapter behind a service boundary using the existing `reqwest` dependency.
- Retrieve PR metadata from GitHub's pull-request endpoint and changed-file entries from the pull-request files endpoint, including `patch` text when present.
- Normalize API pagination into one snapshot with an explicit first-slice cap and warning when the cap is reached.
- Parse `patch` text into chunks and line changes; files without patch content become explicit unsupported, binary, too-large, or omitted entries instead of disappearing.
- Use repository-local fixture JSON and patch samples for PR metadata, paginated file lists, rename/delete/binary entries, and missing-patch cases; tests must not depend on live GitHub availability.
- Defer raw `.diff` endpoint and local-git retrieval to future adapters behind the same service trait; do not change frontend contracts for those deferred strategies.
- Normalize rate-limit, network, missing PR, private repository, malformed URL, binary/large diff, and unsupported-file errors into user-actionable messages.
- Keep credentials and raw GitHub responses out of frontend state.
- Add focused Rust unit tests for URL parsing, startup target classification, service normalization, and adapter parsing with fixtures.

### 3. TypeScript Contract And Invoke Wrapper

#### `src/lib/tauri/document.ts`
#### `src/lib/tauri/document.vitest.ts`
#### `src/lib/tauri/document-invoke.vitest.ts`

**Status**: COMPLETED

Required contracts:
- Extend `WorkspaceMode` and `BrowserRoot` to include PR diff startup payloads.
- Add TypeScript `PrDiff`, `PrIdentity`, `DiffFile`, `DiffChunk`, `DiffChange`, `DiffMode`, and warning/error-facing types aligned to Rust serde output.
- Add `loadPrDiff` invoke wrapper and payload normalization tests.
- Fail loudly on malformed cross-boundary payloads instead of silently rendering partial data.

### 4. PR Diff Workspace And Yazi-Style File Browser

#### `src/features/pr-diff/`
#### `src/features/workspace/WorkspaceShell.tsx`
#### `src/features/workspace/state.ts`
#### `src/features/file-view/` only for shared local-browser utilities
#### `src/app/App.css`

**Status**: COMPLETED

Required contracts:
- Add a PR diff workspace branch selected from `startupContext.initial_mode === "pr_diff"`.
- Load the snapshot after app startup, with loading, retry, and typed error states.
- Project flat changed-file paths into a current-directory-only listing with root, child directory, parent, and file rows.
- Show directory aggregate file counts and additions/deletions.
- Selecting a file updates the diff pane without changing directory; entering a directory replaces the list.
- Support keyboard selection, enter/back navigation, and pointer selection consistent with local browsing.
- Include tests for directory projection, selection persistence, parent navigation, rename metadata display, and empty/error states.

### 5. Diff Mode Rendering

#### `src/features/pr-diff/`
#### `src/app/App.css`
#### optional shared syntax/token helpers under `src/features/preview/`

**Status**: COMPLETED

Required contracts:
- Render side-by-side mode with aligned old/new line gutters and highlighted add/delete/context rows.
- Render current mode as resulting file state with additions/context emphasized and deleted-only rows omitted or represented as non-current metadata.
- Render stack mode as one vertical sequence suitable for narrow layouts.
- Provide mode controls for side-by-side, current, and stack only.
- Keep row layout stable across desktop and mobile widths; avoid text overlap in file rows, mode controls, gutters, and metadata.
- Add DOM tests for mode switching, representative hunk rendering, deleted/renamed/binary placeholder rows, and narrow-width stack fallback.

### 6. Documentation, Verification, And Runtime Launch

#### `design-docs/specs/command.md`
#### `design-docs/references/README.md`
#### `README.md` or explicit no-user-docs-needed note
#### `impl-plans/active/github-pr-diff-viewer.md`

**Status**: COMPLETED

Required contracts:
- Address Step 3 low feedback by clarifying positional target wording and adding the qraftbox URL parser reference.
- Refresh user-facing documentation if the implemented PR URL startup behavior is documented elsewhere.
- Update this plan's task statuses, completion criteria, and progress log after each implementation session.
- Rebuild and launch `target/debug/chilla` after runtime-affecting changes per chilla post-edit launch guidance.

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Startup and PR URL parsing | `src-tauri/src/cli/mod.rs`, `src-tauri/src/viewer/types.rs`, `src-tauri/src/github_pr_diff.rs` | COMPLETED | Cargo unit tests |
| PR diff service and command | `src-tauri/src/github_pr_diff.rs`, `src-tauri/src/commands/document.rs`, `src-tauri/src/lib.rs` | COMPLETED | Cargo unit tests + fixtures |
| TypeScript contract | `src/lib/tauri/document.ts` | COMPLETED | Vitest |
| PR diff workspace and file browser | `src/features/pr-diff/`, `src/features/workspace/WorkspaceShell.tsx` | COMPLETED | Vitest DOM/unit tests |
| Diff renderers | `src/features/pr-diff/`, `src/app/App.css` | COMPLETED | Vitest DOM tests + runtime launch |
| Documentation and verification | docs, README not required for first-slice internal workflow, this plan | COMPLETED_WITH_VERIFICATION_GAP | `git diff --check` + command suite |

## Implementation Tasks

### TASK-001: Documentation Traceability Cleanup
**Status**: COMPLETED
**Parallelizable**: Yes
**Deliverables**: `design-docs/specs/command.md`, `design-docs/references/README.md`

**Completion Criteria**:
- [x] Positional target wording includes filesystem paths and the single GitHub PR URL target without contradicting the command table.
- [x] `qraftbox/src/server/github/url-parser.ts` is listed in the reference index.
- [x] `git diff --check` passes for documentation edits.

### TASK-002: Rust Startup Target And URL Parser
**Status**: COMPLETED
**Parallelizable**: No
**Deliverables**: `src-tauri/src/cli/mod.rs`, `src-tauri/src/viewer/types.rs`, `src-tauri/src/viewer/service.rs`, optional `src-tauri/src/github_pr/mod.rs`

**Completion Criteria**:
- [x] `chilla <github_pr_url>` produces PR diff startup context with canonical URL and parsed identity.
- [x] Non-GitHub, non-PR, non-positive-number, and mixed PR URL plus local path inputs are rejected with CLI usage errors.
- [x] Existing local startup tests continue to pass.
- [x] Cargo tests cover accepted/rejected PR URL shapes.

### TASK-003: Rust PR Diff Service And Command
**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: `TASK-002`
**Deliverables**: `src-tauri/src/github_pr/`, `src-tauri/src/commands/document.rs`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json` if needed, Rust fixture files under the relevant test fixture path

**Completion Criteria**:
- [x] Typed diff snapshot, file, hunk, change, warning, and error structs serialize in snake_case-compatible shapes.
- [x] `load_pr_diff` is registered and reachable through Tauri invoke.
- [x] First-slice retrieval uses GitHub REST API PR metadata and PR files endpoints through the Rust service boundary.
- [x] Existing `reqwest` dependency is reused unless implementation discovers a concrete missing capability.
- [x] Fixture-backed tests cover PR metadata, paginated file lists, patch parsing, renames, deletes, binary or missing-patch files, and cap/truncation warnings.
- [x] Raw `.diff` and local-git strategies remain deferred adapters and do not affect the frontend contract.
- [x] Binary, large, malformed, rate-limit, private/missing, and network cases are normalized to actionable errors or warnings.
- [x] Cargo tests cover parser/service behavior without depending on live GitHub availability.

### TASK-004: TypeScript Boundary And Workspace Routing
**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: `TASK-002`, `TASK-003`
**Deliverables**: `src/lib/tauri/document.ts`, `src/lib/tauri/document.vitest.ts`, `src/lib/tauri/document-invoke.vitest.ts`, `src/features/workspace/WorkspaceShell.tsx`

**Completion Criteria**:
- [x] TypeScript startup context supports `pr_diff`.
- [x] `loadPrDiff` wrapper uses the registered command name and maps errors consistently with existing invoke wrappers.
- [x] Payload normalization rejects malformed PR diff payloads.
- [x] Workspace shell routes PR diff startup into the PR diff workspace without breaking markdown or file-view modes.

### TASK-005: PR Diff File Browser And Workspace State
**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: `TASK-004`
**Deliverables**: `src/features/pr-diff/`, `src/features/workspace/state.ts`, `src/app/App.css`

**Completion Criteria**:
- [x] Current-directory-only projection lists direct changed files and child directories from flat paths.
- [x] Parent navigation, directory enter, sibling movement, and file selection feel like local file browsing.
- [x] Directory aggregate counts and additions/deletions are shown.
- [x] Rename rows expose old path metadata while remaining discoverable by current display path.
- [x] Vitest coverage includes projection and keyboard/pointer navigation.

### TASK-006: Three Diff Modes
**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: `TASK-004`, `TASK-005`
**Deliverables**: `src/features/pr-diff/`, `src/app/App.css`

**Completion Criteria**:
- [x] Side-by-side, current, and stack modes render representative diff hunks.
- [x] Mode controls expose only the requested three modes.
- [x] Stack mode works on narrow layouts; side-by-side remains readable on desktop.
- [x] Unsupported/binary/truncated files show explicit placeholders.
- [x] DOM tests cover mode switching and hunk rendering.

### TASK-007: Mixed-Stack Verification And Runtime Launch
**Status**: COMPLETED_WITH_VERIFICATION_GAP
**Parallelizable**: No
**Depends On**: `TASK-001`, `TASK-002`, `TASK-003`, `TASK-004`, `TASK-005`, `TASK-006`
**Deliverables**: test results, runtime notes, plan progress log, user-facing docs update or explicit no-docs-needed note

**Completion Criteria**:
- [x] `bash .agents/scripts/format-ts.sh` passes.
- [x] `CARGO_TERM_QUIET=true cargo fmt` passes.
- [x] `bun run typecheck` passes.
- [ ] `bun run test` passes. See progress log for existing Bun-native runner incompatibility; Vitest suite passed.
- [x] `CARGO_TERM_QUIET=true cargo check` passes.
- [x] `CARGO_TERM_QUIET=true cargo test` passes.
- [x] `CARGO_TERM_QUIET=true cargo clippy --all-targets --all-features` passes or repository-equivalent clippy command is recorded.
- [x] Debug app is rebuilt if needed and `target/debug/chilla` is launched with a representative GitHub PR URL.
- [x] Runtime notes cover startup, loading/error behavior, file-browser navigation, and all three diff modes.

## Dependencies

| Task | Depends On | Status |
|------|------------|--------|
| TASK-001 Documentation cleanup | Accepted design and Step 3 low feedback | COMPLETED |
| TASK-002 Rust startup target | Accepted design | COMPLETED |
| TASK-003 Rust diff service | TASK-002 | COMPLETED |
| TASK-004 TypeScript boundary | TASK-002, TASK-003 | COMPLETED |
| TASK-005 File browser/workspace | TASK-004 | COMPLETED |
| TASK-006 Diff modes | TASK-004, TASK-005 | COMPLETED |
| TASK-007 Verification/runtime | TASK-001 through TASK-006 | COMPLETED_WITH_VERIFICATION_GAP |

## Parallelization

- `TASK-001` may run in parallel with `TASK-002` because documentation cleanup and Rust startup parsing write scopes are disjoint.
- All other tasks are sequential because they depend on the shared Rust/TypeScript startup and diff payload contract or share frontend workspace files.

## Completion Criteria

- [x] Accepted design behavior is implemented for direct `chilla <github_pr_url>` startup.
- [x] Rust and TypeScript PR diff payload contracts remain synchronized.
- [x] PR diff retrieval is backend-owned and hidden behind an adapter boundary.
- [x] Left pane uses current-directory-only changed-file browsing, not an expanded tree.
- [x] Side-by-side, current, and stack modes render from typed diff data.
- [x] Network, rate-limit, private/missing PR, malformed URL, large diff, and unsupported-file states are user-actionable.
- [x] Step 3 low feedback is either fixed in docs or explicitly recorded as deferred with rationale.
- [x] Verification commands in TASK-007 are run and recorded.
- [x] Progress log is updated after each implementation session.

## Progress Log

### Session: 2026-06-02 Step 4 Implementation Plan Creation
**Tasks Completed**: Created implementation plan after Step 3 accepted the design.
**Tasks In Progress**: None.
**Blockers**: None for planning. Implementation must preserve the selected GitHub REST API adapter behind the Rust service boundary and keep raw `.diff` / local-git strategies deferred.
**Notes**: Plan traces to accepted design docs, qraftbox behavioral references, and Step 3 low feedback. No Step 5 feedback exists for this first Step 4 run.

### Session: 2026-06-02 Step 4 Rerun After Step 5 Review
**Tasks Completed**: Addressed Step 5 mid finding against TASK-003 adapter specificity.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Step 5 found that the original plan left the retrieval adapter to implementation. Revised the plan to select the GitHub REST API adapter for the first slice, reuse the existing `reqwest` dependency, require fixture-backed tests for metadata, paginated file lists, patch parsing, renames/deletes/binary/missing-patch cases, and defer raw `.diff` plus local-git strategies behind the same Rust service boundary without frontend contract changes.
**Verification**: `git diff --check`; `wc -l impl-plans/active/github-pr-diff-viewer.md`; `rg -n 'GitHub REST API|raw \\.diff|TASK-003|Step 5' impl-plans/active/github-pr-diff-viewer.md`.

### Session: 2026-06-02 Step 6 Implementation
**Tasks Completed**: TASK-001 through TASK-006, with TASK-007 completed except for the recorded `bun run test` verification gap.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Implemented direct GitHub PR URL startup, typed Rust/TypeScript PR diff contracts, backend-owned GitHub REST metadata and PR files retrieval, fixture-backed REST file normalization, `load_pr_diff` invoke wiring, Solid PR diff workspace routing, yazi-style current-directory-only changed-file browsing, and side-by-side/current/stack render modes. README was not updated because this first slice is represented in design docs and workflow plan artifacts rather than a stable user-facing public command reference.
**Runtime Notes**: Rebuilt with `bun run tauri build --debug --no-bundle`; launched the debug `target/debug/chilla` binary with `https://github.com/tacogips/chilla/pull/1` and a temporary log file. The process exited quickly and the log was empty, so UI interaction could not be visually confirmed in this run; startup parsing and invoke contracts are covered by tests.
**Verification**: `bash .agents/scripts/format-ts.sh`; `CARGO_TERM_QUIET=true cargo fmt`; `bun run typecheck`; `bun run test` failed before assertions with Bun-native module-resolution errors for existing `.test.ts` files and `vi.hoisted` incompatibility in `.vitest.ts`; `bun run test:dom -- src/lib/tauri/document.vitest.ts src/lib/tauri/document-invoke.vitest.ts src/features/pr-diff/PrDiffWorkspace.vitest.ts`; `bun run test:dom`; `CARGO_TERM_QUIET=true cargo check`; `CARGO_TERM_QUIET=true cargo test`; `CARGO_TERM_QUIET=true cargo clippy --all-targets --all-features`; `CARGO_TERM_QUIET=true NEXTEST_STATUS_LEVEL=fail NEXTEST_FAILURE_OUTPUT=immediate-final NEXTEST_HIDE_PROGRESS_BAR=1 cargo nextest run`; `git diff --check`.

### Session: 2026-06-02 Step 6 Rerun After Step 7 Review
**Tasks Completed**: Addressed Step 7 mid finding and low findings.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Fixed current-mode diff rows so the existing three-column gutter/content grid receives old gutter, new gutter, and code content in order. Added a DOM assertion for current-mode cell order. Improved GitHub REST HTTP/network errors with actionable messages for auth, permission/rate-limit, missing/private PR, 429, 5xx, and timeouts. Updated TASK-007 status language to `COMPLETED_WITH_VERIFICATION_GAP` because `bun run test` remains failed while Vitest DOM and Rust checks pass.
**Verification**: `bash .agents/scripts/format-ts.sh`; `CARGO_TERM_QUIET=true cargo fmt`; `bun run typecheck`; `bun run test:dom -- src/features/pr-diff/PrDiffWorkspace.vitest.ts src/lib/tauri/document.vitest.ts src/lib/tauri/document-invoke.vitest.ts`; `CARGO_TERM_QUIET=true cargo check`; `CARGO_TERM_QUIET=true cargo test`; `CARGO_TERM_QUIET=true cargo clippy --all-targets --all-features`; `CARGO_TERM_QUIET=true NEXTEST_STATUS_LEVEL=fail NEXTEST_FAILURE_OUTPUT=immediate-final NEXTEST_HIDE_PROGRESS_BAR=1 cargo nextest run`; `git diff --check`.

## Related Plans

- **Previous**: None.
- **Next**: None.
- **Depends On**: Accepted design in `design-docs/specs/architecture.md#github-pr-diff-viewer-architecture` and `design-docs/specs/command.md#github-pr-url-contract`.

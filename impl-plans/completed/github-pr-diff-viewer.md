# GitHub Diff Viewer Source Expansion Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/architecture.md#github-diff-viewer-architecture`; `design-docs/specs/command.md#github-diff-url-contract`
**Created**: 2026-06-02
**Last Updated**: 2026-07-03

---

## Design Document Reference

**Primary Sources**:
- `design-docs/specs/architecture.md#github-diff-viewer-architecture`
- `design-docs/specs/command.md#github-diff-url-contract`
- `design-docs/references/README.md`
- `design-docs/user-qa/qa-github-pr-diff-viewer.md`

**Workflow References**:
- Workflow ID: `codex-design-and-implement-review-loop`
- Step 1 issue intake: accepted single-path issue-resolution mode.
- Step 2 design-doc update: accepted source-aware GitHub diff viewer design.
- Step 3 design review: accepted with no high or mid findings.

**Codex-Agent References**:
- `codex-agent` is the workflow execution backend reference from upstream payloads.
- No concrete `codex-agent` reference repository files were provided.
- Step 2 noted preferred local root `../../codex-agent`, but it was missing locally.
- Plan decision: keep `codex-agent` runtime behavior out of scope and do not generalize or rename the execution-backend identifier.

### Summary

Extend the completed GitHub PR diff viewer into a source-aware GitHub diff viewer. The application must accept pull request URLs, pull request `/files` URLs, commit URLs, and compare URLs as single startup targets, then reuse the same changed-file browser and the same left/right, stack, and full-file diff modes.

### Scope

**Included**:
- Preserve existing pull request URL support, including `/pull/<number>/files`.
- Add commit URL parsing and GitHub commit API retrieval.
- Add compare URL parsing and GitHub compare API retrieval, including refs containing slashes.
- Keep source-specific cache keys and preserve the no-cache option for every source kind.
- Keep GitHub network access backend-owned and Tauri/TypeScript payloads aligned.
- Update frontend labels, loading text, errors, header metadata, and GitHub jump action to be source-aware.
- Add mocked Rust and Vitest coverage for pull request, commit, and compare sources.
- Refresh README documentation for supported URL forms and controls.

**Excluded**:
- GitHub comments, approvals, review mutation flows, or pushes.
- In-app URL entry, recent GitHub diff history, and private repository UX beyond existing token/error handling.
- Raw `.diff` or local-git fallback implementation.
- Cursor CLI behavior or `codex-agent` runtime-specific behavior.

### Existing Worktree Constraint

The current working tree contains uncommitted PR-diff UI and backend changes that are part of this feature branch. The implementation step must inspect and preserve those edits, then reconcile them against this source-aware plan instead of reverting or overwriting them.

---

## Modules And Contracts

### 1. Rust GitHub Diff Source Model

**Files**:
- `src-tauri/src/github_pr_diff.rs`
- `src-tauri/src/commands/document.rs`
- `src-tauri/src/cli/mod.rs`
- `src-tauri/src/viewer/types.rs`
- `src-tauri/src/viewer/service.rs`

**Required contract updates**:
- Replace PR-only target semantics with a source-aware target while preserving compatible `pr_diff` workspace routing unless a broader rename is completed end to end.
- Represent source kind as pull request, commit, or compare.
- Canonicalize accepted URLs:
  - `https://github.com/<owner>/<repo>/pull/<number>`
  - `https://github.com/<owner>/<repo>/pull/<number>/files`
  - `https://github.com/<owner>/<repo>/commit/<sha>`
  - `https://github.com/<owner>/<repo>/compare/<base>...<head>`
- Strip query strings and fragments after validation.
- Preserve compare path content after `/compare/` before splitting on exactly one `...`.
- Reject non-GitHub hosts, git remote URLs, non-positive PR numbers, empty commit SHAs, and malformed compare refs with typed startup or workspace errors.

### 2. Rust API Retrieval, Cache, And Fixtures

**Files**:
- `src-tauri/src/github_pr_diff.rs`
- `src-tauri/tests/fixtures/github-pr-metadata.json`
- `src-tauri/tests/fixtures/github-pr-files.json`
- Add fixture files for commit and compare responses under `src-tauri/tests/fixtures/` or the existing in-module fixture convention.

**Required contract updates**:
- Pull requests use GitHub pull request metadata and pull request files endpoints.
- Commits use the GitHub commit endpoint and normalize its file payloads.
- Compares use the GitHub compare endpoint and normalize its file payloads.
- Snapshot identity includes source kind, owner, repo, canonical URL, source metadata, and updated marker when available.
- Cache keys include source kind plus PR number, commit SHA, or compare base/head.
- No-cache bypasses both cache reads and writes for all source kinds.
- Full-file lazy loading continues to validate GitHub raw URLs and returns explicit placeholders for missing raw URLs, deleted files, binary files, and too-large files.

### 3. Tauri And TypeScript Boundary

**Files**:
- `src/lib/tauri/document.ts`
- `src/lib/tauri/document.vitest.ts`
- `src/lib/tauri/document-invoke.vitest.ts`
- `src-tauri/src/commands/document.rs`

**Required contract updates**:
- Mirror Rust source identity in TypeScript using discriminated source fields.
- Keep invoke command names explicit: existing `load_pr_diff` and `load_pr_diff_file_text` may remain if payloads are source-aware.
- Normalize malformed cross-boundary payloads by throwing typed wrapper errors before UI rendering.
- Preserve startup payload parsing for existing markdown, file view, and PR diff modes.

### 4. Source-Aware Frontend Workspace

**Files**:
- `src/features/pr-diff/PrDiffWorkspace.tsx`
- `src/features/pr-diff/PrDiffWorkspace.vitest.ts`
- `src/app/App.css`

**Required contract updates**:
- Audit hard-coded "PR" labels in loading, status, errors, header, title, aria labels, jump action, and tests.
- Render pull request, commit, and compare metadata using source-specific wording.
- Jump action opens the canonical source URL for all source kinds.
- Preserve changed-file directory browser behavior and left/right, stack, and full-file modes.
- Preserve responsive layout and avoid text overlap in source labels, file rows, controls, and metadata.

### 5. Documentation And Plan Tracking

**Files**:
- `README.md`
- `impl-plans/active/github-pr-diff-viewer.md`

**Required contract updates**:
- README documents pull request, `/files`, commit, and compare URL forms.
- README documents source-aware controls, including the GitHub jump action and diff modes.
- This plan's progress log is updated after each implementation session.
- When all tasks and verification are complete, move this plan to `impl-plans/completed/` and update `impl-plans/README.md`.

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Rust source model and parser | `src-tauri/src/github_pr_diff.rs`, `src-tauri/src/cli/mod.rs`, `src-tauri/src/viewer/types.rs` | READY | Cargo unit tests |
| Rust API, cache, and fixtures | `src-tauri/src/github_pr_diff.rs`, `src-tauri/tests/fixtures/` | READY | Cargo unit tests with mocked GitHub responses |
| Tauri/TypeScript contract | `src-tauri/src/commands/document.rs`, `src/lib/tauri/document.ts` | READY | Cargo + Vitest |
| Frontend source-aware workspace | `src/features/pr-diff/PrDiffWorkspace.tsx`, `src/app/App.css` | READY | Vitest DOM/unit tests |
| README and plan tracking | `README.md`, `impl-plans/active/github-pr-diff-viewer.md` | READY | `git diff --check` |

---

## Implementation Tasks

### TASK-001: Reconcile Existing Feature Edits
**Status**: Not Started
**Parallelizable**: No
**Deliverables**: Working-tree audit notes in this plan progress log.

**Completion Criteria**:
- [ ] Inspect current uncommitted changes in `src-tauri/src/github_pr_diff.rs`, `src/features/pr-diff/PrDiffWorkspace.tsx`, `src/features/pr-diff/PrDiffWorkspace.vitest.ts`, `src/app/App.css`, and `README.md`.
- [ ] Identify which changes already satisfy the accepted source-aware design.
- [ ] Preserve unrelated or user-authored edits and avoid reverting them.

### TASK-002: Rust Source Parser, API Retrieval, And Cache
**Status**: Not Started
**Parallelizable**: No
**Depends On**: `TASK-001`
**Codex Agent**: `rust-coding`
**Deliverables**: `src-tauri/src/github_pr_diff.rs`, `src-tauri/src/commands/document.rs`, relevant startup files under `src-tauri/src/`.

**Completion Criteria**:
- [ ] PR and `/files` URLs still parse and canonicalize correctly.
- [ ] Commit and compare URLs parse with source identity, including slash-containing compare refs.
- [ ] GitHub REST retrieval normalizes PR, commit, and compare file payloads into one snapshot shape.
- [ ] Cache keys include source kind plus source-specific identity and no-cache bypasses reads and writes.
- [ ] Errors for malformed URL, missing source, private repository, network failure, and rate limit remain actionable.
- [ ] Cargo unit tests cover accepted/rejected URL shapes, mocked API responses, cache key separation, and no-cache behavior.

### TASK-003: TypeScript Boundary Alignment
**Status**: Not Started
**Parallelizable**: No
**Depends On**: `TASK-002`
**Codex Agent**: `ts-coding`
**Deliverables**: `src/lib/tauri/document.ts`, `src/lib/tauri/document.vitest.ts`, `src/lib/tauri/document-invoke.vitest.ts`.

**Completion Criteria**:
- [ ] TypeScript target and snapshot types represent PR, commit, and compare sources.
- [ ] Invoke wrapper tests cover `load_pr_diff` payloads for all source kinds.
- [ ] Payload normalization rejects malformed source identity and missing source-specific metadata.
- [ ] Existing markdown, file view, and PR startup payload tests continue to pass.

### TASK-004: Frontend Labels, Header, Jump Action, And Modes
**Status**: Not Started
**Parallelizable**: No
**Depends On**: `TASK-003`
**Codex Agent**: `ts-coding`
**Deliverables**: `src/features/pr-diff/PrDiffWorkspace.tsx`, `src/features/pr-diff/PrDiffWorkspace.vitest.ts`, `src/app/App.css`.

**Completion Criteria**:
- [ ] Loading text, empty state, errors, header metadata, and aria labels use source-aware wording.
- [ ] GitHub jump action opens the canonical source URL for PR, commit, and compare sources.
- [ ] Changed-file browser behavior is unchanged for directory projection, selection, and keyboard navigation.
- [ ] Left/right, stack, and full-file modes work for all source kinds.
- [ ] Vitest coverage includes source labels, jump actions, and mode rendering for commit and compare fixtures.

### TASK-005: README Documentation
**Status**: Not Started
**Parallelizable**: Yes
**Depends On**: `TASK-002`, `TASK-003`
**Deliverables**: `README.md`.

**Completion Criteria**:
- [ ] README lists all supported GitHub diff URL forms.
- [ ] README explains shared changed-file browser controls and the left/right, stack, and full-file modes.
- [ ] README uses "GitHub diff" wording when behavior applies beyond pull requests.

### TASK-006: Mixed-Stack Verification And Runtime Launch
**Status**: Not Started
**Parallelizable**: No
**Depends On**: `TASK-002`, `TASK-003`, `TASK-004`, `TASK-005`
**Codex Agent**: `check-and-test-after-modify`
**Deliverables**: Verification results recorded in this plan progress log.

**Completion Criteria**:
- [ ] `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml github_pr_diff` passes.
- [ ] `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml` passes.
- [ ] `bun run typecheck` passes.
- [ ] `bun run test` passes.
- [ ] `git diff --check -- README.md impl-plans/active/github-pr-diff-viewer.md src-tauri/src/github_pr_diff.rs src/lib/tauri/document.ts src/features/pr-diff/PrDiffWorkspace.tsx src/features/pr-diff/PrDiffWorkspace.vitest.ts src/app/App.css` passes.
- [ ] Rebuild and launch `target/debug/chilla` after runtime-affecting changes per `chilla-post-edit-launch`.

---

## Dependencies

| Task | Depends On | Reason |
|------|------------|--------|
| TASK-001 | - | Establishes how existing uncommitted edits map to the accepted design |
| TASK-002 | TASK-001 | Rust source model defines the canonical backend contract |
| TASK-003 | TASK-002 | TypeScript mirror must match Rust serde output and invoke payloads |
| TASK-004 | TASK-003 | UI needs stable source-aware TypeScript types and normalized snapshots |
| TASK-005 | TASK-002, TASK-003 | README should describe the final public URL and control contract |
| TASK-006 | TASK-002, TASK-003, TASK-004, TASK-005 | Verification runs after implementation and docs are updated |

## Parallelizable Tasks

- `TASK-005` may run in parallel with late `TASK-004` UI polish after Rust and TypeScript source identities are settled because it only writes `README.md`.
- No other task is marked parallelizable. The parser, Tauri payload, and UI source labels share a cross-boundary contract and should be executed in order.

---

## Verification Plan

Required downstream commands:
- `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml github_pr_diff`
- `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml`
- `bun run typecheck`
- `bun run test`
- `git diff --check -- README.md impl-plans/active/github-pr-diff-viewer.md src-tauri/src/github_pr_diff.rs src/lib/tauri/document.ts src/features/pr-diff/PrDiffWorkspace.tsx src/features/pr-diff/PrDiffWorkspace.vitest.ts src/app/App.css`

Runtime validation:
- Rebuild and launch `target/debug/chilla` after runtime-affecting implementation changes.
- Exercise at least one PR URL, one `/files` PR URL, one commit URL, and one compare URL through startup or mocked runtime flow.
- Confirm the same changed-file browser and left/right, stack, full-file modes are reachable.

---

## Completion Criteria

- [ ] Existing PR URL support and `/pull/<number>/files` support are preserved.
- [ ] Commit URLs open through the same GitHub diff workspace.
- [ ] Compare URLs open through the same GitHub diff workspace, including refs with slashes.
- [ ] Cache keys are source-specific and no-cache bypasses cache reads and writes.
- [ ] Rust and TypeScript contracts are aligned and tested.
- [ ] Frontend source labels, header, loading text, errors, and GitHub jump action are source-aware.
- [ ] README documents supported GitHub diff URL forms and controls.
- [ ] Required Cargo, Bun, diff-check, and runtime launch verification is recorded.

---

## Progress Log

### Session: 2026-06-02 Step 4 Implementation Plan Creation

**Tasks Completed**: Plan revised from completed PR-only plan to source-aware GitHub diff viewer expansion plan.

**Notes**:
- Step 3 accepted the design with no high or mid findings.
- Existing worktree already contains uncommitted runtime edits for PR-diff files; implementation must reconcile rather than revert them.
- No Step 5 feedback was present in the mailbox input for this attempt.

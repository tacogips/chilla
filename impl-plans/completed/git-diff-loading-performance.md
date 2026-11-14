# Git Diff Loading Performance

**Status**: Completed
**Design Reference**: Performance improvement for the existing git diff viewer (no new design document; behavior contract defined by `src-tauri/src/git_diff.rs` and `src/features/pr-diff/PrDiffWorkspace.tsx`)

## Problem

Opening the git diff screen on a large diff takes too long. Root causes in `GitDiffService::load`:

1. `hydrate_full_file_texts` eagerly loads full text (up to 512KB per file) for every non-deleted, non-binary file. For commit/range sources this spawns one `git show <rev>:<path>` process per file. All of it is serialized into a single IPC payload even though the UI shows one file at a time and only needs full text in `full_file`/`image` modes.
2. Worktree diffs spawn one `git diff --no-index /dev/null <path>` process per untracked file (up to 300 spawns).
3. `--binary` makes git emit full base85 binary patches, inflating stdout that the parser walks and discards. It also suppresses the `Binary files ... differ` line the parser relies on for `is_binary` detection.

## Approach

Mirror the GitHub PR path, which already loads snapshots without full text and lazily fetches per-file text on demand.

## Subtasks

### TASK-001: Rust backend - lazy full text and untracked synthesis
**Status**: Completed
**Parallelizable**: Yes (disjoint files from TASK-002)
**Deliverables**:
- `src-tauri/src/git_diff.rs`:
  - `GitDiffService::load` no longer calls `hydrate_full_file_texts`; snapshot files have `full_text: None`.
  - New `pub fn load_file_text(&self, target: &GitDiffTarget, relative_path: &str) -> AppResult<PrDiffFileText>` dispatching to worktree fs read or `git show <rev>:<path>` (head rev for ranges), with existing path/revision validation.
  - Untracked worktree files: replace per-file `git diff --no-index` spawns with in-Rust synthesis of `PrDiffFile` entries (status Added; NUL byte within first 8000 bytes marks binary; text files get one chunk `@@ -0,0 +1,N @@` of add changes; empty files get no chunks). Keep the `MAX_UNTRACKED_DIFF_FILES` cap and warning.
  - Remove `--binary` from `git show` / `git diff` invocations.
- `src-tauri/src/commands/document.rs`: new command `load_git_diff_file_text(target: GitDiffTarget, path: String) -> Result<PrDiffFileText, String>`.
- `src-tauri/src/lib.rs`: register `load_git_diff_file_text`.

**Completion Criteria**:
- [x] Snapshot load performs O(1) git process spawns regardless of file count
- [x] `load_git_diff_file_text` returns per-file text for worktree, commit, and range sources
- [x] Untracked files appear as Added entries with correct additions/chunk data and binary detection
- [x] Rust tests updated/added; cargo checks and nextest pass

### TASK-002: Frontend - lazy full text for git diff targets
**Status**: Completed
**Parallelizable**: Yes (disjoint files from TASK-001)
**Deliverables**:
- `src/lib/tauri/document.ts`: `loadGitDiffFileText(target: GitDiffTarget, path: string): Promise<PrDiffFileText>` invoking `load_git_diff_file_text` with `{ target, path }`, normalized via `normalizePrDiffFileTextPayload`.
- `src/features/pr-diff/PrDiffWorkspace.tsx`: `ensureFullFileText` branches on target kind: github targets keep the `raw_url` path; git targets call `loadGitDiffFileText`. Skip deleted and binary files and files whose text is already present/loading/errored.
- Vitest coverage for the new wrapper and workspace behavior.

**Completion Criteria**:
- [x] `full_file` and `image` (SVG) modes lazily load text for git diff targets with loading indicator
- [x] No lazy request for deleted or binary files
- [x] Bun typecheck and tests pass

## Progress Log

### Session: 2026-09-03
**Tasks Completed**: TASK-001, TASK-002. Verified: cargo check, clippy, nextest (171 passed), bun typecheck, bun test (39 passed), bun test:dom (121 passed)
**Notes**: Untracked-file synthesis removes up to 300 process spawns per load; snapshot payload no longer carries full file texts.

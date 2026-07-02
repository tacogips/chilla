# Local Git Diff Viewer Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/architecture.md#github-diff-viewer-architecture`; `design-docs/specs/command.md#local-git-diff-startup-contract`
**Created**: 2026-06-02
**Last Updated**: 2026-06-02

---

## Summary

Add local Git diff support to the existing source-aware diff viewer. File-view users can switch an opened Git repository into uncommitted Git diff mode. CLI users can open commit or range diffs with `chilla <git-dir> <commit-or-range>`.

## Scope

Included:
- Detect the Git repository root for a currently opened directory.
- Show staged, unstaged, and untracked changes in the same changed-file diff UI.
- Parse `chilla <git-dir> <commit>`, `<base>..<head>`, and `<base>...<head>` startup.
- Keep local Git diff browsing repository-scoped by projecting only changed repository-relative paths.
- Reuse left/right, stack, and full-file modes.

Excluded:
- Git staging, commit, branch mutation, fetch, comments, review, or remote-provider detection.
- Local Git diff caching.
- Broad rename of internal `pr_diff` command/type names.

## Modules

### `src-tauri/src/git_diff.rs`

```rust
pub struct GitDiffTarget {
    pub repo_path: String,
    pub source: GitDiffSource,
}

pub enum GitDiffSource {
    Worktree,
    Commit { commit: String },
    Range { base: String, head: String, merge_base: bool },
}

pub struct GitDiffService;
impl GitDiffService {
    pub fn detect_repository(&self, path: &Path) -> AppResult<Option<GitDiffTarget>>;
    pub fn load(&self, target: &GitDiffTarget) -> AppResult<PrDiffSnapshot>;
}
```

Checklist:
- [x] Resolve Git repository root without shell invocation.
- [x] Load uncommitted, commit, and range diffs.
- [x] Hydrate latest-side full-file text for full-file mode.
- [x] Unit tests cover worktree, commit, and range parsing.

### `src-tauri/src/cli/mod.rs`

Checklist:
- [x] Add `StartupTarget::GitDiff`.
- [x] Parse `chilla <git-dir> <commit-or-range>` without breaking explicit file-set startup.
- [x] Unit tests cover commit and range startup.

### Tauri And TypeScript Boundary

Files:
- `src-tauri/src/commands/document.rs`
- `src-tauri/src/viewer/types.rs`
- `src/lib/tauri/document.ts`

Checklist:
- [x] Add `load_git_diff` command.
- [x] Add `detect_git_repository` command.
- [x] Add `git_diff` startup browser root.
- [x] Add TypeScript wrappers and normalization tests.

### Frontend Diff Workspace

Files:
- `src/features/workspace/WorkspaceShell.tsx`
- `src/features/pr-diff/PrDiffWorkspace.tsx`

Checklist:
- [x] Add directory-mode `Git diff` switch.
- [x] Reuse the same diff workspace for GitHub and local Git targets.
- [x] Hide GitHub jump action for local Git sources.
- [x] Provide `File view` return action for directory-triggered local Git diff mode.

## Verification

- [x] `CARGO_TERM_QUIET=true cargo test git_diff -- --nocapture`
- [x] `CARGO_TERM_QUIET=true cargo test cli -- --nocapture`
- [x] `bun run typecheck`
- [x] `bun run test:dom -- src/features/pr-diff/PrDiffWorkspace.vitest.ts src/lib/tauri/document.vitest.ts src/lib/tauri/document-invoke.vitest.ts`
- [x] Full Bun/Cargo verification
- [x] Debug app launch verification

## Progress Log

### Session: 2026-06-02

**Tasks Completed**: Rielflow Step 1 intake completed; Step 2 stalled and was stopped. Implemented local Git diff backend, startup parsing, Tauri commands, TypeScript contract, UI switch, targeted tests, full verification, and debug app launch validation.

**Notes**:
- User requested implementation through rielflow. The workflow session `riel-codex-design-and-implement-review-loop-1780371384-5382aaa0` reached Step 1 successfully but stalled during Step 2 with no candidate output, so implementation proceeded from the accepted intake and repository design/plan rules.
- Full verification passed with Bun typecheck, Bun tests, DOM tests, Cargo check, Cargo tests, and `git diff --check`.
- Computer Use validation passed against the debug app: `chilla <git-dir> HEAD~1..HEAD` opened the local range diff UI, and the directory `Git diff` button switched the repository file view into uncommitted worktree diff mode.

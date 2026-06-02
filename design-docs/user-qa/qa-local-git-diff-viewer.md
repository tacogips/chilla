# Local Git Diff Viewer Questions

These questions capture product decisions that affect implementation planning for local Git diff mode and commit/range startup.

## Questions

1. Should local Git diff startup remain positional as `chilla <git-dir> <commit-or-range>`, or should a named flag be added later for clarity?
2. Should untracked files be included by default in working-tree diff mode, or should they be hidden behind a later option?
3. Should staged and unstaged changes be merged into one working-tree snapshot, or should the UI expose separate staged and unstaged filters?
4. Should local commit and range snapshots be cached, or should all local Git snapshots be recalculated on every load?
5. Should local Git diff mode expose a refresh action in the first slice, or rely only on leaving and re-entering the mode?
6. Should submodules be shown as non-rendered changed entries in the first slice, or omitted with a warning?

## Default Planning Assumptions

- Local Git diff startup is positional in the first slice: `chilla <git-dir> <commit-or-range>`.
- Working-tree diff mode includes staged tracked changes, unstaged tracked changes, and untracked non-ignored files.
- Staged and unstaged changes are merged into one snapshot for the first slice.
- Local working-tree snapshots are not cached.
- Local commit and range snapshots may be cached only after source keys include repository identity, resolved revisions, source kind, and repository path.
- A visible reload action is useful but not required for the first implementation if command re-entry and startup reload are reliable.
- Submodules and binary files can render as explicit non-rendered entries.

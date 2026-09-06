# Git-Ignored File Visibility Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/design-file-viewer-mode.md#git-ignored-entry-visibility`
**Created**: 2026-09-03
**Last Updated**: 2026-09-03

## Design Document Reference

Add a yazi-style `.` visibility toggle and filter-row icon that hide Git-ignored entries in directory mode. Also compact overlong top paths and add a yazi-style `Tab` directory-information popup whose path is shown as a complete absolute component tree. Rust remains authoritative for ignore rules and pagination. Explicit file sets are out of scope.

## Modules And Contracts

### Rust Directory Listing

#### `src-tauri/src/viewer/directory_listing.rs`
#### `src-tauri/src/viewer/service.rs`
#### `src-tauri/src/commands/document.rs`

**Status**: COMPLETE

```rust
pub fn list_directory(
    &self,
    path: &Path,
    sort: DirectoryListSort,
    query: Option<&str>,
    hide_git_ignored: bool,
    offset: usize,
    limit: usize,
) -> AppResult<DirectoryPage>;
```

### TypeScript Invoke And Workspace State

#### `src/lib/tauri/document.ts`
#### `src/features/workspace/WorkspaceShell.tsx`

**Status**: COMPLETE

```ts
export async function listDirectory(
  path: string,
  sort: DirectoryListSort,
  query: string,
  hideGitIgnored: boolean,
  offset: number,
  limit: number,
): Promise<DirectoryPage>;
```

### File Browser Control

#### `src/features/file-view/FileBrowserPane.tsx`
#### `src/app/App.css`

**Status**: COMPLETE

```ts
interface FileBrowserPaneProps {
  readonly hideGitIgnored: boolean;
  readonly onToggleGitIgnored: VoidFunction;
}
```

The same component owns the compact-path presentation and directory-information popup. The popup uses only the authoritative directory page and current frontend filter/sort state.

## Task Status

| Task | Deliverables | Status | Depends On |
| --- | --- | --- | --- |
| TASK-001 backend filtering | Rust listing, command, tests | Complete | - |
| TASK-002 frontend control | invoke, state, icon, shortcut, tests | Complete | TASK-001 contract |
| TASK-003 verification | format, lint, tests, launch, visible check | Complete | TASK-001, TASK-002 |
| TASK-004 documentation | README shortcut and feature text | Complete | TASK-002 |
| TASK-005 directory path information | compact path, absolute tree popup, `Tab`/`Esc`, tests | Complete | TASK-002 |

## Completion Criteria

- [x] Git-ignored entries are excluded before counting and pagination when enabled.
- [x] Non-repository and unavailable-Git cases continue listing entries.
- [x] The filter row contains an accessible stateful icon in directory mode only.
- [x] Clicking the icon and pressing `.` reload the directory with the toggled state.
- [x] Navigation, sorting, filtering, pagination, and refresh preserve the state.
- [x] Rust and frontend tests cover the new contract and interactions.
- [x] Full repository verification passes.
- [x] The debug application is rebuilt, launched, and visibly checked when tooling permits.
- [x] README user-facing feature and shortcut documentation is updated.
- [x] Overlong top paths show first/last segments in at most two lines and reveal the full absolute path on hover.
- [x] `Tab` opens an accessible directory-information popup with the full absolute path rendered as a component tree, and `Escape` closes it.

## Progress Log

### Session: 2026-09-03

**Tasks Completed**: TASK-001, TASK-002, TASK-003, TASK-004, TASK-005
**Blockers**: Packaged Rielflow CLI unavailable; using repository-native workflow requirements.
**Notes**: Full Rust and frontend verification passed. The debug app was visibly checked for icon toggling, ignored-entry removal, fixed two-row compact path layout, and the absolute directory-tree popup. Unrelated concurrent capability, symbolic-link, and Git-diff changes were preserved; no combined commit was created.

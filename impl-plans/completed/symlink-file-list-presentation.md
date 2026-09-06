# Symbolic Link File List Presentation Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/design-file-viewer-mode.md#symbolic-link-presentation`
**Created**: 2026-09-03
**Last Updated**: 2026-09-03

---

## Design Document Reference

**Source**: `design-docs/specs/design-file-viewer-mode.md`

### Summary

Expose symbolic-link identity in the directory-listing contract and render symbolic links with a dedicated icon plus their resolved destination in the left file browser.

### Scope

**Included**: Rust directory-entry metadata, the TypeScript invoke contract, left-pane rendering and styling, and focused contract/UI tests.

**Excluded**: Changing link navigation semantics, displaying dangling links, and preserving symlink identity for canonicalized explicit file sets.

---

## Modules

### 1. Directory Listing Contract

#### `src-tauri/src/viewer/types.rs`

**Status**: COMPLETED

```rust
pub struct DirectoryEntry {
    pub is_symlink: bool,
}
```

#### `src-tauri/src/viewer/directory_listing.rs`

**Status**: IN_PROGRESS

```rust
struct DirectoryEntrySeed {
    is_symlink: bool,
}
```

**Checklist**:

- [x] Capture symlink identity without changing target metadata or logical row paths.
- [x] Serialize `is_symlink` for directory and explicit-file-set entries.
- [x] Cover regular files, file links, and directory links in Rust tests.

### 2. Frontend Contract And File Browser

#### `src/lib/tauri/document.ts`

**Status**: COMPLETED

```typescript
export interface DirectoryEntry {
  readonly is_symlink: boolean;
}
```

#### `src/features/file-view/FileBrowserPane.tsx`

**Status**: IN_PROGRESS

**Checklist**:

- [x] Render a dedicated symlink glyph before file/folder glyph selection.
- [x] Render the resolved canonical target as a secondary label for symlinks.
- [x] Include the destination in accessible row naming and tooltip behavior.
- [x] Cover symlink and non-symlink rendering in component tests.

### 3. Styling

#### `src/app/App.css`

**Status**: COMPLETED

**Checklist**:

- [x] Keep long link destinations legible through ellipsis and tooltip fallback.
- [x] Preserve existing file/directory row density and selected-state behavior.

---

## Module Status

| Module | File Path | Status | Tests |
| --- | --- | --- | --- |
| Directory entry contract | `src-tauri/src/viewer/types.rs`, `src-tauri/src/viewer/directory_listing.rs` | COMPLETED | Passed |
| Frontend contract and view | `src/lib/tauri/document.ts`, `src/features/file-view/FileBrowserPane.tsx` | COMPLETED | Passed |
| File-browser styling | `src/app/App.css` | COMPLETED | DOM verified |

## Dependencies

| Feature | Depends On | Status |
| --- | --- | --- |
| Frontend symlink presentation | Rust `DirectoryEntry.is_symlink` contract | COMPLETED |
| Runtime verification | Backend and frontend implementation | COMPLETED |

## Completion Criteria

- [x] Symlink rows use a dedicated symlink icon.
- [x] Symlink rows visibly identify their resolved destination.
- [x] Regular file and directory rows retain their existing presentation.
- [x] Rust and frontend tests pass.
- [x] Mixed-stack lint and verification pass.
- [x] The rebuilt local app launch command was exercised against a symlink fixture.

## Progress Log

### Session: 2026-09-03

**Tasks Completed**: Design alignment and implementation plan creation.
**Tasks In Progress**: Backend contract and frontend presentation.
**Blockers**: Packaged Rielflow runner is unavailable in this checkout, so the workflow structure is being executed locally.
**Notes**: Existing uncommitted Git-ignore visibility work is preserved and treated as concurrent user work.

### Session: 2026-09-03 (completion)

**Tasks Completed**: Backend contract, frontend presentation, focused tests, full mixed-stack verification, debug build, and launch exercise.
**Tasks In Progress**: None.
**Blockers**: Visible Computer Use verification was unavailable in this session; the DOM test verifies the rendered icon and destination text.
**Notes**: `mise run verify` passed with 39 Bun unit tests and 171 Rust tests; 9 focused DOM tests passed. The rebuilt binary was invoked with a temporary symlink fixture, and the already-running singleton app remained active.

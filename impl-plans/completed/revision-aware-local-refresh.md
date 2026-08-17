# Revision-Aware Local Refresh Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/architecture.md#revision-aware-local-refresh
**Created**: 2026-08-17
**Last Updated**: 2026-08-17

---

## Design Document Reference

**Source**: design-docs/specs/architecture.md#revision-aware-local-refresh

### Summary

Refresh the visible local workspace from disk at directory and file granularity,
and invalidate WebView resource caches with backend revision markers.

### Scope

**Included**: Local directory and explicit-file-set listings, active local file
previews, image/PDF resource cache invalidation, error handling, tests, docs, and
runtime launch verification. Direct image previews also gain primary-button drag
panning with touch-style directionality.

**Excluded**: Automatic recursive directory watching, GitHub diff cache policy,
local Git diff reload, and persisted refresh preferences.

---

## Modules

### 1. Backend Preview Revision

#### src-tauri/src/viewer/service.rs

**Status**: COMPLETED

```rust
impl ViewerService {
    pub fn open_file_preview(
        &self,
        path: &Path,
        ui_theme: SyntaxUiTheme,
    ) -> AppResult<FilePreview>;
}
```

**Checklist**:

- [x] Add the source revision marker to direct image resource URLs
- [x] Preserve fresh filesystem reads for every preview request
- [x] Add focused Rust regression tests

### 2. Frontend Workspace Refresh

#### src/features/workspace/WorkspaceShell.tsx

**Status**: COMPLETED

```typescript
const handleReloadCurrent: () => Promise<void>;
```

**Checklist**:

- [x] Reload the active directory or explicit file set
- [x] Reload the active file preview when present
- [x] Keep refresh enabled for directory-only state
- [x] Clear stale preview state when the selected file disappeared
- [x] Preserve dirty Markdown conflict safety
- [x] Add focused workspace tests

### 3. Revision-Bearing Embedded Preview URLs

#### src/features/preview/PdfFilePreviewPane.tsx

**Status**: COMPLETED

```typescript
interface PdfFilePreviewPaneProps {
  readonly path: string;
  readonly fileName: string;
  readonly revision: string;
}
```

**Checklist**:

- [x] Append the backend revision marker to the PDF iframe URL
- [x] Pass the revision from the file preview payload
- [x] Add a component regression test

### 4. Direct Image Drag Panning

#### src/features/preview/PreviewPane.tsx

**Status**: COMPLETED

```typescript
interface PreviewPaneProps {
  readonly dragPanEnabled?: boolean;
}
```

**Checklist**:

- [x] Enable primary-button drag panning only for direct image previews
- [x] Move content with the pointer in touch-style directionality
- [x] Release pointer capture on up, cancellation, or lost capture
- [x] Preserve text selection and interaction for non-image previews
- [x] Add focused DOM regression tests

### 5. User Documentation

#### README.md

**Status**: COMPLETED

**Checklist**:

- [x] Describe workspace refresh behavior and shortcut scope

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Backend preview revision | `src-tauri/src/viewer/service.rs` | COMPLETED | Passed |
| Workspace refresh | `src/features/workspace/WorkspaceShell.tsx` | COMPLETED | Passed |
| PDF cache invalidation | `src/features/preview/PdfFilePreviewPane.tsx` | COMPLETED | Passed |
| Direct image drag panning | `src/features/preview/PreviewPane.tsx` | COMPLETED | Passed |
| User documentation | `README.md` | COMPLETED | N/A |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Workspace refresh | Existing listing and preview commands | Available |
| Resource invalidation | Existing `last_modified` preview fields | Available |
| Direct image drag panning | Existing shared preview zoom and scroll container | Available |
| Runtime verification | Completed frontend and backend work | Completed |

## Completion Criteria

- [x] Directory-only refresh reads and displays current entries
- [x] Active file refresh reads current content while updating the listing
- [x] Image and PDF previews invalidate stable WebView resource URLs by revision
- [x] Deleted active files do not leave stale preview content presented as fresh
- [x] Direct SVG and raster previews support touch-direction primary-button drag panning
- [x] Frontend formatting, lint, typecheck, and tests pass
- [x] Cargo formatting, check, clippy, and tests pass with quiet Cargo output
- [x] Debug app rebuild and local launch succeed
- [x] README refresh documentation is current

## Progress Log

### Session: 2026-08-17

**Tasks Completed**: Root-cause analysis, architecture contract, implementation plan, backend and frontend implementation, tests, documentation, debug build, and launch

**Tasks In Progress**: None

**Blockers**: Packaged Rielflow workflow is unavailable in compatible current format; proceeding with repository-native fallback workflow.

**Notes**: Existing local listing and document services perform fresh reads; the defect was refresh orchestration plus stable WebView resource URLs. Automated verification and debug launch passed. Computer Use attached to a pre-existing process with the same bundle identifier, so visible inspection of the newly launched instance was limited without closing the user's existing app.

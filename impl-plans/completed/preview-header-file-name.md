# Preview Header File Name Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/architecture.md#preview-header-file-identity`
**Created**: 2026-08-18
**Last Updated**: 2026-08-18

## Design Reference

Display the active preview file's basename beside the `Preview` label for every
document preview kind. Preserve the existing secondary metadata and avoid
displaying full filesystem paths.

Out of scope: Rust preview payload changes, Git diff file bars, persisted header
preferences, and changes to preview content rendering.

## Modules and Types

### 1. Shared Preview Header

#### `src/features/preview/PreviewHeader.tsx`

**Status**: COMPLETED

```typescript
interface PreviewHeaderProps {
  readonly fileName: string;
  readonly children: JSX.Element;
}

export function PreviewHeader(props: PreviewHeaderProps): JSX.Element;
```

**Checklist**:

- [x] Render the `Preview` label and selected basename as one left-side group.
- [x] Preserve arbitrary existing right-side header details.
- [x] Truncate long basenames and expose the complete basename via `title`.

### 2. Preview Pane Integration

#### `src/features/preview/*.tsx`
#### `src/features/workspace/WorkspaceDocumentColumn.tsx`

**Status**: COMPLETED

```typescript
interface PreviewFileIdentityProps {
  readonly fileName: string;
}
```

**Checklist**:

- [x] Pass document and preview `file_name` values into shared and dedicated panes.
- [x] Use the shared header for Markdown, generic, CSV, EPUB, PDF, and media previews.
- [x] Preserve subtitles, zoom percentage, pagination, and media shortcut hints.

### 3. Styling and Tests

#### `src/app/App.css`
#### `src/features/preview/*.vitest.tsx`

**Status**: COMPLETED

**Checklist**:

- [x] Add bounded, ellipsized file-name styling.
- [x] Verify shared rendered previews display and reactively update the basename.
- [x] Verify representative dedicated previews display the basename.
- [x] Run formatting, typecheck, tests, and repository verification.

## Module Status

| Module | File Path | Status | Tests |
| --- | --- | --- | --- |
| Shared preview header | `src/features/preview/PreviewHeader.tsx` | COMPLETED | Passed |
| Pane integration | `src/features/preview/*.tsx`, `src/features/workspace/WorkspaceDocumentColumn.tsx` | COMPLETED | Passed |
| Header styling | `src/app/App.css` | COMPLETED | Passed |

## Dependencies

| Feature | Depends On | Status |
| --- | --- | --- |
| Pane integration | Shared preview header | COMPLETED |
| Styling and tests | Shared preview header and pane integration | COMPLETED |

## Completion Criteria

- [x] All active preview kinds display the selected basename beside `Preview`.
- [x] Full filesystem paths are not shown in the preview header.
- [x] Existing header details and preview behavior remain unchanged.
- [x] Frontend formatting, typecheck, and tests pass.
- [x] Full repository verification passes.
- [x] Debug desktop app is rebuilt and launched locally.

## Progress Log

### Session: 2026-08-18

**Tasks Completed**: Design alignment and implementation plan creation
**Tasks In Progress**: None
**Blockers**: None
**Notes**: The packaged Rielflow executable was unavailable in this checkout, so the repository-required specialized TypeScript and verification agents completed the implementation directly. `mise run verify`, `bun run test:dom`, and `git diff --check` passed. The notarized debug app bundle was launched and visible macOS verification confirmed `PREVIEW README.md` while preserving `Rendered HTML` and `100%`.

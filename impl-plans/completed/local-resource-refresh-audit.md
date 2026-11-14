# Local Resource Refresh Audit Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/architecture.md#revision-aware-local-refresh`
**Created**: 2026-09-24
**Last Updated**: 2026-09-24

## Design Document Reference

Audit direct file previews and local resources embedded in documents for stale
WebView content after an explicit workspace refresh. Keep refresh scoped to local
resources and preserve unsaved Markdown behavior.

## Modules

### Workspace refresh generation

`src/features/workspace/WorkspaceShell.tsx`,
`src/features/workspace/WorkspaceDocumentColumn.tsx`:
Track explicit refresh requests and pass a generation to active preview panes.

### Resource URLs

`src/features/preview/PreviewPane.tsx`,
`src/features/preview/PdfFilePreviewPane.tsx`,
`src/features/preview/MediaFilePreviewPane.tsx`:
Ensure local asset URLs change after refresh, including when metadata timestamps
are unchanged. Preserve external URL behavior and newly registered media streams.

### Shortcut help

`src/features/workspace/workspaceShortcuts.tsx`:
Remove redundant “then” from comma-prefixed sort shortcut labels.

## Module Status

| Module | Status | Verification |
| --- | --- | --- |
| Workspace generation | Completed | Workspace DOM test |
| Resource URLs | Completed | Preview DOM tests |
| Shortcut labels | Completed | Shortcut test |

## Dependencies

No Tauri command or payload changes are required. Text, CSV, Markdown body, and
EPUB content are already re-read by the backend. PDF has a revision-bearing URL;
streamed audio/video receive new token URLs.

## Completion Criteria

- [x] All affected local browser resources receive a new URL on explicit refresh.
- [x] Text, CSV, Markdown, EPUB, streamed media, and remote resources retain their valid refresh behavior.
- [x] Comma-prefixed sort labels omit “then”.
- [x] Focused tests, typecheck, build, and app launch complete.

## Progress Log

### Session: 2026-09-24

Audit found the unresolved case in local assets embedded in Markdown: reloading
unchanged Markdown HTML does not rerun enhancement, and the same asset URL may
remain cached. Modification-time-only URL keys also miss rapid edits or files
whose timestamps are preserved.

Added a generation that advances after explicit refresh. Direct images,
Markdown-embedded local media, PDF, and asset-protocol media fallbacks use it to
refresh URLs; remote links and server stream URLs are unchanged. Independent
verification passed 401 DOM tests, 39 Bun tests, typecheck, and Biome. The debug
app rebuilt and launched successfully; visible UI inspection was unavailable.

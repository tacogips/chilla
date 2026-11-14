# Collapsed Pane and SVG Refresh Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/architecture.md#left-pane-toggle`, `design-docs/specs/architecture.md#revision-aware-local-refresh`
**Created**: 2026-09-24
**Last Updated**: 2026-09-24

## Design Document Reference

Add a small left-edge expand tab for a folded browser in file and diff modes.
Apply the backend file revision to a direct image's resolved WebView URL so
refreshing a changed SVG fetches its new content.

## Modules

### Workspace shell and styling

`src/features/workspace/WorkspaceShell.tsx`, `src/app/App.css`:
Render an accessible, compact expand tab only while the browser is folded.
Reuse the existing toggle handler and preserve focus transfer and layout.

### Direct image preview

`src/features/workspace/WorkspaceDocumentColumn.tsx`,
`src/features/preview/PreviewPane.tsx`:
Pass the direct image revision into URL enhancement. Append it only to that
image's resolved URL, preserving embedded Markdown asset behavior.

## Module Status

| Module | Status | Verification |
| --- | --- | --- |
| Workspace tab | Completed | Workspace DOM test |
| Image URL | Completed | Preview DOM test |

## Dependencies

Both changes use existing workspace state and backend preview metadata. No
Tauri command or payload change is needed.

## Completion Criteria

- [x] Folded file and diff panes expose a small clickable expand tab.
- [x] Refreshing a modified SVG changes the resolved image URL.
- [x] Relevant DOM tests, typecheck, build, and app launch complete.

## Progress Log

### Session: 2026-09-24

Confirmed that direct image HTML retains the same bare path across refreshes,
despite a new backend `last_modified` value. The existing WebView asset resolver
therefore receives the same URL.

Added the edge tab with the existing toggle handler, and applied the image
revision to direct image asset URLs. Verified with 397 DOM tests, 39 Bun tests,
typecheck, Biome, and a debug Tauri build. Launched the built app locally;
visible UI inspection was unavailable because Computer Use tools were absent.

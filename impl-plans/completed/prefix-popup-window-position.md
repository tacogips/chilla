# Prefix Popup Window Position

**Status**: Completed
**Design Reference**: [Browser shortcuts](../../design-docs/specs/design-file-viewer-mode.md#yazi-style-browser-shortcuts)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

## Scope and Deliverables

Move the existing prefix popup from the left pane to the bottom-right of the
app viewport using CSS positioning. Keep keyboard behavior unchanged. No TS,
Rust or IPC changes.

| Task | Deliverable | Status |
| --- | --- | --- |
| 1 | Design and README positioning description | Completed |
| 2 | src/app/App.css viewport positioning and bounds | Completed |
| 3 | Stylesheet check and debug build/launch | Completed |

## Completion Criteria

- [x] Popup is fixed bottom-right with viewport-safe width and height.
- [x] Stylesheet checks and debug build pass; updated app launched.

## Progress Log

### 2026-09-09
User clarified the popup belongs at the app window bottom-right, not in the
left pane. CSS-only placement change preserves existing tested behavior.
Independent review confirmed no ancestor containing-block or clipping conflict;
scoped Biome and diff checks passed. Debug Tauri build passed and app launched.
Logs: `/tmp/chilla-popup-position-build.log` and
`/tmp/chilla-popup-position-launch.log`. Visual inspection unavailable; no
TypeScript/Rust changes or full test reruns were necessary.

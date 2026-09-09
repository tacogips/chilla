# Compact Browser Toolbar Implementation Plan

**Status**: Completed
**Design Reference**: [Left Pane Tree View](../../design-docs/specs/design-file-viewer-mode.md#left-pane-tree-view)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

## Deliverables and Tasks

| Task | Deliverables | Status | Dependencies |
| --- | --- | --- | --- |
| 1 | FileBrowserPane and shared SVG glyphs: icon mode controls, right-aligned filter/ignore, hidden filter reveal/focus, tests | Completed | None; parallelizable |
| 2 | PrDiffWorkspace: matching icon toolbar and filter reveal, tests | Completed | Shared glyph exports from 1; otherwise parallelizable |
| 3 | App.css, README, independent checks, debug build/launch | Completed | 1 and 2 |

## Behavior and Scope

Retain the current view toolbar row beneath the pane title. Mode buttons stay on
the left; filter and directory-only Git-ignore controls sit on its right edge.
Plain `/` reveals/focuses filtering outside editable/composing inputs. Escape
clears/hides it and restores usable focus. Icon clicks reveal/focus without
clearing an active query. No Filter heading. Existing t, dot, sorting, preview,
Tree cache/lazy loading and explicit-file-set contracts remain intact.

## Completion Criteria

- [x] Icon-only List/Tree, right-aligned filter/ignore controls.
- [x] Filter hidden by default, revealed and focused by icon or /.
- [x] Escape clears/hides filter and restores focus; queries remain visible.
- [x] Accessible labels/tooltips and mode/expanded states provided.
- [x] Directory, explicit-file-set and diff interactions verified.
- [x] Lint/typecheck/tests, debug rebuild and launch complete.

## Progress Log

### 2026-09-09
User requested a compact icon toolbar and on-demand filter textbox. Preserve all
prior working-tree changes and lazy-loading improvements; no backend changes.

Implemented shared SVG toolbar icons, accessible buttons, right-aligned actions,
and conditionally mounted searchboxes for directory/explicit-file-set/diff views.
Regression checks caught and fixed delayed row-focus stealing after filter reveal
and a detached list reference preventing empty-list fallback focus. Updated
shortcut help and README.

Independent verification passed: `CARGO_TERM_QUIET=true mise run verify`
(typechecks, Biome, Rust format/Clippy, 39 Bun tests, 173 Rust tests), and
`bun run test:dom` (201 tests / 16 files). No significant remaining findings.

Debug build passed with `CARGO_TERM_QUIET=true bun run tauri build --debug
--no-bundle` (log `/tmp/chilla-toolbar-build.log`). Launched
`target/debug/chilla` from the repository root with output redirected to
`/tmp/chilla-toolbar-launch.log`; observed the new process running and left it
open per the user's launch preference. Earlier app instances preserved. Launch
log empty; visible UI automation unavailable, so no visual inspection claimed.

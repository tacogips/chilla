# Pair View: Hidden-Pane Zoom Regression Test

**Status**: Completed
**Plan ID**: pair-view-hidden-zoom-regression
**Wave**: 2 (depends on pair-view-preview-guard, pair-view-component)
**Design Reference**: design-docs/specs/design-pair-view.md (Layout "Hidden-pane shortcut suppression"; Validation "Hidden-pane zoom regression")
**Created**: 2026-11-15
**Last Updated**: 2026-11-15

---

## Intent And Context

This plan proves end to end, in jsdom, that a hidden pair pane keeps its zoom
when `+` or `-` is pressed and that the visible pane still zooms. The test
uses the real rendering path, `PairView` -> `WorkspaceDocumentColumn` ->
`PreviewPane`, for both an image preview and a rendered Markdown preview.
This test fails without the `pair-view-preview-guard` change and passes with
it.

Inputs: `PairView`, `PairViewProps.loadPreview`, and the DOM hooks
`data-pair-pane` and `data-pair-restore` pinned in
`impl-plans/completed/pair-view-component.md`. Zoom is read via the
`--preview-zoom-scale` custom property, as in
`src/features/preview/PreviewPane.vitest.tsx` (around lines 106-110 and 608).

## Non-Goals

- Test-only plan. Do not edit `PairView.tsx`, `PreviewPane.tsx`, or any other
  source file. If the test exposes a defect in another plan's file, record it
  in the progress log as a finding for review instead of fixing it here.

## File-Level Changes

### `src/features/pair-view/PairViewHiddenZoom.vitest.tsx` (new)

- Mock `@tauri-apps/api/core` and other Tauri modules as needed, following
  `src/features/workspace/WorkspaceDocumentColumn.vitest.tsx`.
- Fixtures: an image `FilePreview` and a markdown `FilePreview` with rendered
  HTML. Take the shapes from existing fixtures in
  `src/features/workspace/WorkspaceDocumentColumn.vitest.tsx` or
  `src/lib/tauri/document.vitest.ts`; do not invent fields.
- Wait for both panes to finish loading before dispatching keys.
- Cases, each for image/image and markdown/markdown:
  - Both visible, window keydown `+` -> both panes' scale is `1.1`.
  - Click "Hide left pane", then dispatch `+` and `-` and `+` (net +1 step)
    -> the right pane's scale changed; the left pane's scale equals its value
    before hiding. Click "Show left pane" -> the left scale is still the
    pre-hide value, so restore preserves state.
  - The symmetric case with the right pane hidden.
- Scope each zoom-surface query to its `section[data-pair-pane=...]`.

## Invariants

- The test must not depend on layout (jsdom). Use attribute and CSS-variable
  reads only.

## Overwrite Safety

The new file is owned exclusively by this plan. Re-read it before each edit.

## Verification (run from repository root)

1. `bunx vitest run --config vitest.config.ts src/features/pair-view/PairViewHiddenZoom.vitest.tsx`
   must exit 0, with all cases passing.
2. Show that the test exercises the guard without modifying other files:
   quote in the progress log the selector the left-hidden assertion uses. It
   must target a `PreviewPane` element inside
   `section[data-pair-pane="left"][hidden]`.
3. `bunx biome check src/features/pair-view/PairViewHiddenZoom.vitest.tsx --diagnostic-level=warn`
   must exit 0.

## Completion Criteria

- [x] Image and Markdown hidden-zoom regression cases (both sides) pass
- [x] Both-visible zoom case passes
- [x] biome clean
- [x] Progress log updated

## Progress Log

### Session: 2026-11-15

Added six image and Markdown cases through the real pair, document column and
preview components. The left-hidden assertion uses
`section[data-pair-pane="left"][hidden] .preview__zoom-surface`.
The symmetric right-hidden assertion also checks that the mounted surface and
its zoom survive restoration. No other source file was edited by this plan.

- `bunx vitest run --config vitest.config.ts src/features/pair-view/PairViewHiddenZoom.vitest.tsx`: exit 0, 6 passed; `tmp/pair-view-20261115-01/pair-view-hidden-zoom-regression/attempt-1/vitest.log`.
- `bunx biome check src/features/pair-view/PairViewHiddenZoom.vitest.tsx --diagnostic-level=warn`: exit 0; `tmp/pair-view-20261115-01/pair-view-hidden-zoom-regression/attempt-1/biome.log`.
- `bun run typecheck`: exit 0; `tmp/pair-view-20261115-01/pair-view-hidden-zoom-regression/attempt-1/typecheck.log`.

Formal review and workflow finalization remain downstream. These checks ran on
the shared working tree.

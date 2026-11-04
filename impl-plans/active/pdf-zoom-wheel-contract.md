# PDF Inline Rendering: Shared Modifier-Wheel Zoom Contract Implementation Plan

**Status**: Ready
**Design Reference**: `design-docs/specs/design-pdf-inline-rendering.md#shared-zoom-input-contract`, `design-docs/specs/architecture.md#shared-rendered-preview-zoom`
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

## Dispatch metadata

```json
{
  "planId": "pdf-zoom-wheel-contract",
  "planPath": "impl-plans/active/pdf-zoom-wheel-contract.md",
  "dependsOn": [],
  "writePaths": [
    "src/features/preview/PreviewPane.tsx",
    "src/features/preview/PreviewPane.vitest.tsx",
    "impl-plans/active/pdf-zoom-wheel-contract.md"
  ],
  "sharedPaths": [],
  "workflowMode": "issue-resolution",
  "progressPath": "impl-plans/active/pdf-zoom-wheel-contract.md"
}
```

## Intent and context

The user wants `Alt` (Option) + mouse wheel to zoom every visual preview, using
the same zoom state as `+`/`-`. Today `PreviewPane` handles only `Ctrl` + wheel
(`src/features/preview/PreviewPane.tsx:PreviewPane`, the `handleWheel` closure
at about line 667). This plan pins the single shared predicate that the PDF
pane (`pdf-canvas-pane`) and the video pane (`pdf-video-zoom`) will import, and
applies it to `PreviewPane`. That covers Markdown, rendered text/source, image
and SVG previews.

## Non-goals

- Do not change the clamp values (50-300% rendered, 50-800% images), the step
  (10), the keyboard handler, or drag panning.
- Do not touch `MediaFilePreviewPane.tsx`, `PdfFilePreviewPane.tsx`, `App.css`,
  the keymap files or `README.md`. Other plans own them.
- Do not add a zoom store, a context or persisted state. Zoom stays pane-local.

## File-level changes

### `src/features/preview/PreviewPane.tsx`

- Export the existing type alias as
  `export type PreviewZoomDirection = "in" | "out";`. It is currently
  module-private.
- Add an exported helper next to `nextPreviewZoom`:
  `export function previewZoomDirectionFromWheel(event: WheelEvent): PreviewZoomDirection | null`.
  - It returns `null` unless `(event.altKey || event.ctrlKey) && event.deltaY !== 0`.
  - It returns `"in"` when `deltaY < 0` and `"out"` when `deltaY > 0`.
  - It is a pure function: it must not call `preventDefault`. Callers decide.
- Also export the existing bounds so the other panes reuse them instead of
  copying literals: `PREVIEW_ZOOM_MIN`, `RENDERED_PREVIEW_ZOOM_MAX`, and
  `IMAGE_PREVIEW_ZOOM_MAX` (keep their values). `nextPreviewZoom` is already
  exported.
- Rewrite `handleWheel` inside `PreviewPane` so that:
  1. it returns early when `!props.visible`;
  2. it calls the helper;
  3. when the helper returns `null`, it returns without `preventDefault`;
  4. otherwise it calls `event.preventDefault()` then `adjustZoom(direction)`.
  Keep the `{ passive: false }` registration on `previewRef` unchanged.

### `src/features/preview/PreviewPane.vitest.tsx`

Follow the existing test
`"handles Ctrl+wheel over the preview without changing ordinary wheel behavior"`
(about line 630) and its `previewZoomText()` helper.

## Pitfalls

- `altKey` with `deltaY === 0` (a horizontal-only trackpad swipe) must not be
  prevented, or horizontal scrolling breaks.
- `Alt` and `Ctrl` held together still zoom one step. Do not double-step.
- Do not move the listener to `window`. It must stay on the pane body, so a
  wheel over the sidebar does not zoom.
- Keep the module free of new imports. The helper must remain usable from the
  other two panes without a circular import (those panes import
  `PreviewPane.tsx`; `PreviewPane.tsx` must not import them).

## Test cases to add

- Alt + wheel with `deltaY: -1` -> `defaultPrevented === true` and the header
  shows `110%`. With `deltaY: 1` -> back to `100%`.
- Alt + wheel with `deltaY: 0` -> not prevented, zoom unchanged.
- The existing Ctrl+wheel test keeps passing unchanged.
- Plain wheel -> not prevented (already covered; keep it).
- Alt + wheel on a hidden pane (`visible={false}`) -> not prevented, zoom
  unchanged.
- Alt + wheel past 300% on rendered content -> clamped at `300%`.
- Unit tests for `previewZoomDirectionFromWheel`:
  - `{altKey, deltaY:-3}` -> `"in"`;
  - `{ctrlKey, deltaY:2}` -> `"out"`;
  - `{deltaY:-1}` -> `null`;
  - `{altKey, deltaY:0}` -> `null`.

## Invariants

- `+`/`-` keyboard behavior, image drag panning, and the anchor/enhancement
  effects are byte-for-byte unchanged apart from the wheel handler.
- Every existing test in `PreviewPane.vitest.tsx` still passes unmodified.

## Verification (scoped to this plan)

Run each command in the foreground and record its exit status and output
location in the progress log:

1. `bunx vitest run --config vitest.config.ts src/features/preview/PreviewPane.vitest.tsx`
   -> exit 0, with the new tests listed as passed.
2. `bun run typecheck` -> exit 0. The sibling plan `pdf-pdfjs-foundation`
   runs concurrently. If typecheck errors appear only in its in-progress files
   (`src/features/preview/pdfjs*.ts`, `vite.config.ts`), record them as
   sibling noise and confirm with
   `bunx tsc --noEmit 2>&1 | grep -v "pdfjs"` that this plan's files have no
   errors. Do not edit sibling files.
3. `bunx biome check src/features/preview/PreviewPane.tsx src/features/preview/PreviewPane.vitest.tsx --diagnostic-level=warn`
   -> exit 0.

## Done criteria

- [ ] `grep -n "export function previewZoomDirectionFromWheel" src/features/preview/PreviewPane.tsx` matches.
- [ ] `grep -n "export type PreviewZoomDirection" src/features/preview/PreviewPane.tsx` matches.
- [ ] `PREVIEW_ZOOM_MIN`, `RENDERED_PREVIEW_ZOOM_MAX` and `IMAGE_PREVIEW_ZOOM_MAX` are exported.
- [ ] All three verification commands exit 0.
- [ ] The progress log is updated.

## Concurrency and drift rules

- Before each edit, read the target file fresh. Record a `shasum -a 256` of
  each owned file before the first edit and after the last edit in the
  progress log.
- If another plan changes an owned file (unexpected hash), stop and record the
  drift. Do not overwrite; repair happens serially after the join.
- Edit only the `writePaths`. No git operations.

## Progress Log

### Session: 2026-11-04
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Wave 1. `pdf-canvas-pane` and `pdf-video-zoom` depend on the exported helper and constants.

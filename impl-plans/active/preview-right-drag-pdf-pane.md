# Preview Right-Drag Pan: PDF Pane Wiring Implementation Plan

**Status**: Ready
**Plan ID**: preview-right-drag-pdf-pane
**Wave**: 2 (depends on preview-right-drag-helper)
**Design Reference**: design-docs/specs/architecture.md#shared-preview-right-drag-pan
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

`PdfFilePreviewPane` pans its `.pane__body.preview--pdf` element (`body` ref)
on a right-button drag. This file holds PART A pdf.js canvas work
(load generation, render cancellation, keyboard and wheel zoom at about lines
140-180), which must be preserved.

Pinned dependency:
`attachRightDragPan(target: HTMLElement, isActive: () => boolean): () => void`.

## Non-Goals

- Do not edit `rightDragPan.ts`, `pdfjs.ts`, `App.css`, `README.md` or the other
  panes and their tests.
- Do not change PDF loading, rendering, zoom or the error UI. No text layer.

## File-Level Changes

### `src/features/preview/PdfFilePreviewPane.tsx`

- Import `attachRightDragPan`.
- In the `onMount` that defines `hidden()` and registers
  `body?.addEventListener("wheel", ...)` (about lines 146-175), attach it to
  `body` when defined, with `isActive = () => !hidden()`, reusing the existing
  `hidden` closure. Detach in the matching `onCleanup`.

### `src/features/preview/PdfFilePreviewPane.vitest.tsx`

Add local `pointerEvent` (with `buttons`) and pointer-capture stub helpers that
imitate `PreviewPane.vitest.tsx`. Keep the `./pdfjs` module mock and the
`mount()` helper (about line 70).

Cases:
- PDF body: right down (20,30) with scroll (100,80), move (45,55) with
  buttons=2 -> scroll (75,55), move prevented.
- A right click with no move, up, contextmenu -> not prevented. A 30px drag,
  up, contextmenu -> prevented.
- The pane is inside a `.pane--hidden` ancestor -> no scroll.

## Invariants

- All existing PdfFilePreviewPane tests (reload/destroy, render/zoom, render
  cancellation, error fallback, stale loads) pass unchanged.
- No real pdf.js runs under jsdom.

## Concurrency And Drift

Only this plan writes these files. Before each edit, re-read the file and
record pre/post sha256. On drift, re-apply only this plan's hunks. No git
checkout/stash/restore. If the helper contract is missing or different, stop
and report a blocker.

## Verification

Foreground. Logs go to `tmp/preview-right-drag/pdf-pane/<command>.log`, with
the exit status recorded:
1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bun run test:dom src/features/preview/PdfFilePreviewPane.vitest.tsx`
   -> exit 0, zero failures.
2. `bun run typecheck` -> exit 0.
3. `bunx biome check src/features/preview/PdfFilePreviewPane.tsx src/features/preview/PdfFilePreviewPane.vitest.tsx --diagnostic-level=warn`
   -> exit 0.

## Completion Criteria

- [ ] The helper is attached to `body` with `!hidden()` and detached on cleanup
- [ ] PDF pan, contextmenu both ways and hidden cases pass
- [ ] Scoped commands exit 0, with logs recorded
- [ ] Progress log updated

## Progress Log

(Worker appends one entry per session here only.)

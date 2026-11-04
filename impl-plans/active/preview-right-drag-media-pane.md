# Preview Right-Drag Pan: Video Pane Wiring Implementation Plan

**Status**: Ready
**Plan ID**: preview-right-drag-media-pane
**Wave**: 2 (depends on preview-right-drag-helper)
**Design Reference**: design-docs/specs/architecture.md#shared-preview-right-drag-pan
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

The video branch of `MediaFilePreviewPane` (`kind === "video"`) pans its
`.pane__body` (`bodyRef`) on a right-button drag. Audio is not a target. Images
are rendered by `PreviewPane`, not here. This file holds PART A video
zoom work (`handleZoomWheel`, `handleZoomKeyDown`), which must be preserved.

Pinned dependency:
`attachRightDragPan(target: HTMLElement, isActive: () => boolean): () => void`.

## Non-Goals

- Do not edit `rightDragPan.ts`, `App.css`, `README.md`, `PreviewPane*`, or
  `PdfFilePreviewPane*`.
- Do not change the video and audio Space/seek handling, the zoom, the source
  attach logic or the Linux fallback UI.

## File-Level Changes

### `src/features/preview/MediaFilePreviewPane.tsx`

- Import `attachRightDragPan`.
- In the `onMount` that registers `bodyRef?.addEventListener("wheel", ...)`
  (about line 317), attach it to `bodyRef` when defined. Use
  `isActive = () => isVideo() && bodyRef.closest(".pane--hidden, [hidden], [aria-hidden='true']") === null`,
  which imitates the existing hidden checks at about lines 276 and 304. Detach
  in the matching `onCleanup`.
- Pitfall: `kind` is reactive (line 144). Gate with `isVideo()` inside
  `isActive` at event time instead of attaching conditionally at mount.

### `src/features/preview/MediaFilePreviewPane.vitest.tsx`

Add local `pointerEvent` and pointer-capture stub helpers that imitate
`PreviewPane.vitest.tsx:pointerEvent` / `previewBodyWithPointerCapture`,
including the `buttons` argument. Use the same mount setup as the existing
"zooms video with keys and modifier wheel" test (about line 56).

Cases:
- Video: right down (20,30) with body scroll (100,80), move (45,55) with
  buttons=2 -> scroll (75,55), move prevented.
- Video: a right click with no move, up, contextmenu -> not prevented. A 30px
  drag, up, contextmenu -> prevented.
- Video in a hidden pane (wrap it in `.pane--hidden` or use the existing
  hidden-pane setup) -> no scroll.
- Audio: a right drag does not scroll (not a target).

## Invariants

- All existing MediaFilePreviewPane tests pass unchanged.
- PART A hunks are untouched.

## Concurrency And Drift

Only this plan writes these files. Before each edit, re-read the file and
record pre/post sha256. On drift, re-apply only this plan's hunks. No git
checkout/stash/restore. If the helper contract is missing or different, stop
and report a blocker.

## Verification

Foreground. Logs go to `tmp/preview-right-drag/media-pane/<command>.log`,
with the exit status recorded:
1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bun run test:dom src/features/preview/MediaFilePreviewPane.vitest.tsx`
   -> exit 0, zero failures.
2. `bun run typecheck` -> exit 0.
3. `bunx biome check src/features/preview/MediaFilePreviewPane.tsx src/features/preview/MediaFilePreviewPane.vitest.tsx --diagnostic-level=warn`
   -> exit 0.

## Completion Criteria

- [ ] The helper is attached to `bodyRef`, gated to video and not hidden, and
      detached on cleanup
- [ ] Video pan, contextmenu both ways, hidden and audio cases pass
- [ ] Scoped commands exit 0, with logs recorded
- [ ] Progress log updated

## Progress Log

(Worker appends one entry per session here only.)

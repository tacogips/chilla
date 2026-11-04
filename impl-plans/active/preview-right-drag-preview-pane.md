# Preview Right-Drag Pan: PreviewPane Wiring Implementation Plan

**Status**: Superseded by preview-pan-zoom-preview-pane (design-docs/specs/architecture.md#shared-preview-pan-and-zoom-gestures); do not dispatch
**Plan ID**: preview-right-drag-preview-pane
**Wave**: 2 (depends on preview-right-drag-helper)
**Design Reference**: design-docs/specs/architecture.md#shared-preview-right-drag-pan
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

Wire `attachRightDragPan` from `src/features/preview/rightDragPan.ts` into
`PreviewPane`, so rendered Markdown, the `layout="source"` view and direct image
previews (`dragPanEnabled`) pan on a right-button drag. `PreviewPane.tsx` and
its vitest file already contain PART A work (wheel zoom
`previewZoomDirectionFromWheel`), which must be preserved.

Pinned dependency:
`attachRightDragPan(target: HTMLElement, isActive: () => boolean): () => void`
and `RIGHT_DRAG_PANNING_CLASS = "preview--right-drag-panning"`.

## Non-Goals

- Do not edit `rightDragPan.ts`, `App.css`, `README.md`, the Media or Pdf panes,
  or their tests.
- Do not change the left-button `dragPanEnabled` pan logic
  (`PreviewPane.tsx` `handlePointerDown` with `button === 0`/`isPrimary`,
  `finishDrag`, about lines 690-770), the wheel or keyboard zoom, or link-click
  handling.

## File-Level Changes

### `src/features/preview/PreviewPane.tsx`

- Import `attachRightDragPan`.
- In the existing `PreviewPane` `onMount`, after the existing listener
  registration on `preview` (the `previewRef` `.pane__body` element), call
  `attachRightDragPan(preview, () => props.visible)` and call the returned
  detach function inside the existing `onCleanup`.
- Pitfall: the target must be `preview` (the scroll container used by wheel
  zoom and the left pan), not `container`.
- Pitfall: `isActive` must read `props.visible` at event time (closure), not
  capture its value at mount.

### `src/features/preview/PreviewPane.vitest.tsx`

- Extend `pointerEvent(type, pointerId, clientX, clientY, button = 0)` with an
  optional `buttons` argument. Default for `pointerdown`/`pointermove`: the bit
  for `button` (0->1, 1->4, 2->2). Default for `pointerup`/`pointercancel`/
  `lostpointercapture`: 0. Existing calls must keep passing unchanged.
- Change the test "ignores non-primary mouse buttons for direct-image drag
  panning" to use button `1` (middle) instead of `2`. Its assertions stay the
  same.
- New `describe` or `it` cases, using `renderPreview` and
  `previewBodyWithPointerCapture`:
  - Rendered Markdown (`dragPanEnabled` false): right down (20,30) with scroll
    (100,80), move (45,55) -> scroll (75,55), move prevented.
  - `layout="source"` -> same right-drag result. If `renderPreview` cannot pass
    `layout`, add a parameter in the local test helper only.
  - Direct image (`dragPanEnabled` true): a right drag pans, and the existing
    left-button pan tests still pass.
  - Right click with no move (or a 2px move), up, contextmenu -> not prevented.
    A 30px drag, up, contextmenu -> prevented.
  - `visible={false}` -> a right drag does not scroll.
  - Left-button drag on rendered Markdown (`dragPanEnabled` false) -> no
    scroll, not prevented.
  - Chord-release regression (design Verification, 7 steps): right down
    buttons=2, pan past the threshold, move buttons=3 still pans, move buttons=1
    -> not prevented, scroll unchanged, class
    `preview--right-drag-panning` removed, `releasePointerCapture` called;
    further buttons=1 moves are inert; contextmenu prevented; a new right
    gesture pans again.

## Invariants

- Every existing PreviewPane vitest case (wheel zoom, keyboard zoom, clamps,
  left image pan, cancel and lost capture) passes unchanged, except the
  intentional button-2 to button-1 edit.
- PART A hunks are not reverted or reformatted.

## Concurrency And Drift

Only this plan writes these two files. Before each edit, re-read the file and
record pre/post `shasum -a 256`. On unexpected drift, re-read and re-apply only
this plan's hunks. No git checkout/stash/restore and no concurrent git
commands. If `rightDragPan.ts` does not exist or its signature differs from the
pinned contract, stop and report a blocker; do not edit it.

## Verification

Foreground. Logs go to `tmp/preview-right-drag/preview-pane/<command>.log`,
with the exit status recorded:
1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bun run test:dom src/features/preview/PreviewPane.vitest.tsx`
   -> exit 0, zero failures, including the new cases.
2. `bun run typecheck` -> exit 0.
3. `bunx biome check src/features/preview/PreviewPane.tsx src/features/preview/PreviewPane.vitest.tsx --diagnostic-level=warn`
   -> exit 0.

## Completion Criteria

- [ ] PreviewPane attaches and detaches the helper on `previewRef` with
      `props.visible`
- [ ] Button-2 test changed to button 1
- [ ] Rendered, source, image, contextmenu both ways, hidden, left-button and
      chord-release cases pass
- [ ] Scoped commands exit 0, with logs recorded
- [ ] Progress log updated

## Progress Log

(Worker appends one entry per session here only.)

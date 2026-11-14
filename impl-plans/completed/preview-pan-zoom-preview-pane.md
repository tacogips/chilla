# Preview Pan And Zoom: PreviewPane Wiring Implementation Plan

**Status**: Completed
**Plan ID**: preview-pan-zoom-preview-pane
**Wave**: 2 (depends on preview-pan-zoom-module)
**Design Reference**: design-docs/specs/architecture.md#shared-preview-pan-and-zoom-gestures
**Supersedes**: preview-right-drag-preview-pane
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

`PreviewPane` renders Markdown (rendered layout), text/source previews
(`layout="source"`) and direct images (`dragPanEnabled`). This plan wires
the shared module `src/features/preview/previewPanZoom.ts`, pinned by
`preview-pan-zoom-module`:

- right/middle drag pan with fling on all three, plus left drag with fling
  on images;
- smooth `Ctrl`/`Cmd`+wheel zoom anchored at the pointer;
- removal of the PART A `Alt`+wheel zoom.

The working tree holds PART A hunks in these files: `previewZoomDirectionFromWheel`
and its tests. Review those hunks and fix real defects only. Do not revert
unrelated PART A changes.

## Non-Goals

- Do NOT delete the exported `previewZoomDirectionFromWheel` from
  `PreviewPane.tsx` in this plan. The sibling plans
  `preview-pan-zoom-media-pane` and `preview-pan-zoom-pdf-pane` still import
  it during wave 2. Stop using it inside `PreviewPane` only. Deletion belongs
  to `preview-pan-zoom-finalize`.
- No `App.css` or `README.md` edits, and no edits to the module, the media
  pane or the PDF pane.
- No change to the source layout CSS, the metadata footer or keyboard zoom
  semantics.

## File-Level Changes

### `src/features/preview/PreviewPane.tsx`

**Remove the old handlers**

- Remove the local `dragState`, `finishDrag` and `handlePointer*`
  left-button pan block and its listener registrations. Replace it with one
  `attachPreviewPan(preview, {...})` call in `onMount`, with `detach()` in
  `onCleanup`. Options:
  - `isActive: () => props.visible`
  - `leftButton: () => props.dragPanEnabled === true`
  - `scrollOwner: () => sourceScrollOwner()`

**Source scroll owner**

- Add a local `sourceScrollOwner(): HTMLElement`. When
  `props.layout === "source"` it returns
  `previewRef.querySelector(".preview__source-content > .file-preview--text > pre")`
  if that element exists, else `previewRef`.
- Resolve it per call. Never cache the element, because `innerHTML`
  replacement swaps the `pre`.

**Wheel zoom**

- Replace `handleWheel` with this order:
  1. Return if `!props.visible`.
  2. Compute `max` (`IMAGE_PREVIEW_ZOOM_MAX` if `dragPanEnabled`, else
     `RENDERED_PREVIEW_ZOOM_MAX`).
  3. Call `const next = applyWheelZoom(event, zoom(), max)`. If it is
     `null`, return. A plain or `Alt` wheel scrolls natively.
  4. Resolve `owner = sourceScrollOwner()` and the anchor:
     `owner` itself in source layout; otherwise
     `previewRef.querySelector(".preview__zoom-surface") ?? owner`.
  5. Take `before = measureAnchor(owner, anchor)`.
  6. Call `setZoom(next)`. Solid updates the style synchronously.
  7. Take `after = measureAnchor(owner, anchor)`.
  8. Call `anchorScrollAfterZoom(owner, event, before, after, next / old)`.
- Keep exactly one wheel listener, on `previewRef`.
- The module's passive wheel listener only stops a fling. That is
  intentional and is not a second zoom.

**Document change and header**

- Add `createEffect(on(() => [props.html, props.layout], () =>
  panHandle?.stopFling(), { defer: true }))` or an equivalent tracked
  effect.
- Header: render `Math.round(zoom())%`. `adjustZoom` and `nextPreviewZoom`
  are unchanged.

**Keep**

- `previewZoomDirectionFromWheel` stays exported but is unused here.
- `nextPreviewZoom`, the constants, `previewZoomStyle` and the click and
  keydown handlers are unchanged.

### `src/features/preview/PreviewPane.vitest.tsx`

Extend `pointerEvent(type, pointerId, clientX, clientY, button = 0, buttons?,
timeStamp?)`. `buttons` defaults to the bit for `button` on
`pointerdown`/`pointermove` and to `0` on `pointerup`. `timeStamp` is set
through `defineProperty`. Stub `requestAnimationFrame` and `matchMedia` in
the tests that need them, and restore them.

**Replace these PART A tests**

- "maps modifier-wheel gestures without preventing their defaults" is
  replaced by: `Alt`+wheel and a plain wheel are not prevented and the zoom
  text is unchanged.
- "zooms with Alt wheel, ignores horizontal gestures, and clamps" becomes a
  `Ctrl`/`Meta` smooth zoom test:
  - `ctrlKey, deltaY:-100` -> zoom text `116%` (`100*exp(0.15)` = 116.18,
    rounded).
  - `metaKey` works the same.
  - Large deltas clamp at `300%`/`50%` (rendered) and `800%` (image).
  - `deltaY:0` -> not prevented.
- "ignores Alt wheel on a hidden pane" becomes: a hidden pane ignores
  `Ctrl`+wheel (not prevented).

**Update existing tests**

- Where "handles Ctrl+wheel over the preview ..." and the clamp tests
  assert exact 10% steps after a wheel, change them to the smooth values.
  Keyboard step tests ("zooms with plus and minus keyboard shortcuts") stay
  unchanged.
- "ignores non-primary mouse buttons for direct-image drag panning" uses
  button 2. Right now pans, so change it to assert that a left drag on NON-image
  rendered content does not pan and that button 2 on an image pans after
  the slop (not the left path).
- Existing image left-pan tests ("pans a direct image ...", "ends image
  dragging on cancel ...") move by more than 4px. Adjust only the
  assertions that relied on sub-slop movement scrolling.

**Add tests (`situation -> expected`)**

- Rendered Markdown, right drag by 10px -> `previewRef` scroll changes by
  -10. `contextmenu` after release is prevented. A plain right-click is not.
- Rendered, middle drag -> pans. A following contextmenu is not prevented.
- Rendered, left drag -> no scroll, the press is not prevented (text
  selection intact).
- Image, left drag then release with velocity -> a frame is scheduled. Run
  frames: the scroll keeps moving and then stops.
- Reduced motion `matches:true` -> no fling.
- Hidden pane (`visible={false}`) -> a right drag does not pan.
- Anchoring, rendered: stub `previewRef.getBoundingClientRect` at
  `{left:0, top:0}` and the `.preview__zoom-surface` rect to scale with
  zoom. A `Ctrl`+wheel at clientY 200 with scrollTop 100 -> scrollTop equals
  `anchoredZoomScroll(100, 200, o, o, ratio)`.
- Source (`layout="source"`, overflowing `pre`):
  - A right drag changes the `pre`'s `scrollLeft`/`scrollTop` while
    `.preview--source` offsets stay 0.
  - A `Ctrl`+wheel anchor writes the `pre` offsets using its 8px padding:
    expected `8 + (s + p - 8) * r - p`.
  - The footer is still the `pre`'s next sibling with font size 12px.
  - The existing source layout test still passes unchanged.
- Source fling then `props.html` replaced (setter signal) -> `stopFling`
  fires. Queued frames write neither the old nor the new `pre`.
- A wheel event over the source `pre` zooms exactly once (zoom text equals a
  single factor application).
- Chord release (rendered):
  1. `pointerdown(2, buttons 2)`, then a move past the slop pans.
  2. `pointermove(buttons 3)` still pans.
  3. `pointermove(buttons 1)` -> not prevented and scroll unchanged.
  4. `contextmenu` -> prevented.
  5. A new right press pans again.

Imitate `PreviewPane.vitest.tsx:previewBodyWithPointerCapture` and
`ctrlWheelUp`.

## Invariants

- Link clicks (the `handleClick` `openUrl` path), text selection and
  keyboard `+`/`-` behavior are unchanged.
- The source metadata footer is never scrolled or scaled.
- There is exactly one zoom-handling wheel listener per pane.

## Change Safety

- Re-read each file fresh before editing. Record pre/post `shasum -a 256` of
  both owned files in the progress log.
- Do not edit files outside writePaths, and run no git mutations.
- If `previewPanZoom.ts` lacks a pinned export, stop and record a blocker.
  Do not edit the module.

## Verification

Run in the foreground and record each exit code and log path under
`tmp/preview-pan-zoom/preview-pan-zoom-preview-pane/`:

1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/PreviewPane.vitest.tsx`
   must exit 0.
2. `bunx biome check src/features/preview/PreviewPane.tsx src/features/preview/PreviewPane.vitest.tsx --diagnostic-level=warn`
   must exit 0.
3. `bun run typecheck` must show no errors in the owned files. Record
   sibling-file errors without fixing them.

## Completion Criteria

- [x] `attachPreviewPan` and the shared wheel zoom are wired. The old
      `dragState` code is removed.
- [x] The source scroll owner is the inner `pre`, and the source tests prove
      it.
- [x] Alt+wheel does not zoom. `Ctrl`/`Meta` zoom smoothly and stay anchored.
      The clamps hold.
- [x] `previewZoomDirectionFromWheel` still exists but is unused in
      `PreviewPane`.
- [x] Owned tests, biome and typecheck pass. The progress log is updated.

## Progress Log

### Session: 2026-11-04
**Tasks Completed**: Plan created
**Blockers**: None

### Session: 2026-11-04 — implementation
**Tasks Completed**: Shared pan and anchored wheel zoom wiring, source scroll-owner resolution, document-change fling cancellation, and owned gesture tests. Formal review and plan archival remain downstream.
**Verification**: `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/PreviewPane.vitest.tsx` exit 0 (33 passed); `bunx biome check src/features/preview/PreviewPane.tsx src/features/preview/PreviewPane.vitest.tsx --diagnostic-level=warn` exit 0; `bun run typecheck` exit 0. Complete logs: `tmp/preview-pan-zoom/preview-pan-zoom-preview-pane/{vitest-final,biome-final,typecheck-final}.log`. These checks ran on the shared working tree.
**SHA-256**: Pre-edit `PreviewPane.tsx` 58ac063f0a8a279fbef10ed51c91c5b8391f4fc4e247240cabc839193ce0ce81, `PreviewPane.vitest.tsx` 58cdddd1326d3ab881fc1fb257a85d342f189df197b915623468d15821a12fd5; post-edit respectively 0369deb1aa350478c229c8745fcac90fd886d2e152866ea3b543c4a655a340f8 and 2d03fc4c7dddd72baa277e93cfc6c9b559f48fb219687caf192e338256989507. Full records and per-edit intentions are in `tmp/preview-pan-zoom/preview-pan-zoom-preview-pane/`.
**Blockers**: None.

## Related Plans

- **Depends On**: preview-pan-zoom-module
- **Next**: preview-pan-zoom-finalize
- **Supersedes**: preview-right-drag-preview-pane

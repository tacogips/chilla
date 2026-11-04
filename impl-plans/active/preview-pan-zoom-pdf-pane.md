# Preview Pan And Zoom: PDF Pane Wiring Implementation Plan

**Status**: Ready
**Plan ID**: preview-pan-zoom-pdf-pane
**Wave**: 2 (depends on preview-pan-zoom-module)
**Design Reference**: design-docs/specs/architecture.md#shared-preview-pan-and-zoom-gestures (Wheel Zoom Contract, PDF bullets)
**Supersedes**: preview-right-drag-pdf-pane
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

`PdfFilePreviewPane` (PART A pdf.js canvas rendering) gets three changes:

- right/middle drag pan with fling on `body`;
- smooth `Ctrl`/`Cmd`+wheel zoom with page-local pointer anchoring;
- no pdf.js re-render per wheel event. The canvas CSS is resized
  immediately, and one debounced render runs at the final zoom after 150 ms.

Keyboard `+`/`-` still re-renders immediately. The PART A `Alt`+wheel zoom
is removed. Review the PART A hunks in these two files and fix real defects
only. Do not redesign loading, the worker, the CMap and font URLs, or error
handling.

## Non-Goals

- Do not edit `pdfjs.ts`, `pdfjs.vitest.ts`, `PreviewPane.tsx`, the module,
  `App.css` or `README.md`.
- No lazy rendering, text layer or anchoring via CSS transform.

## File-Level Changes

### `src/features/preview/PdfFilePreviewPane.tsx`

**Imports**

- Remove the `previewZoomDirectionFromWheel` import.
- Import `attachPreviewPan`, `applyWheelZoom` and `anchoredZoomScroll` from
  `./previewPanZoom`.

**Zoom signals and render**

- Split zoom into two signals: `zoom` (live, shown in the header as
  `Math.round(zoom())%`) and `renderZoom` (the render scale).
- Change the render `createEffect` (currently keyed on `zoom()`, around
  lines 102-146) to read `renderZoom()`. Its cancel and generation logic is
  otherwise unchanged.
- Keyboard `+`/`-` sets `zoom` and `renderZoom` to the same `nextPreviewZoom`
  value, which renders immediately as today. It also clears a pending
  debounce timer.

**Wheel handler order**

1. Return if hidden.
2. Call `const next = applyWheelZoom(event, zoom(), RENDERED_PREVIEW_ZOOM_MAX)`.
   Return on `null`.
3. Compute the page-local anchor (below).
4. Call `setZoom(next)`.
5. For every page with a loaded proxy, set the canvas `style.width` and
   `style.height` to `${page.getViewport({ scale: next / 100 }).width}px`
   (and the height). This must be byte-identical to what the render path
   assigns. Do not touch `canvas.width`/`height` and do not call
   `page.render`.
6. Apply the anchor.
7. Restart a 150 ms `setTimeout` that sets `renderZoom(zoom())`.
8. Clear the timer on unmount (`onCleanup`) and on a new load generation.

**Page-local anchor**

Export it for tests as `pdfPageAnchorScroll(scroll, pointerOffset,
pageOriginBefore, pageSizeBefore, pageOriginAfter, pageSizeAfter)`, computed
per axis.

- Content coordinates are `rect - bodyRect + body.scroll`.
- Before resize, the anchor canvas is the last canvas whose content top is
  at or above `scrollTop + (clientY - bodyRect.top)`. If there is none, use
  the first canvas.
- Fraction `f = clamp((scroll + p - origin) / size, 0, 1)`. Re-measure the
  same canvas after the resize, then set
  `scroll = originAfter + f * sizeAfter - p`.
- Do not use container padding as the origin. That approach drifts by the
  fixed 12px gaps (design DR-002).
- Within the page, the result equals `anchoredZoomScroll(scroll, p,
  originBefore, originAfter, sizeAfter/sizeBefore)`. Either formula may be
  used, but the clamp must apply.

**Pan**

- In `onMount`, call `attachPreviewPan(body, { isActive: () => !hidden() })`
  and `detach()` in `onCleanup`.
- A `createEffect` on the load generation (and the URL) calls `stopFling()`.

### `src/features/preview/PdfFilePreviewPane.vitest.tsx`

**Update** "renders pages and zooms with keys and wheel without stealing
focus":

- The `altKey` wheel -> not prevented and the zoom text unchanged.
- `ctrlKey deltaY:-100` -> prevented, zoom `116%`.
- Keyboard `+` re-renders at once, as today.
- "cancels in-flight rendering before reusing a canvas after rapid zoom"
  must still pass. Adjust it only if it used a wheel, using fake timers.

**Add (`situation -> expected`)**

- Burst of 5 `Ctrl`+wheel events within 100 ms (fake timers) -> `page.render`
  is not called again during the burst, and the canvas `style.height` equals
  the viewport height at the live zoom.
- After advancing 150 ms -> exactly one render pass at the final zoom.
  `scrollTop`/`scrollLeft` and the canvas CSS sizes are unchanged by that
  render.
- Two-page worked example:
  - setup: stub canvas rects as 1000px-high pages, body padding 16, gap 12,
    `scrollTop=1200`, pointer y 200; the rects update after the resize to
    2000px;
  - zoom 100 -> 200 (use a delta producing 200 or clamp-free math) ->
    `scrollTop === 2572`;
  - also assert `pdfPageAnchorScroll(1200, 200, 1028, 1000, 2028, 2000) ===
    2572` as a pure test.
- Centered mixed-width pages: page 2 narrower and centered (its left moves
  after the zoom) -> the page-local x is preserved (`scrollLeft` from the
  re-measured origin).
- Pointer in the 12px gap below page 1 -> anchors to page 1's bottom edge
  (`f = 1`).
- Right drag past the slop -> body scroll moves. Contextmenu after release
  is prevented. A plain right-click is not.
- Middle drag -> pans. A fling runs with stubbed rAF. Reduced motion -> no
  fling.
- A reload (revision change) during a fling -> the fling stops and the
  debounce timer is cleared.
- Existing load, reload, error, focus and "no iframe" tests still pass.

Imitate the existing pdf.js mocks in this file. Pointer helpers: copy the
pattern from `PreviewPane.vitest.tsx:pointerEvent` locally.

## Invariants

- PDF shortcut behavior (`Shift+L`, `Cmd+O`, `+`/`-`, `r`, `Shift+D`,
  `j`/`k`, `Enter`, `q`) is unchanged. The pane contains no focusable
  element.
- Render cancellation and generation guards are unchanged. No render runs
  per wheel event.

## Change Safety

- Re-read files fresh before editing and record pre/post `shasum -a 256` in
  the progress log.
- Edit only writePaths and run no git mutations. If a pinned module export is
  missing, record a blocker.

## Verification

Run in the foreground and record each exit code and log path under
`tmp/preview-pan-zoom/preview-pan-zoom-pdf-pane/`:

1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/PdfFilePreviewPane.vitest.tsx src/features/preview/pdfjs.vitest.ts`
   must exit 0.
2. `bunx biome check src/features/preview/PdfFilePreviewPane.tsx src/features/preview/PdfFilePreviewPane.vitest.tsx --diagnostic-level=warn`
   must exit 0.
3. `bun run typecheck` must show no errors in the owned files. Record
   sibling errors.

## Completion Criteria

- [ ] `zoom`/`renderZoom` are split, with a 150 ms debounce. Keyboard
      re-renders immediately.
- [ ] Page-local anchoring passes the 2572 example, the centered and gap
      cases.
- [ ] Right/middle pan and fling work. Alt+wheel does not zoom.
- [ ] Owned tests, biome and typecheck pass. The progress log is updated.

## Progress Log

### Session: 2026-11-04
**Tasks Completed**: Plan created
**Blockers**: None

## Related Plans

- **Depends On**: preview-pan-zoom-module
- **Next**: preview-pan-zoom-finalize
- **Supersedes**: preview-right-drag-pdf-pane

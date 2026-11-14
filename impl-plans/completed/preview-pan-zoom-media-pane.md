# Preview Pan And Zoom: Video Pane Wiring Implementation Plan

**Status**: Completed
**Plan ID**: preview-pan-zoom-media-pane
**Wave**: 2 (depends on preview-pan-zoom-module)
**Design Reference**: design-docs/specs/architecture.md#shared-preview-pan-and-zoom-gestures
**Supersedes**: preview-right-drag-media-pane
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

`MediaFilePreviewPane` with `kind === "video"` gets:

- right/middle drag pan with fling on `bodyRef`;
- smooth `Ctrl`/`Cmd`+wheel zoom anchored at the pointer. The anchor is the
  `.preview-media--video` figure, which may be centered, so its origin is
  re-measured after the zoom.

The PART A `Alt`+wheel zoom is removed, and keyboard `+`/`-` stays at 10%
steps. Audio gets nothing. Review the PART A video-zoom hunks in these files
and fix real defects only.

## Non-Goals

- Do not edit `PreviewPane.tsx` (do not delete `previewZoomDirectionFromWheel`
  there), the module, the PDF pane, `App.css` or `README.md`.
- No pan or zoom for audio. No change to Space/seek/playback shortcuts or the
  Linux/macOS fallback UI.

## File-Level Changes

### `src/features/preview/MediaFilePreviewPane.tsx`

**Imports**

- Remove the import of `previewZoomDirectionFromWheel`. Keep
  `nextPreviewZoom` and `RENDERED_PREVIEW_ZOOM_MAX`.
- Import `attachPreviewPan`, `applyWheelZoom`, `measureAnchor` and
  `anchorScrollAfterZoom` from `./previewPanZoom`.

**Pan**

- In `onMount`, when `bodyRef` exists, call `attachPreviewPan(bodyRef,
  { isActive })` with no `leftButton` and no `scrollOwner`. `isActive` is
  `isVideo()` and not hidden, using the existing hidden-ancestor rule
  `closest(".pane--hidden, [hidden], [aria-hidden='true']") === null`.
- Call `detach()` in `onCleanup`.
- Left-click on video controls must stay untouched; no left pan.

**Wheel**

- Replace `handleZoomWheel`:
  1. Return unless the pane is video and active.
  2. Call `const next = applyWheelZoom(event, zoom(), RENDERED_PREVIEW_ZOOM_MAX)`.
     Return on `null`.
  3. Resolve the anchor `bodyRef.querySelector(".preview-media--video") ??
     bodyRef`.
  4. Take `before`, call `setZoom(next)`, take `after`, then call
     `anchorScrollAfterZoom(bodyRef, event, before, after, next / old)`.
- Keep one wheel listener.

**Document change and header**

- A `createEffect` on the video source URL signal (whatever the pane uses
  for `src`) calls `panHandle?.stopFling()`.
- Header: render `Math.round(zoom())%`. Keyboard `+`/`-` is unchanged.

### `src/features/preview/MediaFilePreviewPane.vitest.tsx`

**Update** "zooms video with keys and modifier wheel, ...":

- `altKey` wheel -> not prevented, zoom unchanged.
- `ctrlKey deltaY:-100` -> prevented, zoom `116%`.
- `metaKey` works.
- Clamp at `300%` and `50%`.
- Hidden pane and audio -> a `Ctrl` wheel is not prevented.
- Keep the keyboard assertions.

**Add (`situation -> expected`)**

- Video, right drag 10px past the slop -> `bodyRef` scroll moves opposite
  to the pointer. A contextmenu after release is prevented. A plain
  right-click is not.
- Video, middle drag -> pans. Contextmenu is not prevented.
- Video, release with velocity (stub rAF and matchMedia) -> a fling runs
  and stops. Reduced motion -> no fling.
- Audio -> a right drag does not pan or capture.
- Hidden pane -> no pan.
- Anchoring with a centered figure: stub the figure rect so its `left`
  shifts after the zoom. A `Ctrl`+wheel -> `scrollLeft` equals
  `anchoredZoomScroll` with the before/after origins.
- The source URL changes during a fling -> the fling stops.
- Existing seek/Space/fallback tests still pass unchanged.

Imitate the pointer-event and capture stubs from
`PreviewPane.vitest.tsx:pointerEvent` and `previewBodyWithPointerCapture`.
Copy them locally; do not import from another test file.

## Invariants

- Audio registers no pan and no zoom handlers' effects.
- Playback controls and keyboard shortcuts behave as before.

## Change Safety

- Re-read files fresh before editing and record pre/post `shasum -a 256` in
  the progress log.
- Edit only writePaths and run no git mutations. If a pinned module export is
  missing, record a blocker.

## Verification

Run in the foreground and record each exit code and log path under
`tmp/preview-pan-zoom/preview-pan-zoom-media-pane/`:

1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/MediaFilePreviewPane.vitest.tsx`
   must exit 0.
2. `bunx biome check src/features/preview/MediaFilePreviewPane.tsx src/features/preview/MediaFilePreviewPane.vitest.tsx --diagnostic-level=warn`
   must exit 0.
3. `bun run typecheck` must show no errors in the owned files. Record
   sibling errors without fixing them.

## Completion Criteria

- [x] Video pans with right/middle drag and flings. Audio is untouched.
- [x] The smooth `Ctrl`/`Cmd` zoom is anchored with a re-measured origin.
      Alt+wheel does not zoom.
- [x] `previewZoomDirectionFromWheel` is no longer imported here.
- [x] Owned tests, biome and typecheck pass. The progress log is updated.

## Progress Log

### Session: 2026-11-04
**Tasks Completed**: Plan created
**Blockers**: None

## Related Plans

- **Depends On**: preview-pan-zoom-module
- **Next**: preview-pan-zoom-finalize
- **Supersedes**: preview-right-drag-media-pane

### Session: 2026-11-04 — implementation
**Tasks Completed**: Video shared pan/fling and continuous anchored wheel zoom; scoped regression tests.
**Evidence**: `tmp/preview-pan-zoom/preview-pan-zoom-media-pane/pre-hashes.txt` and `post-hashes.txt` contain pre/post SHA-256 hashes. Per-edit intentions are in the same directory.
**Verification**: Scoped Node vitest exit 0 (22 tests), `vitest-final.log`; scoped Biome exit 0, `biome-final.log`; `bun run typecheck` exit 0, `typecheck-final.log`. These ran on the moving shared tree.
**Blockers**: None. Formal reviews and plan archival are downstream.

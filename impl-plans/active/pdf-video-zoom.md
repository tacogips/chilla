# PDF Inline Rendering: Video Preview Zoom Implementation Plan

**Status**: In Progress
**Design Reference**: `design-docs/specs/design-pdf-inline-rendering.md#shared-zoom-input-contract`; `design-docs/user-qa/qa-pdf-inline-rendering.md` (default: video zooms, audio does not)
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

## Dispatch metadata

```json
{
  "planId": "pdf-video-zoom",
  "planPath": "impl-plans/active/pdf-video-zoom.md",
  "dependsOn": ["pdf-zoom-wheel-contract"],
  "writePaths": [
    "src/features/preview/MediaFilePreviewPane.tsx",
    "src/features/preview/MediaFilePreviewPane.vitest.tsx",
    "impl-plans/active/pdf-video-zoom.md"
  ],
  "sharedPaths": [],
  "workflowMode": "issue-resolution",
  "progressPath": "impl-plans/active/pdf-video-zoom.md"
}
```

## Intent and context

The user asked for Alt+wheel zoom on "media/image previews
(MediaFilePreviewPane.tsx)". Images are already rendered by `PreviewPane`,
which `pdf-zoom-wheel-contract` covers. `MediaFilePreviewPane` renders only
video and audio, and today neither has zoom. Per the accepted design default:

- video gains a pane-local zoom of 50-300%, driven by `+`/`-` and Alt or Ctrl
  + wheel;
- audio gets no zoom.

## Non-goals

- No audio zoom: no handlers and no header percentage for audio.
- Do not change Space play/pause, `Ctrl+D`/`Ctrl+U` seeks, autoplay, stream
  URL or Linux fallback logic.
- Do not edit `src/app/App.css`, which `pdf-canvas-pane` owns. Do not edit
  `PreviewPane.tsx`.

## File-level changes

### `src/features/preview/MediaFilePreviewPane.tsx`

- Add a `zoom` signal starting at 100, and a `bodyRef` on the
  `.pane__body` div.
- Header: for video only, add
  `<span class="preview__zoom" aria-live="polite">{zoom()}%</span>` beside
  the existing `Video` label.
- Apply the zoom to the `<figure class="preview-media preview-media--video">`
  only, as inline styles through the Solid style object:
  - `"--preview-media-zoom-scale": String(zoom()/100)`;
  - `zoom: "var(--preview-media-zoom-scale)"`.

  The CSS `zoom` property affects layout, so an enlarged video scrolls inside
  the pane body. Do not use `transform`, which would not create scroll
  overflow.
- Keyboard: add a separate window `keydown` listener in `onMount`, with no
  capture. It is active only when `props.kind === "video"`.
  - Use the same guards as the existing handler: hidden pane, help layer,
    dialog/notification path, and editable target.
  - Also require no Ctrl, Meta or Alt.
  - Handle only `+` and `-`: call `preventDefault`, then
    `nextPreviewZoom(current, dir, RENDERED_PREVIEW_ZOOM_MAX)`.
  - Do not call `stopImmediatePropagation`, so other window listeners still
    see the event.
- Wheel: register a non-passive `wheel` listener on `bodyRef`, video only.
  Use `previewZoomDirectionFromWheel` from `./PreviewPane`. On `null`, return
  without `preventDefault`. Otherwise call `preventDefault` and step the zoom.
- Remove both listeners in `onCleanup`.

### `src/features/preview/MediaFilePreviewPane.vitest.tsx`

Follow the existing render helpers in this file.

## Pitfalls

- The existing capture-phase keydown handler calls `stopImmediatePropagation`
  for Space and seeks. Leave it untouched, and keep the new listener separate
  so playback shortcuts keep priority.
- `+`/`-` events targeting the `<video>` element itself are not editable
  targets, so they must still zoom.
- `kind` can change while mounted (audio and video share the component).
  Check `props.kind === "video"` inside the handlers rather than only at
  mount.
- jsdom may drop the `zoom` declaration. In tests, assert the custom property
  via `style.getPropertyValue("--preview-media-zoom-scale")`, not `style.zoom`.

## Test cases to add

- Video: `+` keydown -> header `110%`, figure custom property `1.1`, and the
  event is prevented. `-` -> `100%`.
- Video: Alt + wheel with `deltaY -1` on `.pane__body` -> `110%`, prevented.
  Ctrl + wheel with `deltaY 1` -> `100%`. Plain wheel -> not prevented.
- Video: 30 zoom-in steps -> `300%`.
- Video: `+` with an `<input>` as target -> unchanged.
- Audio: no `.preview__zoom` element. `+` and Alt + wheel -> not prevented, no
  style change.
- Existing Space and seek tests pass unchanged.

## Invariants

- Every existing test in `MediaFilePreviewPane.vitest.tsx` passes without
  modification.
- `LARGE_MEDIA_SEEK_SECONDS` and the exported API are unchanged.

## Verification (scoped to this plan)

Run each command in the foreground and record its exit status and log location
in the progress log:

1. `bunx vitest run --config vitest.config.ts src/features/preview/MediaFilePreviewPane.vitest.tsx`
   -> exit 0.
2. `bun run typecheck` -> must report no errors in this plan's files.

   Sibling-noise rule: the wave-2 sibling `pdf-canvas-pane` edits
   `src/features/preview/PdfFilePreviewPane.tsx`,
   `src/features/preview/PdfFilePreviewPane.vitest.tsx` and `src/app/App.css`
   concurrently. If typecheck reports errors located only in those files,
   record them in the progress log as sibling noise; they are not a failure of
   this plan. Confirm this plan's own files are clean with
   `bunx tsc --noEmit 2>&1 | grep -E "src/features/preview/MediaFilePreviewPane"`,
   which must print nothing. Never edit the sibling's files. The authoritative
   workspace-wide typecheck is `pdf-shortcuts-finalize` Final verification
   step 1.
3. `bunx biome check src/features/preview/MediaFilePreviewPane.tsx src/features/preview/MediaFilePreviewPane.vitest.tsx --diagnostic-level=warn`
   -> exit 0.

## Done criteria

- [x] Video zoom works via keys and wheel. Audio has none.
- [x] Tests for all of the cases above pass.
- [x] Verification commands exit 0. The progress log is updated.

## Concurrency and drift rules

- Before each edit, read the target file fresh. Record pre- and post-edit
  `shasum -a 256` hashes in the progress log.
- On unexpected drift, stop and log it. No git operations.

## Amendment 2026-11-04 (session-710 continuation)

The implementation from session 708 is in the working tree, uncommitted and
only partly reviewed. Keep it. Do not revert it or reimplement it.

- Scope: re-verify only. Edit a file only to fix a defect that a scoped check
  or the Opus review of this plan finds, and only inside this plan's
  `writePaths`. Add no new features and do no refactoring.
- Verification: run in the foreground, logging to
  `tmp/pdf-inline-rendering-20261104-02/pdf-video-zoom/`.
  1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/MediaFilePreviewPane.vitest.tsx`
     -> exit 0. The log must show cases that prove:
     - video zooms with `+`/`-`;
     - video zooms with Alt+wheel and Ctrl+wheel;
     - a plain wheel is not prevented;
     - audio registers no zoom;
     - Space and seek behavior are unchanged.
  2. `bunx biome check src/features/preview/MediaFilePreviewPane.tsx src/features/preview/MediaFilePreviewPane.vitest.tsx --diagnostic-level=warn`
     -> exit 0.
  3. `bun run typecheck` -> exit 0. If it fails on files outside this plan,
     log that as sibling noise.
- Done when all three results hold and the hashes are recorded. Then set
  **Status** to `Completed`.

## Progress Log

### Session: 2026-11-04
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Wave 2. Runs in parallel with `pdf-canvas-pane`.

### Session: 2026-11-04 implementation
**Tasks Completed**: Video-only keyboard and modifier-wheel zoom, focused tests, scoped verification.
**Blockers**: None.
**Notes**: The 19-test media suite, `bun run typecheck`, own-file TypeScript check, and scoped Biome check exited 0. Complete logs are in `tmp/pdf-inline-rendering-20261104-01/pdf-video-zoom/`. Source and test post-edit SHA-256 hashes are `ffb86858f15570e767e8f8c6747376d798301680ae0cffe22cf33db4f3bc8c2a` and `0897c69330686ee5a74986c04f8ead829cd83f06bbb4871a0e4e662c7af623f6`; pre-edit hashes and plan hashes are recorded in the evidence directory. Formal review and the debug launch are owned by downstream workflow steps.

# Preview Pan And Zoom: Finalize, README And PART A Review Implementation Plan

**Status**: Ready
**Plan ID**: preview-pan-zoom-finalize
**Wave**: 3 (depends on preview-pan-zoom-preview-pane, preview-pan-zoom-media-pane, preview-pan-zoom-pdf-pane)
**Design Reference**: design-docs/specs/architecture.md#shared-preview-pan-and-zoom-gestures (Verification, README bullet); design-docs/specs/design-pdf-inline-rendering.md
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

This is the serial last wave. It does five things:

1. Deletes the now-unused `previewZoomDirectionFromWheel`.
2. Updates the README shortcut and feature lines.
3. Reviews the remaining PART A files (the picker supersession fix, the Vite
   pdf.js asset config, the CSP and the pdf.js loader), fixing real defects
   only.
4. Marks the PART A plans' remaining checklist items done with evidence.
5. Runs the full verification gate.

The PART A step-8 GUI evidence is
`tmp/pdf-inline-rendering-20261104-02/pdf-shortcuts-finalize/runtime-observed/RUNTIME-EVIDENCE.md`.
These gaps are user-accepted: the JPX fixture in the GUI, the Web Inspector
console, video wheel at runtime, and all PART B gestures (delegated to the
supervising session).

## Non-Goals

- Do not rewrite, revert or redesign PART A.
- Do not edit `package.json` or `bun.lock`. If you find a dependency defect,
  record a blocker.
- Do not move plans to `impl-plans/completed/`; the plan-archive node does
  that.
- Do not touch `.riela/` or `riela-lock.json`. Do not commit or push; the
  commit happens after integration review.
- Do not edit pane or module files except the single deletion in
  `PreviewPane.tsx`.
- Do not launch the GUI app.

## File-Level Changes

### `src/features/preview/PreviewPane.tsx` (shared with wave 2, serialized by dependsOn)

- First run `grep -rn "previewZoomDirectionFromWheel" src`. Only the
  definition in `PreviewPane.tsx` may remain. If any other file imports it,
  record a blocker and stop this step.
- Delete the function and its doc comment, and remove the now-unused
  `PreviewZoomDirection` usage only if typecheck reports it as unused. Keep
  the type if `nextPreviewZoom` uses it.

### `README.md`

- Replace the line
  `` - `Alt (Option)+mouse wheel` / `Ctrl+mouse wheel` (including trackpad pinch): ... ``
  with:
  `` - `Ctrl`/`Cmd`+mouse wheel or trackpad pinch: smooth preview zoom under the pointer for Markdown/rendered, source, image, video and PDF previews (not configured by keymap.toml) ``
- Replace the line
  `- Right-button drag pans Markdown/rendered, source, image, video, and PDF previews; a plain right-click opens the context menu.`
  with:
  `- Right- or middle-button drag pans Markdown/rendered, source, image, video and PDF previews with momentum; a plain right-click opens the context menu`
- Change the feature line
  `- Touch-style left-button drag panning for direct SVG and raster image previews`
  to mention momentum, for example "... with momentum".
- Leave every other line unchanged, including the PART A `+`/`-` and PDF
  lines.

### PART A review (fix real defects only; record findings in the progress log)

- `src/features/workspace/WorkspaceShell.tsx` and
  `WorkspaceShell.vitest.tsx`: confirm that `handleOpenFiles` lets an
  interactive picker open supersede a stale queued open and that the tests
  cover it.
- `vite.config.ts`: confirm the pdf.js `standard_fonts`, `wasm` and CMap
  asset copying and paths match `pdfjs.ts`.
- `src-tauri/tauri.conf.json`: confirm `connect-src` adds only `asset:` (no
  wildcard widening).
- `src/features/preview/pdfjs.ts` and `pdfjs.vitest.ts`: confirm the worker
  setup and that `isEvalSupported: false` / scripting disabled are as
  designed.
- A defect means a behavior contrary to `design-pdf-inline-rendering.md` or
  the `workspace-picker-supersession.md` plan, a failing test, or a security
  regression. Style changes are not defects.

### PART A plan bookkeeping

- In `impl-plans/active/pdf-canvas-pane.md`, `pdf-pdfjs-foundation.md`,
  `pdf-shortcuts-finalize.md`, `pdf-video-zoom.md`,
  `pdf-zoom-wheel-contract.md` and `workspace-picker-supersession.md`:
  - append a progress-log session that cites this run's verification
    evidence and the RUNTIME-EVIDENCE.md path;
  - note that the Alt+wheel rule is superseded by the preview-pan-zoom plans;
  - set Status to `Completed` only where every completion criterion is
    checked.

## Invariants

- After the deletion, `grep -rn "previewZoomDirectionFromWheel" src` returns
  nothing.
- README changes are limited to the three lines above.

## Change Safety

- Re-read each file fresh before editing and record pre/post `shasum -a 256`
  in the progress log.
- If a wave-2 file drifted after its plan was accepted, do not repair it
  here. Record it for serial integration repair.
- Run no git mutations.

## Verification (full gate)

Run in the foreground, each logging to
`tmp/preview-pan-zoom/preview-pan-zoom-finalize/<name>.log`, and record each
exit code:

1. `bun run typecheck` must exit 0.
2. `bun run lint:biome` must exit 0.
3. `bun run test` must exit 0 with 0 failures (baseline 67).
4. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bun run test:dom`
   must exit 0 with 0 failures. Record the total count; it should be more
   than the 459 baseline.
5. `CARGO_TERM_QUIET=true bun run tauri build --debug --no-bundle` must
   exit 0.
6. `grep -rn "previewZoomDirectionFromWheel\|rightDragPan" src` must return
   nothing (exit 1).
7. `git status --porcelain .riela riela-lock.json` shows them untracked and
   untouched (read-only check).

## Completion Criteria

- [ ] `previewZoomDirectionFromWheel` is deleted with no remaining
      references.
- [ ] The three README lines are updated.
- [ ] The PART A review findings are recorded, and any real defect is fixed
      with a test.
- [ ] The PART A plan progress logs are updated.
- [ ] All seven verification commands meet their expected result, with log
      paths recorded.

## Progress Log

### Session: 2026-11-04
**Tasks Completed**: Plan created
**Blockers**: None

## Related Plans

- **Depends On**: preview-pan-zoom-preview-pane, preview-pan-zoom-media-pane, preview-pan-zoom-pdf-pane

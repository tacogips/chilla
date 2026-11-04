# Preview Pan And Zoom: Finalize, README And PART A Review Implementation Plan

**Status**: Completed
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

- [x] `previewZoomDirectionFromWheel` is deleted with no remaining
      references.
- [x] The three README lines are updated.
- [x] The PART A review findings are recorded, and any real defect is fixed
      with a test.
- [x] The PART A plan progress logs are updated.
- [x] All seven verification commands meet their expected result, with log
      paths recorded.

## Progress Log

### Session: 2026-11-04
**Tasks Completed**: Plan created
**Blockers**: None

## Related Plans

- **Depends On**: preview-pan-zoom-preview-pane, preview-pan-zoom-media-pane, preview-pan-zoom-pdf-pane

### Session: 2026-11-04 — implementation

Removed the obsolete helper and updated the three README lines. PART A review found no material defect: picker queue behavior matches its accepted design; Vite resource paths match the pdf.js loader; CSP adds only the asset protocol and its localhost origin; worker and loader hardening match the PDF design. Six PART A logs cite this run and `tmp/pdf-inline-rendering-20261104-02/pdf-shortcuts-finalize/runtime-observed/RUNTIME-EVIDENCE.md`. Alt+wheel is superseded. Pre/post hashes and gate logs are under `tmp/preview-pan-zoom/preview-pan-zoom-finalize/`.

The debug build was pending: its configured `dist/` and Cargo `target/` outputs were outside the declared empty artifact roots (resolved by the amendment below). The execution contract requires a checkpoint amendment before such generated repository output. Formal review, GUI checks, archiving and commit remain downstream.

Foreground verification: `typecheck-agent.log` and `lint-biome-agent.log` exit 0; `test-agent.log` exit 0 (67 passed); `test-dom-agent.log` exit 0 (491 passed). `absence.log` confirms no obsolete names; `git-status.log` records `.riela/` and `riela-lock.json` untracked. The debug build has not run in this session.

## Amendment 2026-11-04 (blocked-wave-scope-or-contract, round 1)

**Blocker**: The wave-003 progress gate reported that `CARGO_TERM_QUIET=true bun run tauri build --debug --no-bundle` was not run. The plan declared no artifact roots, and the build writes generated output to `dist/` (Vite `frontendDist`) and `target/` (the Cargo workspace target at the repository root; `src-tauri/target` does not exist).

**Decision** (additive; no redesign):

- `dist` and `target` are added to this plan's `writePaths` and declared as `artifactRoots`. They are generated build outputs, so the runtime records them only as digest/count manifests, not as source snapshots. No source path lies inside them.
- The worker may let the debug build create or overwrite files under `dist/` and `target/` only. Do not hand-edit, commit or stage anything there. Both directories already exist and are build caches.
- The worker must not delete `target/` or run `cargo clean`. That would discard caches and is not required.

**Resume steps** (only the blocked work; everything else already ran in the previous session and should not be redone unless a hash drifted):

1. Re-hash the owned source files and compare them with `tmp/preview-pan-zoom/preview-pan-zoom-finalize/post-hashes.txt`. Record any drift; do not repair sibling files.
2. Run `CARGO_TERM_QUIET=true bun run tauri build --debug --no-bundle` in the foreground from the repository root, logging to `tmp/preview-pan-zoom/preview-pan-zoom-finalize/tauri-build-debug.log`. Expected result: exit 0, with the debug binary present at `target/debug/chilla`.
3. Re-run `git status --porcelain .riela riela-lock.json` and confirm that both are still untracked and that nothing under `.riela/` is staged.
4. If the build fails, record the exact error and exit code in the progress log. Fix only defects inside this plan's source `writePaths`. Report anything else as a blocker.
5. Check the full-gate completion criterion only when step 2 exits 0. Then append a progress-log session with the log path and exit code.

**Completion criteria added**:

- [x] `tmp/preview-pan-zoom/preview-pan-zoom-finalize/tauri-build-debug.log` exists, and the build exited 0.
- [x] No files outside `writePaths` changed in this resumed step, except build output inside `dist/` and `target/`.

### Session: 2026-11-04 — amended build verification

The debug Tauri build exited 0 and produced `target/debug/chilla`; its complete log is `tmp/preview-pan-zoom/preview-pan-zoom-finalize/tauri-build-debug.log`. The previous source hashes matched, with only this plan differing due to the amendment (`hash-check-resume.log`). The earlier frontend gate results remain applicable. `git-status-resume.log` shows `.riela/` and `riela-lock.json` untracked and no staged entries; status alone cannot establish their contents were unchanged. This resumed step did not write them. Formal integration review, GUI checks, archiving and commit remain downstream.

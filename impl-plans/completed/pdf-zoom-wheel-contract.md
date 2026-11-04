# PDF Inline Rendering: Shared Modifier-Wheel Zoom Contract Implementation Plan

**Status**: Completed
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

- [x] `grep -n "export function previewZoomDirectionFromWheel" src/features/preview/PreviewPane.tsx` matches.
- [x] `grep -n "export type PreviewZoomDirection" src/features/preview/PreviewPane.tsx` matches.
- [x] `PREVIEW_ZOOM_MIN`, `RENDERED_PREVIEW_ZOOM_MAX` and `IMAGE_PREVIEW_ZOOM_MAX` are exported.
- [x] All three dispatched scoped verification commands exit 0.
- [x] The progress log is updated.

## Concurrency and drift rules

- Before each edit, read the target file fresh. Record a `shasum -a 256` of
  each owned file before the first edit and after the last edit in the
  progress log.
- If another plan changes an owned file (unexpected hash), stop and record the
  drift. Do not overwrite; repair happens serially after the join.
- Edit only the `writePaths`. No git operations.

## Amendment 2026-11-04 (session-710 continuation)

The implementation from session 708 is in the working tree, uncommitted and
only partly reviewed. Keep it. Do not revert it or reimplement it.

- Scope: re-verify only. Edit a file only to fix a defect that a scoped check
  or the Opus review of this plan finds, and only inside this plan's
  `writePaths`. Add no new features and do no refactoring.
- Verification: run in the foreground, logging to
  `tmp/pdf-inline-rendering-20261104-02/pdf-zoom-wheel-contract/`.
  1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/PreviewPane.vitest.tsx`
     -> exit 0. The log must show cases that prove:
     - Alt+wheel zooms in and out;
     - Ctrl+wheel zooms;
     - a plain wheel is not `preventDefault`ed;
     - both zoom clamps hold.
  2. `bunx biome check src/features/preview/PreviewPane.tsx src/features/preview/PreviewPane.vitest.tsx --diagnostic-level=warn`
     -> exit 0.
  3. `bun run typecheck` -> exit 0. If it fails on files outside this plan,
     log that as sibling noise.
- Done when all three results hold and each owned file's `shasum -a 256` is
  recorded. Then set **Status** to `Completed`. Archiving is done by the
  workflow.

## Progress Log

### Session: 2026-11-04
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Wave 1. `pdf-canvas-pane` and `pdf-video-zoom` depend on the exported helper and constants.


### Session: 2026-11-04 — implementation
**Tasks Completed**: Exported the shared modifier-wheel contract and existing bounds; updated pane handling and focused tests.
**Blockers**: None.
**Verification**: Scoped vitest passed 27 tests, own-file typecheck filter passed, and scoped Biome passed; complete logs are in `tmp/pdf-inline-rendering-20261104-01/pdf-zoom-wheel-contract/` with `-final.log` suffix. The dispatch specifies the own-file typecheck gate during concurrent work; workspace-wide gates belong to the serial finalization plan. Initial Biome formatting failure is retained in `biome-attempt1.log` and was corrected.
**SHA-256 before / after**:
- `src/features/preview/PreviewPane.tsx`: `e67ed3d6ede190ad3d3d4427317e285d8f71c0897280e241920c3ec643e93c70` / `58ac063f0a8a279fbef10ed51c91c5b8391f4fc4e247240cabc839193ce0ce81`.
- `src/features/preview/PreviewPane.vitest.tsx`: `724213e339bc3c21686c98031378e08bc74c9072370cde154f5a49a1afe1ae5f` / `58cdddd1326d3ab881fc1fb257a85d342f189df197b915623468d15821a12fd5`.
- This plan before editing: `fe50973b1b1b2125c5807a39b4419bdea6371629b332537a1c82edda96996cae`; its final hash is recorded in plan-local evidence `final-hashes.txt` to avoid a self-referential hash.
**Notes**: Formal reviews and downstream PDF/video integration remain assigned to later workflow steps.

### Session: 2026-11-04 — session-710 re-verification
**Tasks Completed**: Re-verified the existing modifier-wheel implementation and tests; no source repair was needed.
**Blockers**: None.
**Verification**: Node v22.23.4. The dispatched Vitest command exited 0 with 27 tests passed; a verbose rerun also exited 0 and lists the wheel cases. Scoped Biome and `bun run typecheck`, each run under the dispatched mise Node environment, exited 0. Logs: `tmp/pdf-inline-rendering-20261104-02/pdf-zoom-wheel-contract/{vitest-final,vitest-verbose,biome,typecheck,node-version}.log`. These checks ran on the shared working tree; final integration verification and formal reviews remain downstream.
**SHA-256 before / after**:
- `src/features/preview/PreviewPane.tsx`: `58ac063f0a8a279fbef10ed51c91c5b8391f4fc4e247240cabc839193ce0ce81` / `58ac063f0a8a279fbef10ed51c91c5b8391f4fc4e247240cabc839193ce0ce81`.
- `src/features/preview/PreviewPane.vitest.tsx`: `58cdddd1326d3ab881fc1fb257a85d342f189df197b915623468d15821a12fd5` / `58cdddd1326d3ab881fc1fb257a85d342f189df197b915623468d15821a12fd5`.
- This plan before editing: `ebb72e8d774d7f35c3864cad8c8f521b242293db181c3a9777eeeb25d6bec687`; its final hash is in plan-local `final-hashes.txt` to avoid self-reference.

### Session: 2026-11-04 — preview pan and zoom finalization

PART A review found no material defect. The earlier Alt+wheel behavior is superseded by the preview pan and zoom plans. Runtime evidence: `tmp/pdf-inline-rendering-20261104-02/pdf-shortcuts-finalize/runtime-observed/RUNTIME-EVIDENCE.md`. Current gate evidence is recorded under `tmp/preview-pan-zoom/preview-pan-zoom-finalize/`; see the finalize plan for outcomes and any outstanding checks. Formal integration review and archiving remain downstream.

# Preview Press-Time Selection Guard PreviewPane Test Implementation Plan

**Status**: Completed
**Plan ID**: preview-selection-guard-preview-pane
**Wave**: 2
**Depends On**: preview-selection-guard-module
**Design Reference**: design-docs/specs/architecture.md#verification (bullet "Rendered Markdown macOS-order regression")
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

`preview-selection-guard-module` changes the native-menu guard in
`src/features/preview/previewPanZoom.ts` to use a press-time selection record.
This plan adds the integration regression on the real rendered Markdown
`PreviewPane`. That is the surface where the macOS GUI check found the defect
(a word was auto-selected over README.md text and no pan happened).

## Non-Goals

- No source changes. Do not edit `previewPanZoom.ts`, its vitest, any pane
  `.tsx`, the other pane vitest files or `README.md`.
- Do not change existing tests in `PreviewPane.vitest.tsx`, unless one fails
  only because of the accepted guard change. If that happens, record it in
  the progress log and report it. Do not weaken unrelated assertions.
- No git mutations. Do not launch the GUI app.

## Deliverables

### `src/features/preview/PreviewPane.vitest.tsx`

Add one `it(...)` next to "pans rendered content with right and middle
buttons and suppresses the native menu". Imitate that test's setup:
`renderPreview("<p>Right drag text and more</p>")`,
`previewBodyWithPointerCapture()`, `preview.scrollTop = 100`, and the existing
`pointerEvent` helper.
- No prior selection. Find the `p` inside `preview` and dispatch
  `pointerEvent("pointerdown", 1, 0, 0, 2)` on it (the event bubbles). Then
  dispatch `new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 2 })`
  on the `p`: `defaultPrevented === true`.
- Simulate the WebKit word select with `window.getSelection()?.selectAllChildren(p)`.
  The text is now non-empty.
- Dispatch `new MouseEvent("contextmenu", { bubbles: true, cancelable: true })`
  on the `p`: `defaultPrevented === true` and
  `window.getSelection()?.toString() === ""`.
- Dispatch `pointerEvent("pointermove", 1, 0, 10, 2)` on `preview`:
  `preview.scrollTop === 90`. Then dispatch `pointerup`.
- Clear any selection at the end of the test, or in the existing teardown
  if it does not already do so.

Pitfall: the `p` must be inside the attached listener target
(`.pane__body.preview`), so the events must bubble. Do not dispatch on
`document`.

## Invariants

- Every existing `PreviewPane.vitest.tsx` test passes unchanged.

## Acceptance Criteria

- [x] The new rendered macOS-order test passes. Mousedown and contextmenu
      are prevented, the selection is cleared and the preview scrolls by
      the drag delta.
- [x] Only this plan's writePaths changed. The progress log records pre/post
      sha256, commands, exit codes and log paths.

## Verification

Run in `/Users/taco/gits/tacogips/chilla`, in the foreground. Tee each command
to `tmp/preview-selection-guard/preview-selection-guard-preview-pane/<name>.log`
and record the exit status.

1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/PreviewPane.vitest.tsx`
   must exit 0 with the new test passing.
2. `bunx biome check src/features/preview/PreviewPane.vitest.tsx --diagnostic-level=warn`
   must exit 0.

## Fanout Safety

- Read the file fresh before each edit and record `shasum -a 256` before and
  after. If the file drifted, stop and report.

## Write Paths

These mirror `impl-plans/active/preview-selection-guard-dispatch.json`.

- writePaths: `src/features/preview/PreviewPane.vitest.tsx`, `impl-plans/active/preview-selection-guard-preview-pane.md`
- sharedPaths: none
- artifactRoots: none

## Progress Log

### Session: 2026-11-04 (planning)
**Tasks Completed**: plan authored
**Notes**: Implementation pending (wave 2, after preview-selection-guard-module).

### Session: 2026-11-04 (implementation)
**Tasks Completed**: Added rendered Markdown macOS-order regression; selection is cleared in a finally block. Existing tests remain unchanged.
**Evidence**: `tmp/preview-selection-guard/preview-selection-guard-preview-pane/` contains per-edit snapshots, intentions and hashes. Before SHA-256: test `7ea04a66a9556b874a0f86ce9eb266927d4b9f72cc6d47399600172834a96e27`, plan `4b37326c6235120c12a73cf3a348916ad8995105e5f113176030cc5edf52ea5c`. After test SHA-256: `29df2a2ce030440b871c37b9c3d0897abe1ccac6f0e337dc669f707a5167b5e2`; final plan hash is recorded in `post-sha256.txt`.
**Verification**:
- `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/PreviewPane.vitest.tsx`: exit 0, 34 tests passed; `vitest.log`.
- `bunx biome check src/features/preview/PreviewPane.vitest.tsx --diagnostic-level=warn`: exit 0; `biome.log`.
**Notes**: Formal review, workspace-wide verification and local commit remain with the serial integration workflow. No GUI launch.

### Session: 2026-11-04 (step8 completion)
**Tasks Completed**: Adversarial and test-integrity reviews accepted; integration checks on the combined tree passed.
**Notes**: Integration logs in `tmp/preview-selection-guard/reconcile-wave-002/`: `typecheck.log` (exit 0), `lint-biome.log` (exit 0), `test.log` (67 pass, 0 fail), `test-dom.log` (504 passed). Remaining non-blocking gap: the supervising session's macOS WebKit GUI re-check (user-accepted). Archived to `impl-plans/completed/`.

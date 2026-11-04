# Preview Press-Time Selection Guard PreviewPane Test Implementation Plan

**Status**: Ready
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

- [ ] The new rendered macOS-order test passes. Mousedown and contextmenu
      are prevented, the selection is cleared and the preview scrolls by
      the drag delta.
- [ ] Only this plan's writePaths changed. The progress log records pre/post
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

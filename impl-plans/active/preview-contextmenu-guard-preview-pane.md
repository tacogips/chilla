# Preview Context-Menu Guard PreviewPane Tests Implementation Plan

**Status**: Ready
**Plan ID**: preview-contextmenu-guard-preview-pane
**Wave**: 2
**Depends On**: preview-contextmenu-guard-module
**Design Reference**: design-docs/specs/architecture.md#verification (pane-test bullet, chord-release step 6)
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

`preview-contextmenu-guard-module` makes the `contextmenu` listener of
`attachPreviewPan` prevent the native menu on pan targets, except for editable
targets or a non-empty selection. `src/features/preview/PreviewPane.vitest.tsx`
still asserts the old contract, so it would fail. This plan updates only those
assertions.

## Non-Goals

- Do not edit `PreviewPane.tsx`, `previewPanZoom.ts` or any other test file.
- Do not add new pane-level guard tests. Unit coverage lives in
  `previewPanZoom.vitest.ts`.
- Do not change pan, fling, zoom or chord assertions.

## Deliverables

### 1. `src/features/preview/PreviewPane.vitest.tsx`

- Test `"pans rendered content with right and middle buttons and suppresses only moved right menus"` (around L815-838):
  - Rename it to `"pans rendered content with right and middle buttons and suppresses the native menu"`.
  - `plain` (after a right press and release with no move, around L828-830):
    expect `defaultPrevented` to be `true`.
  - `middle` (after a middle gesture, around L835-837): expect `true`.
  - Keep `menu` (after the right pan) as `true`, and keep every scroll assertion.
- Test `"ends a chorded right drag when the right button is released"`
  (around L840-856): leave it unchanged. Its `menu` is still `true`.
- Search the file for any other `contextmenu` assertion
  (`grep -n contextmenu`). There should be none besides the above. If one
  exists and asserts `false` for a non-editable target with no selection, flip
  it to `true` and note it in the progress log.

## Invariants

- No production code is touched. Only boolean expectations and the test title
  change.

## Acceptance Criteria

- [ ] `grep -n "defaultPrevented).toBe(false)" src/features/preview/PreviewPane.vitest.tsx` shows no line belonging to a `contextmenu` event.
- [ ] The PreviewPane vitest file passes against the module change.

## Verification

Run in the foreground in `/Users/taco/gits/tacogips/chilla`. Log to
`tmp/preview-contextmenu-guard/preview-pane.log` and record the exit status.

1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/PreviewPane.vitest.tsx` must exit 0.
2. `bunx biome check src/features/preview/PreviewPane.vitest.tsx --diagnostic-level=warn` must exit 0.

## Fanout Safety

Read the file fresh, record sha256 before and after the edit, and stop on drift. No git index operations.

## Write Paths

Mirrors `impl-plans/active/preview-contextmenu-guard-dispatch.json`.

- writePaths: `src/features/preview/PreviewPane.vitest.tsx`, `impl-plans/active/preview-contextmenu-guard-preview-pane.md`
- sharedPaths: none
- artifactRoots: none

## Progress Log

### Session: 2026-11-04 (planning)
**Tasks Completed**: plan authored
**Notes**: Implementation pending.

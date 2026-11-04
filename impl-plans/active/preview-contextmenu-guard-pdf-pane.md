# Preview Context-Menu Guard PDF Pane Tests Implementation Plan

**Status**: Ready
**Plan ID**: preview-contextmenu-guard-pdf-pane
**Wave**: 2
**Depends On**: preview-contextmenu-guard-module
**Design Reference**: design-docs/specs/architecture.md#verification (pane-test bullet)
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

The defect was observed on a PDF preview. `preview-contextmenu-guard-module`
makes the pan-target `contextmenu` listener prevent the native menu except for
editable targets or a non-empty selection.
`src/features/preview/PdfFilePreviewPane.vitest.tsx` (around L293-304) still
asserts that a plain right-click is not prevented. This plan updates that
assertion.

## Non-Goals

- Do not edit `PdfFilePreviewPane.tsx`, `previewPanZoom.ts` or other tests.
- Do not change pan, fling, zoom, render-debounce or shortcut assertions.

## Deliverables

### 1. `src/features/preview/PdfFilePreviewPane.vitest.tsx`

- In the right/middle pan test, the `plain` contextmenu after
  `pointerdown 2` and `pointerup 2` with no move (around L300-304):
  `expect(plain.defaultPrevented).toBe(false)` becomes `toBe(true)`.
- Keep `menu` after the moved right gesture as `true`.
- Run `grep -n contextmenu` on the file. If another `contextmenu` assertion
  expects `false` for a non-editable target with no selection, flip it and note
  it in the progress log.

## Invariants

- Only boolean expectations change.

## Acceptance Criteria

- [ ] No `contextmenu` event in the file is asserted `defaultPrevented === false`.
- [ ] The file passes against the module change.

## Verification

Run in the foreground in `/Users/taco/gits/tacogips/chilla`. Log to
`tmp/preview-contextmenu-guard/pdf-pane.log` and record the exit status.

1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/PdfFilePreviewPane.vitest.tsx` must exit 0.
2. `bunx biome check src/features/preview/PdfFilePreviewPane.vitest.tsx --diagnostic-level=warn` must exit 0.

## Fanout Safety

Read the file fresh, record sha256 before and after the edit, and stop on drift. No git index operations.

## Write Paths

Mirrors `impl-plans/active/preview-contextmenu-guard-dispatch.json`.

- writePaths: `src/features/preview/PdfFilePreviewPane.vitest.tsx`, `impl-plans/active/preview-contextmenu-guard-pdf-pane.md`
- sharedPaths: none
- artifactRoots: none

## Progress Log

### Session: 2026-11-04 (planning)
**Tasks Completed**: plan authored
**Notes**: Implementation pending.

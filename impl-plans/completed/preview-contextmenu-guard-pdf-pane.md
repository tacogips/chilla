# Preview Context-Menu Guard PDF Pane Tests Implementation Plan

**Status**: Completed
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

- [x] No `contextmenu` event in the file is asserted `defaultPrevented === false`.
- [x] The file passes against the module change.

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

### Session: 2026-11-04 (implementation)
**Tasks Completed**: Changed the plain PDF contextmenu assertion to expect prevention; the moved-right assertion and gesture checks remain unchanged. Other false expectations concern wheel events.
**Evidence**: `tmp/preview-contextmenu-guard/preview-contextmenu-guard-pdf-pane/` contains pre/post hashes, edit intentions and complete logs. Test SHA-256 before: `8db37407337dfd2d9150137db99a8e7a3cb4ffc7f78a2b14ad759ff1a4263f1d`; after: `84618c23bbc82f1c113b71c60d122bc87e0a77647d44fb83e4b43f24edac4974`. Plan pre/post hashes are recorded separately in `pre-sha256.txt` and `post-sha256.txt`.
**Verification**: `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/PdfFilePreviewPane.vitest.tsx` exited 0 (9 passed; `vitest.log`); `bunx biome check src/features/preview/PdfFilePreviewPane.vitest.tsx --diagnostic-level=warn` exited 0 (`biome.log`). These checks ran on the shared tree; final integration review remains downstream.

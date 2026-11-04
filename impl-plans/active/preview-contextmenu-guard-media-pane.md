# Preview Context-Menu Guard Video Pane Tests Implementation Plan

**Status**: Ready
**Plan ID**: preview-contextmenu-guard-media-pane
**Wave**: 2
**Depends On**: preview-contextmenu-guard-module
**Design Reference**: design-docs/specs/architecture.md#verification (pane-test bullet)
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

`preview-contextmenu-guard-module` makes the pan-target `contextmenu` listener
prevent the native menu except for editable targets or a non-empty selection.
`src/features/preview/MediaFilePreviewPane.vitest.tsx` (video pan test, around
L163-195) still asserts the old contract. This plan updates only those
assertions.

## Non-Goals

- Do not edit `MediaFilePreviewPane.tsx`, `previewPanZoom.ts` or other tests.
- Do not change pan, hidden-pane or audio assertions.

## Deliverables

### 1. `src/features/preview/MediaFilePreviewPane.vitest.tsx`

- In the video right/middle pan test that defines the local `menu()` helper:
  - After the plain right press and release (`pointerdown 2` and `pointerup 2` at x=0,
    around L183-185), `expect(menu()).toBe(false)` becomes `toBe(true)`.
  - After the middle gesture (around L186-189), `expect(menu()).toBe(false)`
    becomes `toBe(true)`.
  - Keep `expect(menu()).toBe(true)` after the moved right gesture.
- If the test title mentions "only moved right" menus, adjust it to describe
  the suppressed native menu. Otherwise leave the title unchanged.
- Run `grep -n contextmenu` on the file. Only this helper should exist.

## Invariants

- Only boolean expectations (and at most the title) change.

## Acceptance Criteria

- [ ] `grep -n "expect(menu()).toBe(false)" src/features/preview/MediaFilePreviewPane.vitest.tsx` finds nothing.
- [ ] The file passes against the module change.

## Verification

Run in the foreground in `/Users/taco/gits/tacogips/chilla`. Log to
`tmp/preview-contextmenu-guard/media-pane.log` and record the exit status.

1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/MediaFilePreviewPane.vitest.tsx` must exit 0.
2. `bunx biome check src/features/preview/MediaFilePreviewPane.vitest.tsx --diagnostic-level=warn` must exit 0.

## Fanout Safety

Read the file fresh, record sha256 before and after the edit, and stop on drift. No git index operations.

## Write Paths

Mirrors `impl-plans/active/preview-contextmenu-guard-dispatch.json`.

- writePaths: `src/features/preview/MediaFilePreviewPane.vitest.tsx`, `impl-plans/active/preview-contextmenu-guard-media-pane.md`
- sharedPaths: none
- artifactRoots: none

## Progress Log

### Session: 2026-11-04 (planning)
**Tasks Completed**: plan authored
**Notes**: Implementation pending.

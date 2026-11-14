# Preview Context-Menu Guard Video Pane Tests Implementation Plan

**Status**: Completed
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

- [x] `grep -n "expect(menu()).toBe(false)" src/features/preview/MediaFilePreviewPane.vitest.tsx` finds nothing.
- [x] The file passes against the module change.

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

### Session: 2026-11-04 (implementation)
**Tasks Completed**: Updated the two video context-menu expectations; retained all other assertions. Formal review and archiving remain downstream.
**Evidence**: `tmp/preview-contextmenu-guard/preview-contextmenu-guard-media-pane/` contains pre/post hashes, edit intentions and complete logs. Source SHA-256 before: `4623d8dc9e39b3eae6b7561348ad8b263dbcad11e616fba0746bb3b486e5036d`; after: `f0f77d3742dfa5d31ce3dc5194a9a3df2f055cd42a051ec316a9adf392e8cbad`. Plan before: `b6ca195c096897564bc6d9d3ccacbca49b934ef9ea6f560ba2c854bb4672154a`; final plan hash is recorded in `post-sha256.txt`.
**Verification**: `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/MediaFilePreviewPane.vitest.tsx` exited 0 (22/22 tests; `vitest.log`). `bunx biome check src/features/preview/MediaFilePreviewPane.vitest.tsx --diagnostic-level=warn` exited 0 (`biome.log`). `rg -n 'contextmenu|expect\(menu\(\)\)' src/features/preview/MediaFilePreviewPane.vitest.tsx` exited 0 and shows one helper and three true assertions (`assertions.log`). Tests ran on the shared working tree.

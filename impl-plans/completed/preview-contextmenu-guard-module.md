# Preview Context-Menu Guard Module Implementation Plan

**Status**: Completed
**Plan ID**: preview-contextmenu-guard-module
**Wave**: 1 (no dependencies)
**Depends On**: none
**Design Reference**: design-docs/specs/architecture.md#pan-gesture-contract (bullet "Context menu (native-menu guard ...)"), #platform-event-order, #verification
**User QA**: design-docs/user-qa/qa-preview-right-drag-pan.md (resolved, session-718)
**Behavioral Reference (read-only)**: /Users/taco/gits/tacogips/nodetto-cloud/nodetto-app/apps/desktop/src/shell/native-context-menu.ts (`keepsNativeContextMenu`, `installNativeContextMenuGuard`)
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

In the real macOS debug app, right-dragging a preview does not pan. WebKit fires
`contextmenu` when the right button goes DOWN, before any `pointermove`. The
current handler `contextMenu` inside `attachPreviewPan`
(`src/features/preview/previewPanZoom.ts:282-286`) calls `preventDefault()` only
when `drag?.bit === 2 && drag.panning` or `suppressMenu` is set. Neither is true
at press time, so the native menu (Reload / Inspect Element) opens and takes the
drag. The jsdom tests dispatch `contextmenu` only after the drag, which hides
the bug.

This plan changes the handler to the native-menu guard from the accepted design,
and updates the module unit tests. Pane vitest files and the README are
owned by other plans.

## Non-Goals

- Do not change `pointerDown`, `pointerMove`, `pointerUp`, `pointerCancel`,
  `lostCapture`, `end`, fling, slop, wheel zoom, constants or any exported
  signature (`attachPreviewPan`, `PreviewPanOptions`, `PreviewPanHandle`).
- Do not add a global/window/document listener, a new module, a platform or
  user-agent branch, or an `isActive()` check in the handler.
- Do not use `composedPath()`. Do not trim the selection string.
- Do not add exemptions for canvas, video or links.
- Do not edit `README.md`, `PreviewPane.vitest.tsx`,
  `MediaFilePreviewPane.vitest.tsx`, `PdfFilePreviewPane.vitest.tsx`, any `.tsx`
  pane, `.riela/` or `riela-lock.json`.

## Deliverables

### 1. `src/features/preview/previewPanZoom.ts`

- Add a module-private (not exported) predicate, for example
  `keepsNativeContextMenu(event: MouseEvent): boolean`. It returns true when:
  1. `window.getSelection()?.toString()` is a non-empty string (no trim). If
     `getSelection` is missing or returns null, treat that as no selection.
  2. Or the event target resolves to an element (if `event.target` is a `Text`
     node, use its `parentElement`; any other non-Element target resolves to
     null) for which
     `element.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')`
     is non-null.
     Pitfall: do not use `isContentEditable` (jsdom does not implement it
     reliably). Use the selector. An element whose own or nearest ancestor
     attribute is `contenteditable="false"` but that sits inside an outer
     `contenteditable="true"` matches the outer one, which is acceptable.
     Keep the selector exactly as above.
- Rewrite the `contextMenu` handler with this order:
  1. `if ((drag?.bit === 2 && drag.panning) || suppressMenu)` then call
     `preventDefault()`.
  2. Else, if `!keepsNativeContextMenu(event)`, call `preventDefault()`.
  3. Always set `suppressMenu = false` at the end, as today (any `contextmenu`
     consumes the flag).
- Keep `suppressMenu`, its set in `end()` (L212), its clear in `pointerDown`
  (L218) and in `detach` (L306) unchanged.
- Imitate the existing style of the file: small local arrow functions, no
  classes, `try/catch` only where it already exists.

### 2. `src/features/preview/previewPanZoom.vitest.ts`

- Change the `menu` helper in `setup()` (L60) to accept an optional dispatch
  target element and to create `new MouseEvent("contextmenu", { bubbles: true, cancelable: true })`.
  With no argument it dispatches on `target` as today. It still returns the
  event.
- In `afterEach` (or per test), clear any selection the test created
  (`window.getSelection()?.removeAllRanges()`) and restore any stubs (`vi.restoreAllMocks()` / `vi.unstubAllGlobals()`, following the existing teardown in the file).
- Rename and update `"respects slop and suppresses only a moved right menu"`
  (L203). Keep the slop, scroll and class assertions. The menu after the moved
  right gesture is still `true`. The second consecutive `menu()` (L214) and the
  menu after a plain right press and release (L217) become
  `defaultPrevented === true`.
- In the `"supports middle and optional primary left ..."` test (L232), the
  menu after a middle gesture becomes `true`.
- Keep `"ends chord release without fling, but suppresses menu"` (L246-258)
  unchanged. It must still pass.
- Add a new `describe("native context menu guard")` with these cases:
  - Press-time regression: `pointerdown(button=2, buttons=2)` -> `menu()` is
    `defaultPrevented` before any move -> `pointermove` to x=10 (`buttons=2`)
    -> `target.scrollLeft === 90`, the move is `defaultPrevented`, and the
    panning class is present -> `pointerup` -> the next `menu()` is prevented.
  - No gesture, `menu()` on `target` -> prevented.
  - Child `input` appended to `target` -> `menu(input)` is not prevented. The
    same holds for `textarea`.
  - `div[contenteditable="true"] > span` -> `menu(span)` is not prevented.
    `div[contenteditable=""]` is not prevented. `div[contenteditable="false"]`
    with no editable ancestor is prevented.
  - Text node target: dispatch on a `Text` child of a `contenteditable="true"`
    div -> not prevented.
  - Selection: append a text child to `target`, attach `target` to
    `document.body`, select it with a `Range` (or stub
    `window.getSelection` to return `{ toString: () => "abc" }`) -> plain
    `menu()` is not prevented. After `removeAllRanges()` (or restoring the
    stub), it is prevented again.
  - Pan takes priority over exemptions: with a non-empty selection, do a right
    drag past the slop and `pointerup` -> `menu()` is prevented. The next
    `menu()` (flag consumed, selection still present) is not prevented.
  - `detach()` removes the listener: after `handle.detach()`, `menu()` is not
    prevented.
- Do not change fling, wheel or geometry tests.

## Invariants

- All existing pan, slop, chord, fling, wheel and geometry tests in
  `previewPanZoom.vitest.ts` keep passing with unchanged expectations, except
  the three menu assertions listed above.
- The `contextmenu` listener is registered and removed exactly as today
  (same target, same handler reference).
- No new exports.

## Acceptance Criteria

- [x] A `contextmenu` on a pan target with no gesture, no selection and a
      non-editable target is `defaultPrevented`.
- [x] A `contextmenu` dispatched right after a right `pointerdown`, before any
      move, is prevented, and later moves past the slop pan the container.
- [x] Editable targets (`input`, `textarea`, `[contenteditable]` other than
      `"false"`) and a non-empty selection keep the native menu, unless a right
      pan is active or has just ended.
- [x] This plan changes only its two source files and this
      plan's progress log.

## Verification

Run in `/Users/taco/gits/tacogips/chilla`, in the foreground. Tee each command
to `tmp/preview-contextmenu-guard/module-<name>.log` and record the exit status.

1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/previewPanZoom.vitest.ts`
   must exit 0 and list the new guard cases as passed.
2. `bunx biome check src/features/preview/previewPanZoom.ts src/features/preview/previewPanZoom.vitest.ts --diagnostic-level=warn`
   must exit 0.
3. `bunx tsc --noEmit` must exit 0. This is a workspace typecheck. If it fails
   only in files owned by sibling plans, record that and do not edit those
   files.

Workspace-wide `bun run lint:biome`, `bun run test` and the full `test:dom` belong
to integration review.

## Fanout Safety

- Before each edit, read the file fresh and record its sha256. After the edit,
  record it again. If the pre-hash differs from the last recorded hash, stop
  and report drift. Do not overwrite.
- Do not run git commands that change the index or HEAD.

## Write Paths

Mirrors `impl-plans/active/preview-contextmenu-guard-dispatch.json`.

- writePaths: `src/features/preview/previewPanZoom.ts`, `src/features/preview/previewPanZoom.vitest.ts`, `impl-plans/active/preview-contextmenu-guard-module.md`
- sharedPaths: none
- artifactRoots: none

## Progress Log

### Session: 2026-11-04 (planning)
**Tasks Completed**: plan authored
**Notes**: Implementation pending.

### Session: 2026-11-04 (implementation)
**Tasks Completed**: Implemented the local menu guard and regression coverage; formal review and plan archiving remain downstream.

**SHA-256 before → after**:
- `src/features/preview/previewPanZoom.ts`: `21e95615bc58bba416b0709babbccff71e0d77bdee76c2149742775bf0be632e` → `376268670ff8134a01812d22d39075ee4aee71f36cad72decf9a4d90b435c766`.
- `src/features/preview/previewPanZoom.vitest.ts`: `c04269d7541a1a9aa4c8a651d141921cb0972d5a2ab61944bc0d2375d99a0c9f` → `281288bcc4ad1b704e642fbe4dd2cdd8529ccc3afed8095e9374015c0ce143d7`.
- This plan before: `140eeacae7fd04977832559cc096a912bd6614e3adf9e272cdb8558476844b41`; its post-edit hash is recorded in `tmp/preview-contextmenu-guard/preview-contextmenu-guard-module/plan-post-hash.txt` to avoid a self-referential hash.

**Verification** (complete logs under `tmp/preview-contextmenu-guard/preview-contextmenu-guard-module/`):
- `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/previewPanZoom.vitest.ts`: exit 0, 24 tests passed, `check-agent-vitest.log`.
- `bunx biome check src/features/preview/previewPanZoom.ts src/features/preview/previewPanZoom.vitest.ts --diagnostic-level=warn`: exit 0, `check-agent-biome.log`.
- `bunx tsc --noEmit`: exit 0, `check-agent-tsc.log`.

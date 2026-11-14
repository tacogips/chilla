# Preview Press-Time Selection Guard Module Implementation Plan

**Status**: Completed
**Plan ID**: preview-selection-guard-module
**Wave**: 1 (no dependencies)
**Depends On**: none
**Design Reference**: design-docs/specs/architecture.md#pan-gesture-contract (bullet "Context menu (native-menu guard ...)", rules 1-4 and "Press-time selection record"), #platform-event-order, #verification
**User QA**: design-docs/user-qa/qa-preview-right-drag-pan.md (resolved; follow-up bullet)
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

After commit 77c1236, `keepsNativeContextMenu` in
`src/features/preview/previewPanZoom.ts` keeps the native menu whenever
`window.getSelection()?.toString()` is non-empty at `contextmenu` time. On
macOS WebKit a right press fires `mousedown`, then selects the word under the
pointer, then fires `contextmenu`, all before any move. So over text the guard
sees the selection the press itself made, keeps the native menu (Look Up /
Copy / Inspect Element), and the pan never starts. PDF canvases have no text
and pan correctly.

The fix records, at right-button press time, whether a non-empty selection
existed before the press. It cancels the right `mousedown` when the press
started with no selection, and in `contextmenu` it clears a press-created
selection and prevents the menu. This plan owns the module and its unit tests.
The rendered-pane regression is owned by `preview-selection-guard-preview-pane`.

## Non-Goals

- Do not change `pointerMove`, `pointerUp`/`pointerCancel` scroll/end
  semantics, `lostCapture`, `end`, `PAN_SLOP`, fling, wheel zoom, constants
  or any exported signature (`attachPreviewPan`, `PreviewPanOptions`,
  `PreviewPanHandle`). Add no new exports.
- Do not add a window or document listener, a platform or user-agent branch,
  or `composedPath()`. Do not trim the selection string.
- Do not call `removeAllRanges()` anywhere except rule 3 below.
- Do not edit `README.md`, any pane `.tsx` or any other `*.vitest.tsx`,
  `.riela/`, `riela-lock.json`, `package.json` or `bun.lock`.
- Do not touch the read-only `/Users/taco/gits/tacogips/nodetto-cloud`.
- Do not launch the GUI app. Run no git commands that change the index or HEAD.

## Deliverables

### 1. `src/features/preview/previewPanZoom.ts`

- Split the existing module-private `keepsNativeContextMenu` into two
  module-private helpers (not exported). Keep the selector string and the
  Text-node to `parentElement` resolution exactly as they are today:
  - `hasSelection(): boolean`: `window.getSelection?.()?.toString()` is
    non-empty (no trim; a missing or null selection counts as false).
  - `isEditableTarget(target: EventTarget | null): boolean`: the current
    `closest('input, textarea, [contenteditable]:not([contenteditable="false"])')`
    logic.
- Inside `attachPreviewPan`, add closure state next to `suppressMenu`:
  `let press: { hadSelection: boolean } | null = null;`
- `pointerDown`: before the existing `bit`/`isActive` early return, and only
  when `event.button === 2 && options.isActive()`, set
  `press = { hadSelection: hasSelection() }`. This always replaces any
  previous record, which is the "next press resets" rule. Record even when
  `drag` already exists. For any other press leave `press` as it is, but see
  the reset on pointerup below. The rest of `pointerDown`, including
  `stopFling()`, `suppressMenu = false` and `preventDefault()`, is unchanged.
- New `mouseDown(event: MouseEvent)` handler, registered with
  `target.addEventListener("mousedown", ...)` and removed in `detach`:
  1. Return unless `event.button === 2 && options.isActive()`.
  2. If `press === null`, set `press = { hadSelection: hasSelection() }`.
     Never overwrite an existing record: `pointerdown` came first and saw the
     state before any default action.
  3. If `!press.hadSelection && !isEditableTarget(event.target)`, call
     `event.preventDefault()`.
- `pointerUp` and `pointerCancel`: set `press = null` unconditionally, whether
  or not the pointer id matches the drag, then run the existing logic.
- `contextMenu` handler, new order (this replaces the current body):
  1. `(drag?.bit === 2 && drag.panning) || suppressMenu` leads to
     `preventDefault()`. Unchanged.
  2. Else if `isEditableTarget(event.target)`, do nothing.
  3. Else if `press !== null`: if `press.hadSelection`, do nothing. Otherwise,
     if `hasSelection()` is true, call `window.getSelection()?.removeAllRanges()`.
     Then call `preventDefault()`.
  4. Else: if `!hasSelection()`, call `preventDefault()`. This is the
     unchanged event-time rule.
  Finally, always set `suppressMenu = false` (as today) and `press = null`.
  The record is consumed by any `contextmenu`.
- `detach()`: also remove the `mousedown` listener and set `press = null`.
- Imitate the file's style: local arrow functions, no classes, existing
  `try/catch` only.

Pitfalls:
- Rule 1 must stay first, so that a selection during or just after a pan
  still has its menu prevented. The existing test "keeps the native menu for
  a selection, except during or just after a right pan" depends on this.
- Do not reset `press` in `end()`. `lostpointercapture` must not clear it,
  because WebKit can fire capture changes between press and `contextmenu`.
- Do not `preventDefault` a `mousedown` for button 0 or 1, for an editable
  target, when `isActive()` is false, or when `hadSelection` is true.
- When `isActive()` is false, no record is made, so `contextmenu` follows
  rule 4 exactly as before this change.

### 2. `src/features/preview/previewPanZoom.vitest.ts`

Add these cases to `describe("native context menu guard")`. Add a small
`mouse(type, button = 2)` helper that returns
`new MouseEvent(type, { bubbles: true, cancelable: true, button })` and
dispatches it on a given node. Attach `target` to `document.body` for the
selection cases and remove it at the end, as in the existing selection test.
- (a) macOS order with no prior selection. Append a text node to `target`.
  Send `pointer("pointerdown")`, then dispatch `mousedown(button 2)` on the
  text's parent: `defaultPrevented === true`. Then select the text with
  `selection.selectAllChildren(target)` or `addRange` to simulate the WebKit
  word select. Then `menu()` gives `defaultPrevented === true` and
  `window.getSelection()?.toString() === ""`. Then `pointer("pointermove", 10)`
  gives `target.scrollLeft === 90` and the panning class is present.
- (b) A pre-existing selection: select the text first, then pointerdown and
  mousedown (mousedown `defaultPrevented === false`), then `menu()` gives
  `defaultPrevented === false`, and the selection text still equals the text
  content.
- Editable press: an `input` child (and a `[contenteditable="true"]` child)
  with no selection. Pointerdown and mousedown dispatched on it give a
  mousedown that is not prevented. A simulated selection followed by
  `menu(editable)` gives a menu that is not prevented and a selection that is
  not cleared.
- Windows order and reset: with no selection, pointerdown then pointerup;
  then add a selection; then `menu()` is not prevented (rule 4) and the
  selection is kept.
- Next press resets: press with a selection (record true), pointerup, clear
  the selection, press again: the mousedown is prevented.
- Inactive: `setup({ isActive: () => false })`, then pointerdown, mousedown
  (not prevented), simulated selection, `menu()` not prevented, selection
  kept. This matches the rule 4 behavior before the change.
- Detach: after `handle.detach()`, a right `mousedown` is not prevented. Keep
  the existing detach-menu assertion.
- All existing tests in the file keep passing with unchanged expectations.

## Invariants

- Middle-button pan, `PAN_SLOP`, fling, Ctrl/Cmd+wheel zoom, chord release
  and the `suppressMenu` path behave exactly as before.
- Every listener added in `attachPreviewPan` is removed in `detach()`.
- `removeAllRanges()` is called only in rule 3 with `hadSelection === false`.

## Acceptance Criteria

- [x] Case (a): mousedown and contextmenu are prevented, the press-created
      selection is cleared, and later moves pan.
- [x] Case (b): a pre-existing selection keeps the native menu and stays
      untouched.
- [x] Editable, Windows-order, next-press, inactive and detach cases pass.
- [x] All previous `previewPanZoom.vitest.ts` cases pass unchanged.
- [x] Only this plan's writePaths changed. The progress log records pre/post
      sha256, commands, exit codes and log paths.

## Verification

Run in `/Users/taco/gits/tacogips/chilla`, in the foreground. Tee each command
to `tmp/preview-selection-guard/preview-selection-guard-module/<name>.log` and
record the exit status.

1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/previewPanZoom.vitest.ts`
   must exit 0 with the new cases listed as passed.
2. `bunx biome check src/features/preview/previewPanZoom.ts src/features/preview/previewPanZoom.vitest.ts --diagnostic-level=warn`
   must exit 0.
3. `bunx tsc --noEmit` must exit 0. If it fails only in files owned by a
   sibling plan, record that and do not edit those files.

Workspace-wide `bun run typecheck`, `bun run lint:biome`, `bun run test` and
the full `test:dom` belong to integration review.

## Fanout Safety

- Before each edit, read the file fresh and record its `shasum -a 256`. After
  the edit, record it again. If the file changed since your last recorded
  hash, stop and report drift. Do not overwrite.
- Edit only the writePaths listed below. Run no git mutations.

## Write Paths

These mirror `impl-plans/active/preview-selection-guard-dispatch.json`.

- writePaths: `src/features/preview/previewPanZoom.ts`, `src/features/preview/previewPanZoom.vitest.ts`, `impl-plans/active/preview-selection-guard-module.md`
- sharedPaths: none
- artifactRoots: none

## Progress Log

### Session: 2026-11-04 (planning)
**Tasks Completed**: plan authored
**Notes**: Implementation pending.

### Session: 2026-11-04 (implementation)
**Tasks Completed**: Press-time selection guard and scoped regression tests.
**Notes**: Formal review and the sibling rendered-pane regression remain downstream.
Pre-edit SHA-256: module `376268670ff8134a01812d22d39075ee4aee71f36cad72decf9a4d90b435c766`, tests `281288bcc4ad1b704e642fbe4dd2cdd8529ccc3afed8095e9374015c0ce143d7`, plan `e4b0865865b851f3bc037d0afa75500b9eb4d2a6310a56c76c22ecf4985e2e2b`. Post-edit SHA-256: module `d2c29ce96c88c81828a7ca3c143c5d647394bacf00a5393c2c496ae98401d268`, tests `6e6025ef76c3cc93f7c75f2eae30c899b590adcd74653b6d5a518529abe6fc6e`; plan post-edit hash is recorded in `tmp/preview-selection-guard/preview-selection-guard-module/post-sha256.txt` to avoid self-reference.

Final foreground checks (complete logs under `tmp/preview-selection-guard/preview-selection-guard-module/`):
- `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/previewPanZoom.vitest.ts`: exit 0, 31 passed, `vitest-final.log`.
- `bunx biome check src/features/preview/previewPanZoom.ts src/features/preview/previewPanZoom.vitest.ts --diagnostic-level=warn`: exit 0, `biome-final.log`.
- `bunx tsc --noEmit`: exit 0, `tsc-final.log`.
Initial fixture and formatting failures are retained in `vitest.log` and `biome.log`; the fixtures and formatting were corrected before the final checks.

### Session: 2026-11-04 (step8 completion)
**Tasks Completed**: Adversarial and test-integrity reviews accepted; integration checks on the combined tree passed.
**Notes**: Integration logs in `tmp/preview-selection-guard/reconcile-wave-002/`: `typecheck.log` (bun run typecheck, exit 0), `lint-biome.log` (bun run lint:biome, exit 0, 101 files), `test.log` (bun run test, 67 pass, 0 fail), `test-dom.log` (bun run test:dom, 504 passed). Step 7b E2E skipped (no browser E2E; the Linux-only Tauri E2E does not apply on darwin). Remaining non-blocking gap: the supervising session's macOS WebKit GUI re-check (user-accepted). Archived to `impl-plans/completed/`.

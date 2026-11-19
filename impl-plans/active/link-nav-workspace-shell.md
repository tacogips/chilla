# Link Navigation: Workspace History Integration Implementation Plan

**Status**: Ready
**Plan ID**: link-nav-workspace-shell
**Wave**: 3 (depends on link-nav-history-model, link-nav-keymap-actions, link-nav-header-controls, link-nav-preview-pane, link-nav-preview-links)
**Design Reference**: design-docs/specs/design-link-navigation-history.md#what-pushes-an-entry, #restore-behavior, #triggers
**Created**: 2026-11-19
**Last Updated**: 2026-11-19

---

## Intent And Context

This plan wires everything together in `src/features/workspace/WorkspaceShell.tsx`:

- link navigation from preview panes;
- history push on every successful open;
- Back/Forward restore with scroll;
- toolbar, keymap and mouse triggers;
- pair-view displayed paths.

Single view and pair view must both work, and pair `{` / `}` must not regress.

Contracts from earlier waves:

- `navigationHistory.ts`: `NavigationLocation`, `pushNavigationLocation`,
  `updateCurrentNavigationLocation`, `stepNavigationHistory`, `canGoBack`,
  `canGoForward`, `EMPTY_NAVIGATION_HISTORY`.
- `previewFragment.ts`: `findFragmentTarget`.
- `previewLinks.ts`: `PreviewLinkNavigation`.
- `WorkspaceHeader` optional props `canGoBack`, `canGoForward`, `onGoBack`,
  `onGoForward`.
- `WorkspaceDocumentColumn` / `PairView` optional `onNavigateLink`.
- Keymap actions `history.back` / `history.forward`.

Relevant existing code in `WorkspaceShell.tsx`:

- `previewSelectedFile`, which returns `null` both on success and for a stale
  request, and the error message on failure;
- `handleSelectEntry`, `handleConfirmEntry`, `handleRevealEntry`,
  `handleInitialLoad`, `openSelectedFiles`, the native open drain;
- `handleReloadCurrent`, `refreshSyntaxHighlights` (both must NOT push);
- `keymap.register({ context: "workspace", actions: {...} })`;
- `isPairMode`, `pairState`, `pairLeftPath`, `pairRightPath`, `selectPair`
  (pair list `onSelect`);
- `handleGlobalKeyDown` window listener in `onMount`;
- `diffTarget()`, `isShortcutsHelpOpen()`;
- `src/features/workspace/activeDocumentNavigation.ts`:
  `getActiveDocumentScrollBody` (currently private).

## Non-Goals

- No persistence and no history UI list.
- No unsaved-edit guard.
- No change to the PR diff workspace.
- Do not edit the header, keymap, preview or pair-view files. They are owned by
  earlier plans; if a contract gap is found, report it as a blocker.
- No Rust edits.

## Deliverables

### 1. `activeDocumentNavigation.ts`

- Export `getActiveDocumentScrollBody` unchanged. Add
  `getPairPaneScrollBody(side: "left" | "right"): HTMLElement | null`, which
  queries `[data-pair-pane="<side>"] .pane__body`.

### 2. `WorkspaceShell.tsx`, state

- `const [history, setHistory] = createSignal(EMPTY_NAVIGATION_HISTORY)`.
- `pairDisplayedPaths` signal `{ left: string; right: string } | null`:
  - set from `selectedPair(...)` at startup and on every pair-list selection
    change;
  - `PairView` receives `leftPath={pairDisplayedPaths()?.left ?? pairLeftPath()}`
    and the right equivalent;
  - pair reload keeps using PairView's own `reload`, which loads the displayed
    paths.

### 3. Push on successful opens

- Give `previewSelectedFile` a new optional parameter
  `historyMode: "push" | "none" = "push"` (or an options object) and the
  fragment. Push only inside the `requestId === previewRequestId` success
  branch, after the snapshot or preview is applied.
- In single mode, before pushing, call `captureScroll()`, which updates the
  current entry's `scrollTop` from `getActiveDocumentScrollBody()?.scrollTop`.
- Call sites:
  - `refreshSyntaxHighlights` and `handleReloadCurrent` -> `"none"`;
  - all user opens (tree select/confirm/reveal, initial load, Open Files,
    native open, Git diff target file opens) -> default `"push"`;
  - history restore -> `"none"`.
- `applyMarkdownSnapshot` from the watcher, conflict reload and reload paths
  must not push.
- Debounced tree previews push when the debounced preview succeeds.
- Pair mode:
  - initial `pairState` set -> push
    `{kind:"pair", pairIndex, left:{path, scrollTop:null, fragment:null}, right:{...}}`;
  - pair-list selection change -> capture both sides' scroll, then push the
    new pair snapshot.

### 4. Link navigation handler

`handleNavigateLink(request, side?)`:

- Ignored when `diffTarget() !== null`.
- Single mode:
  - same path as the currently open document -> `captureScroll()`, then
    scroll to `findFragmentTarget(body, fragment)` with `block: "start"` and
    no smooth scroll. Push `{single, path, fragment, scrollTop: null}`. Set
    `selection.anchorId` to the fragment when a TOC item with that `anchorId`
    exists.
  - other path -> `previewSelectedFile(path, false, undefined, false, "push", fragment)`.
    After the content renders, scroll to the fragment target if any, else
    stay at the top.
  - Failure -> the existing error banner; no push.
- Pair mode (with `side`):
  - capture both sides' scroll;
  - same path on that side -> scroll that side's body only;
  - else set `pairDisplayedPaths[side] = path`;
  - push a snapshot with that side replaced. The pair-list selection is
    unchanged.

### 5. Restore (`goBack` / `goForward`)

- No-op when `diffTarget() !== null`, `isShortcutsHelpOpen()`, or
  `stepNavigationHistory` returns `null`.
- Capture the current scroll first, then step.
- Single entry: when the path equals the current document, only scroll.
  Otherwise call `previewSelectedFile(path, false, undefined, false, "none")`,
  then `setSelectedBrowserPath(path)`.
- Pair entry: `setPairState(selectPair(..., pairIndex))` and
  `setPairDisplayedPaths({left, right})` together (use `batch`). This
  selection change must not trigger the selection-change push. Guard it with a
  restoring flag, or push only from the explicit pair-list `onSelect` handler,
  never from an effect.
- Scroll application `applyRestoredScroll(body getter, entry)`:
  - if `scrollTop !== null`, retry once per `requestAnimationFrame` for up to
    1000 ms until `body.scrollHeight - body.clientHeight >= scrollTop`, then
    set `scrollTop`. Always do a final set at timeout.
  - otherwise, if there is a fragment, `findFragmentTarget` and
    `scrollIntoView({block: "start"})`.
  - Each new navigation cancels the previous pending restore loop (run-id
    counter).
- If a restore fails to open, show the existing error banner and keep the new
  index.

### 6. Triggers

- `keymap.register` actions: `"history.back": () => goBack()`,
  `"history.forward": () => goForward()`.
- `WorkspaceHeader`: `canGoBack={diffTarget() === null && canGoBack(history())}`,
  the forward equivalent, plus `onGoBack` / `onGoForward`.
- Mouse, in `onMount`, removed in `onCleanup`:
  - `window` `mouseup`: `button === 3` -> `goBack()`, `button === 4` ->
    `goForward()`, and `preventDefault`;
  - `mousedown` and `auxclick` with button 3 or 4 -> `preventDefault` only.
  - Ignore when the target is inside `[role="dialog"]`.
- Pass `onNavigateLink={handleNavigateLink}` to the single-view
  `WorkspaceDocumentColumn`, and `onNavigateLink={(side, r) => handleNavigateLink(r, side)}`
  to `PairView`.

## Pitfalls

- Stale-request guard: push only when the open is still current. A stale
  `null` return must not push. Prefer pushing from inside the success branch,
  not from the return value.
- Do not push on reload or refresh; duplicates are also suppressed, but be
  explicit.
- Do not let restoring a pair index fire the selection-change push.
- Do not break the existing `{` / `}` handlers or `selectPair` keyboard flows.
- Keep `previewRequestId` semantics intact.
- `requestAnimationFrame` must exist in jsdom tests; use fake timers or
  stub rAF.

## Tests (`src/features/workspace/WorkspaceShell.vitest.tsx`)

Reuse the existing IPC mocks (`openDocument`, `openFilePreview`, startup
context).

- startup single doc A, link to B -> B opened; Back button enabled; click Back
  -> A re-opened via `openDocument("A")`; Forward enabled
- Forward -> B opened again; at the end Forward is disabled
- A -> B via link, Back to A, then a file-tree confirm of C -> Forward
  disabled (truncated)
- Meta+[ keydown on the body -> Back performed; the same keydown with a
  focused textarea -> not performed
- `mouseup` button 3 -> back; button 4 -> forward
- same-file anchor link -> no `openDocument` call; history grows; Back keeps
  the same document
- failed link open (mock rejects) -> error banner shown; Back state unchanged
- reload (`r`) -> history length unchanged
- diff target active -> Back and Forward disabled; `history.back` is a no-op
- pair mode, two pairs: left-pane link to X -> PairView left path X, right
  unchanged; Back -> left path restored; `{` still toggles left visibility;
  selecting pair 2 from the list pushes; Back returns to pair 1
- scroll restore: the stubbed body `scrollTop` is set to the captured value
  after Back

## Verification

- `bunx vitest run --config vitest.config.ts src/features/workspace` -> all
  pass, exit 0
- `bun run typecheck` -> exit 0
- `bunx biome check src/features/workspace/WorkspaceShell.tsx src/features/workspace/WorkspaceShell.vitest.tsx src/features/workspace/activeDocumentNavigation.ts`
  -> no errors

Full gates run at reconciliation, not per plan: `bun run test`,
`bun run test:dom`, `mise run lint`, the cargo check, clippy and nextest
commands, and building and launching `target/debug/chilla` per
`.agents/skills/chilla-post-edit-launch/SKILL.md`.

## Completion Criteria

- [ ] History is pushed on all successful user opens, never on reload or
      restore
- [ ] Back/Forward restore file plus scroll in single and pair view
- [ ] Toolbar, keyboard and mouse triggers wired; disabled in diff mode
- [ ] Listed tests pass; existing WorkspaceShell tests still pass

## Progress Log

### Session: 2026-11-19
**Tasks Completed**: Plan created
**Notes**: `WorkspaceShell.tsx` is large. Read it fresh, record its hash
before and after editing, and keep edits localized.

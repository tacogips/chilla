# Link Navigation: Workspace History Integration Implementation Plan

**Status**: Completed
**Completion**: 2026-11-19. Adversarial review accepted (comm-019092, integration comm-019097). Serial reconciliation gates passed (`tmp/link-nav-history-20261119-01/serial-reconcile-wave-001/`). Mouse button 3/4 delivery in macOS WKWebView is not yet observed manually (non-blocking). Archived to `impl-plans/completed/link-nav-workspace-shell.md`.
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

- [x] History is pushed on all successful user opens, never on reload or
      restore
- [x] Back/Forward restore file plus scroll in single and pair view
- [x] Toolbar, keyboard and mouse triggers wired; disabled in diff mode
- [x] Listed tests pass; existing WorkspaceShell tests still pass

## Progress Log

### Session: 2026-11-19
**Tasks Completed**: Plan created
**Notes**: `WorkspaceShell.tsx` is large. Read it fresh, record its hash
before and after editing, and keep edits localized.

### Session: 2026-11-19 — implementation
**Tasks Completed**: Integrated single/pair navigation history, triggers and scroll restoration; added focused regression coverage. Open Files captures the outgoing scroll before clearing, mixed-mode history restores the correct view, and fragmentless links reset the destination scroll. Pair-list Enter on the current pair resets link-overridden paths; duplicate history suppression applies.
**Verification**: `NODE_OPTIONS=--no-webstorage bunx vitest run --config vitest.config.ts src/features/workspace` passed 114/114; `bun run typecheck` and the plan-scoped Biome check passed. The exact unmodified workspace Vitest command failed 9 of 114 tests with localStorage undefined; `mise exec` reproduced that result. Baseline comparison and final disposition remain pending. Logs: `tmp/link-nav-history-20261119-01/link-nav-workspace-shell/check-agent-01/`. Workspace-wide gates and formal review remain downstream.
**Per-edit source SHA-256 ledger** (intent files and complete logs are in `tmp/link-nav-history-20261119-01/link-nav-workspace-shell/ts-agent-01/`):

- `active`: before `6a5b6d38042d56ca54ff13bd4523194e9901d59b538e2d4d0c5665c841d71e4f  src/features/workspace/activeDocumentNavigation.ts`; after `25dc20704e40b45a07b4022fbf17f9150b333ee2ba74745c1e175a2af0cd9c23  src/features/workspace/activeDocumentNavigation.ts`.
- `capture`: before `a737777fc5bd63c0b50d29e4f33a5afac2c9d100a7672466dd6a5bbe9ff1f3a4  src/features/workspace/WorkspaceShell.tsx`; after `3031217f987b3245b78cda61672496e37a8df43ee71059cb50a87ee6a9e4bd7e  src/features/workspace/WorkspaceShell.tsx`.
- `click`: before `10cf84d13db0ef2e8cf55517c6dd91164fe9ef7199e45b13ce5d56d823056b98  src/features/workspace/WorkspaceShell.vitest.tsx`; after `c6ddba7efca70834e5fe302d8afb5969e86f62c079b098ad23aa37d1cc31da6b  src/features/workspace/WorkspaceShell.vitest.tsx`.
- `context-assert`: before `c348fc864648dbd23e64ea717539dfce918f143226aaf5afc7a6a4b1571f11e0  src/features/workspace/WorkspaceShell.vitest.tsx`; after `dff5dc1ed5dcf38f4941420cf1b8b12257debdf9bf5886483810479514e06f33  src/features/workspace/WorkspaceShell.vitest.tsx`.
- `context-format`: before `3031217f987b3245b78cda61672496e37a8df43ee71059cb50a87ee6a9e4bd7e  src/features/workspace/WorkspaceShell.tsx ; dff5dc1ed5dcf38f4941420cf1b8b12257debdf9bf5886483810479514e06f33  src/features/workspace/WorkspaceShell.vitest.tsx`; after `3ee2e1f055c2e0c6fa07625a7160c2df9e077fc3ebe950aed5b1cce3e47f17cf  src/features/workspace/WorkspaceShell.tsx ; e5331253f46fa948929a5025ddc36499442e01b4afe130c36a3792c54c9c2d88  src/features/workspace/WorkspaceShell.vitest.tsx`.
- `context-test`: before `98ff2b4705bfff9a5ff48bd08b4c98275c2deecf6026d0eef24ba6589c5d1e28  src/features/workspace/WorkspaceShell.vitest.tsx`; after `c348fc864648dbd23e64ea717539dfce918f143226aaf5afc7a6a4b1571f11e0  src/features/workspace/WorkspaceShell.vitest.tsx`.
- `context`: before `e63daebd3c0a0677cfd4af9be1c4f8c57d974ad033ce502b0239635daaf7141d  src/features/workspace/WorkspaceShell.tsx`; after `a737777fc5bd63c0b50d29e4f33a5afac2c9d100a7672466dd6a5bbe9ff1f3a4  src/features/workspace/WorkspaceShell.tsx`.
- `coverage`: before `c6ddba7efca70834e5fe302d8afb5969e86f62c079b098ad23aa37d1cc31da6b  src/features/workspace/WorkspaceShell.vitest.tsx`; after `bc6ea226d867d8afa8e4f3f1d4f256d407b2094ca5e158e1755d2dfc99780067  src/features/workspace/WorkspaceShell.vitest.tsx`.
- `dblclick`: before `9a11dcf4b6667a41521adef1e6fc9a0ce35e0ecff9e024df0fafe782ef9a80ff  src/features/workspace/WorkspaceShell.vitest.tsx`; after `10cf84d13db0ef2e8cf55517c6dd91164fe9ef7199e45b13ce5d56d823056b98  src/features/workspace/WorkspaceShell.vitest.tsx`.
- `diff-fix`: before `d9147210d52dcaaacd9f8d0e25604ed22899abfab3aae0bf0d425fd27a15b5a0  src/features/workspace/WorkspaceShell.vitest.tsx`; after `30694ee2e12069410e6880a9ddb25b5099e7d980a78717e1ddda727ed79e419b  src/features/workspace/WorkspaceShell.vitest.tsx`.
- `format-final`: before `e63daebd3c0a0677cfd4af9be1c4f8c57d974ad033ce502b0239635daaf7141d  src/features/workspace/WorkspaceShell.tsx ; bc6ea226d867d8afa8e4f3f1d4f256d407b2094ca5e158e1755d2dfc99780067  src/features/workspace/WorkspaceShell.vitest.tsx ; 0fc16e9e859d664bce226c8828f86b8316d323bd6f7275c8f54641be0eb9718c  src/features/workspace/activeDocumentNavigation.ts`; after `e63daebd3c0a0677cfd4af9be1c4f8c57d974ad033ce502b0239635daaf7141d  src/features/workspace/WorkspaceShell.tsx ; f01ab2e2f47fb7d366c5e5df6b56fda38225d87ed2fb00cd9f395631b1c8bee2  src/features/workspace/WorkspaceShell.vitest.tsx ; 0fc16e9e859d664bce226c8828f86b8316d323bd6f7275c8f54641be0eb9718c  src/features/workspace/activeDocumentNavigation.ts`.
- `format-tests`: before `30694ee2e12069410e6880a9ddb25b5099e7d980a78717e1ddda727ed79e419b  src/features/workspace/WorkspaceShell.vitest.tsx`; after `98ff2b4705bfff9a5ff48bd08b4c98275c2deecf6026d0eef24ba6589c5d1e28  src/features/workspace/WorkspaceShell.vitest.tsx`.
- `format`: before `f76b4c9a31798fc3303641b84732e201b1b06c7ca208037f0c394e66f6927d9c  src/features/workspace/WorkspaceShell.tsx ; 11ac4155935153193daaa0f5c6fcad2365a1f09c1318fd1eefffc0824bc98fe7  src/features/workspace/WorkspaceShell.vitest.tsx ; 25dc20704e40b45a07b4022fbf17f9150b333ee2ba74745c1e175a2af0cd9c23  src/features/workspace/activeDocumentNavigation.ts`; after `ab7633fca3081278108fa710d60d9148fd93b9587f0cc5461f781595610ebe5a  src/features/workspace/WorkspaceShell.tsx ; 26beefe4f90610044248019b2ee522b1c57ea7943167efdb06f6ddfaad6decab  src/features/workspace/WorkspaceShell.vitest.tsx ; 0fc16e9e859d664bce226c8828f86b8316d323bd6f7275c8f54641be0eb9718c  src/features/workspace/activeDocumentNavigation.ts`.
- `pair-start`: before `ab7633fca3081278108fa710d60d9148fd93b9587f0cc5461f781595610ebe5a  src/features/workspace/WorkspaceShell.tsx`; after `6421e1b67debacf1222e68e82d72202ae0bee7be9c426e2b00bd0ab4bc622862  src/features/workspace/WorkspaceShell.tsx`.
- `pair-top-format`: before `7a8abd95201a4cbb6b6a4283382fc5bd08c4ab24b48ec054a1a294ece10d1b1a  src/features/workspace/WorkspaceShell.tsx ; 762cf7b84854ad87ad0c8a36dc6f98f67a4bfa177dc26cdb8302a07007bdfcbd  src/features/workspace/WorkspaceShell.vitest.tsx`; after `b8bca3ba05a1e6a99132dd4d647e59aacc13379120026baacad8598d4f77f4b6  src/features/workspace/WorkspaceShell.tsx ; 762cf7b84854ad87ad0c8a36dc6f98f67a4bfa177dc26cdb8302a07007bdfcbd  src/features/workspace/WorkspaceShell.vitest.tsx`.
- `pair-top-test`: before `e5331253f46fa948929a5025ddc36499442e01b4afe130c36a3792c54c9c2d88  src/features/workspace/WorkspaceShell.vitest.tsx`; after `762cf7b84854ad87ad0c8a36dc6f98f67a4bfa177dc26cdb8302a07007bdfcbd  src/features/workspace/WorkspaceShell.vitest.tsx`.
- `pair-top`: before `3ee2e1f055c2e0c6fa07625a7160c2df9e077fc3ebe950aed5b1cce3e47f17cf  src/features/workspace/WorkspaceShell.tsx`; after `7a8abd95201a4cbb6b6a4283382fc5bd08c4ab24b48ec054a1a294ece10d1b1a  src/features/workspace/WorkspaceShell.tsx`.
- `remaining`: before `f01ab2e2f47fb7d366c5e5df6b56fda38225d87ed2fb00cd9f395631b1c8bee2  src/features/workspace/WorkspaceShell.vitest.tsx`; after `d9147210d52dcaaacd9f8d0e25604ed22899abfab3aae0bf0d425fd27a15b5a0  src/features/workspace/WorkspaceShell.vitest.tsx`.
- `shell-fix`: before `57385f0c8fc056b09cdd310de0841c09fb4cb9b9d7c361d9ebadc2655063db18  src/features/workspace/WorkspaceShell.tsx`; after `f76b4c9a31798fc3303641b84732e201b1b06c7ca208037f0c394e66f6927d9c  src/features/workspace/WorkspaceShell.tsx`.
- `shell`: before `e359fb1eccf3e59581051765828d1fdaa5ec7d99db4b302737fb5316e8111354  src/features/workspace/WorkspaceShell.tsx`; after `57385f0c8fc056b09cdd310de0841c09fb4cb9b9d7c361d9ebadc2655063db18  src/features/workspace/WorkspaceShell.tsx`.
- `stale`: before `6421e1b67debacf1222e68e82d72202ae0bee7be9c426e2b00bd0ab4bc622862  src/features/workspace/WorkspaceShell.tsx`; after `e63daebd3c0a0677cfd4af9be1c4f8c57d974ad033ce502b0239635daaf7141d  src/features/workspace/WorkspaceShell.tsx`.
- `test-fix`: before `26beefe4f90610044248019b2ee522b1c57ea7943167efdb06f6ddfaad6decab  src/features/workspace/WorkspaceShell.vitest.tsx`; after `9a11dcf4b6667a41521adef1e6fc9a0ce35e0ecff9e024df0fafe782ef9a80ff  src/features/workspace/WorkspaceShell.vitest.tsx`.
- `test`: before `e5adf10bcb38ca0cfb26c1ddbfccb6f4204e269f872490e482a09c10b9fcd9c4  src/features/workspace/WorkspaceShell.vitest.tsx`; after `11ac4155935153193daaa0f5c6fcad2365a1f09c1318fd1eefffc0824bc98fe7  src/features/workspace/WorkspaceShell.vitest.tsx`.

### Session: 2026-11-19 — fresh verification
**Tasks Completed**: Confirmed the existing workspace integration against the accepted design and completed the plan-scoped verification.
**Verification**: The exact `bunx vitest run --config vitest.config.ts src/features/workspace` passed 114/114; `bun run typecheck` and the scoped Biome check passed. Complete logs: `tmp/link-nav-history-20261119-01/link-nav-workspace-shell/recheck-02/`. Formal review and workspace-wide gates remain downstream.
**Plan edit SHA-256**: before `3d9fe93767cbf5854c420946350c6e25d0892008c642255ce2e5337cadf3ccdb`; after `7b85a279eeba0b6e432614e07c9c91b9589eb3ae543e0a8e36c2e0c221ddc8fd` (full hashes and intent retained in the evidence directory).

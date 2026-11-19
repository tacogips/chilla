# Link Navigation: Keymap Actions Implementation Plan

**Status**: Completed
**Completion**: 2026-11-19. Adversarial review accepted (comm-019097). Serial reconciliation gates passed (`tmp/link-nav-history-20261119-01/serial-reconcile-wave-001/`). Archived to `impl-plans/completed/link-nav-keymap-actions.md`.
**Plan ID**: link-nav-keymap-actions
**Wave**: 1 (no dependencies)
**Design Reference**: design-docs/specs/design-link-navigation-history.md#triggers (Keyboard)
**Created**: 2026-11-19
**Last Updated**: 2026-11-19

---

## Intent And Context

This plan adds the workspace keymap actions `history.back` and
`history.forward` with their default bindings, so they are configurable and
listed in help.

`KeymapActions` in `src/features/keymap/KeymapProvider.tsx` is `Partial`, so
adding action names does not break `WorkspaceShell`. The shell plan (wave 3)
registers the handlers.

Rust `keymap_config` passes action strings through without validation, so no
Rust change is needed.

Existing code to imitate:

- `src/features/keymap/keymap.ts`: `WORKSPACE_ACTIONS`;
  `DEFAULT_KEYMAP_INPUT.workspace`, including the paired
  `b("<C-o>", ...)` / `b("<D-o>", ...)` entries.
- Tests: `src/features/keymap/keymap.vitest.ts` (normalization and default
  keymap); `src/features/keymap/KeymapProvider.vitest.tsx` (dispatch and
  editable guard).

## Non-Goals

- Do not edit `KeymapProvider.tsx`. The existing editable guard already blocks
  workspace bindings inside input, textarea, select and contenteditable
  elements, except `files.open` / `document.save` / `noop`. Do NOT add the new
  actions to that exception list.
- Do not touch `WorkspaceShell.tsx`, the header or any Rust file.

## Deliverables

### `src/features/keymap/keymap.ts`

- Append `"history.back"` and `"history.forward"` to `WORKSPACE_ACTIONS`,
  after `"document.next"`.
- Add to `DEFAULT_KEYMAP_INPUT.workspace`:
  - `b("<D-[>", "history.back", "Go back in link navigation history")`
  - `b("<C-[>", "history.back", ...)`
  - `b("<A-Left>", "history.back", ...)`
  - `b("<D-]>", "history.forward", "Go forward in link navigation history")`
  - `b("<C-]>", "history.forward", ...)`
  - `b("<A-Right>", "history.forward", ...)`
- Confirm that `normalizeKey("<D-[>")` yields `<D-[>` (split on `-` gives
  `["D", "["]`). If the notation fails to parse, report it; do not change the
  parser beyond what these keys need.

### `README.md`

- In the "Workspace actions:" sentence (around line 418), add
  `history.back`, `history.forward` before "`noop` is valid".
- Add one sentence listing the default keys:
  `Cmd/Ctrl+[` and `Alt+Left` go back; `Cmd/Ctrl+]` and `Alt+Right` go
  forward; mouse back/forward buttons work where the webview delivers them.
- Edit only this paragraph.

## Pitfalls

- Conflict check: no existing workspace, file or diff binding uses these keys.
  `{` / `}` (`pair.*.toggle`) are distinct keys produced by Shift+[.
- Key repeat: `KeymapProvider` drops repeats except for a fixed list. Do not
  add history actions to that list.

## Tests

`keymap.vitest.ts`:

- The default workspace keymap contains `history.back` bound to `<D-[>`,
  `<C-[>` and `<A-Left>`, and `history.forward` bound to `<D-]>`, `<C-]>` and
  `<A-Right>`.
- `eventKey` for KeyboardEvent `{key:"[", code:"BracketLeft", metaKey:true}`
  -> `<D-[>`.
- `eventKey` for `{key:"ArrowLeft", altKey:true}` -> `<A-Left>`.
- A user config binding `history.forward` in `workspace.append_keymap`
  compiles; `history.back` in the `mgr` context is rejected.
- No default key sequence is bound twice within a context (duplicate check
  over the defaults).

`KeymapProvider.vitest.tsx`:

- Register a workspace scope with a `history.back` spy. Meta+[ dispatched on
  `document.body` -> spy called once.
- The same event with a focused `<textarea>` target -> spy not called and
  `defaultPrevented` false.
- Alt+ArrowLeft on an `<input>` -> spy not called.
- `{` keypress still calls the `pair.left.toggle` spy and not `history.back`.

## Verification

- `bunx vitest run --config vitest.config.ts src/features/keymap` -> all
  pass, exit 0
- `bun run typecheck` -> exit 0
- `bunx biome check src/features/keymap/keymap.ts src/features/keymap/keymap.vitest.ts src/features/keymap/KeymapProvider.vitest.tsx`
  -> no errors

## Completion Criteria

- [x] Two actions and six default bindings added
- [x] README actions list updated
- [x] New keymap and provider tests pass; existing ones are unchanged and
      passing

## Progress Log

### Session: 2026-11-19
**Tasks Completed**: Plan created
**Notes**: Read files fresh and record hashes before and after editing.
`README.md` contains no pre-existing uncommitted changes. Touch only the
workspace-actions paragraph.

### Implementation: 2026-11-19
**Tasks Completed**: Added actions, defaults, README guidance and focused regression tests. Provider implementation unchanged.
**Verification**: Focused Vitest: 57 passed; Biome: passed. `bun run typecheck` failed on sibling `src/features/workspace/navigationHistory.vitest.ts:50` (TS2345); rerun after sibling repair. These checks ran on a moving shared tree. Formal review and workspace-wide gates remain downstream.
**Per-edit SHA-256**:
- `src/features/keymap/keymap.ts`: before `915b5a545c0d8d414c130982451eb1ae45aa63cfa8d8c055b345f9c4bd39606f`, after `fd4d9d426da47a3e73a20f644a681024ddccf0f8a2e71cdb38ea67186d29b134`.
  Formatting edit: before `fd4d9d426da47a3e73a20f644a681024ddccf0f8a2e71cdb38ea67186d29b134`, after `fd4d9d426da47a3e73a20f644a681024ddccf0f8a2e71cdb38ea67186d29b134`.
- `src/features/keymap/keymap.vitest.ts`: before `778d98f5b1c2effb298d2d234e3c36b2ce54f035860656810d9ea0032546e5d6`, after `856fd05aa820cf990f073db6ab33a40dd78451750a59d738b8b711cad7723491`.
  Formatting edit: before `e982a284b403ea4a86b8e2531800fe8d42ac1bcd10d71dcc8eff94d793fc7d88`, after `856fd05aa820cf990f073db6ab33a40dd78451750a59d738b8b711cad7723491`.
- `src/features/keymap/KeymapProvider.vitest.tsx`: before `172c1191cc3109b4c5e6385b4890996fd1abf6f4d7a7c8655ca50e0548ca3a80`, after `3ce38b4622dd99e714051829d324035790c07fb0761f5c69b73bf342e995917a`.
  Formatting edit: before `437ccf183edb935b0c890f1755e4705707b83905bae98903269400f894f132da`, after `3ce38b4622dd99e714051829d324035790c07fb0761f5c69b73bf342e995917a`.
- `README.md`: before `a3dd65cd4754ce6769e17d7893ec1662b3f25cbe6502d6d1a25a55d09380158a`, after `eed72f29320f040079ec4a3fa6416e33425c8be9dd360d5c73af3f4001b0253a`.
- Plan before this progress edit: `719630c84b8c794cdd98089d5df693193b50d96505eb58af5cd4bf96c9894575`; its after hash is recorded in `tmp/link-nav-history-20261119-01/link-nav-keymap-actions/attempt-1/plan.after.sha256` to avoid self-reference.

**Final typecheck retry**: Exit 2 on sibling `src/features/preview/previewLinks.test.ts:68` (TS2769) and `src/features/workspace/navigationHistory.vitest.ts:58` (TS2345); full log: `tmp/link-nav-history-20261119-01/link-nav-keymap-actions/attempt-1/typecheck-final.log`. Plan update before SHA-256: `84ab74631b9fd9bba7f79ae0aec91ca6c748a45ac6ea578b8eefa7ed4c455c85`; after hash recorded in `tmp/link-nav-history-20261119-01/link-nav-keymap-actions/attempt-1/plan-update.after.sha256`.

### Implementation rerun: 2026-11-19
**Tasks Completed**: Confirmed the assigned implementation and design remain aligned; no source changes were needed in this rerun. The earlier sibling typecheck failures are resolved on the current shared tree.
**Verification**: `bunx vitest run --config vitest.config.ts src/features/keymap` passed 57 tests; `bun run typecheck` passed; scoped `bunx biome check` passed. Complete logs are in `tmp/link-nav-history-20261119-01/link-nav-keymap-actions/attempt-2/`. These checks ran on the shared tree; formal review and combined-tree verification remain downstream.
**Plan edit evidence**: Before and after SHA-256 values and intended append are recorded in the attempt-2 evidence directory (the after hash is external to avoid self-reference).

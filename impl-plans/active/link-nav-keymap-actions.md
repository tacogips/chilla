# Link Navigation: Keymap Actions Implementation Plan

**Status**: Ready
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

- [ ] Two actions and six default bindings added
- [ ] README actions list updated
- [ ] New keymap and provider tests pass; existing ones are unchanged and
      passing

## Progress Log

### Session: 2026-11-19
**Tasks Completed**: Plan created
**Notes**: Read files fresh and record hashes before and after editing.
`README.md` contains no pre-existing uncommitted changes. Touch only the
workspace-actions paragraph.

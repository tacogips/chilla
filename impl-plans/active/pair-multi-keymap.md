# Pair View Multi-File: Pane Toggle Keymap Actions

**Status**: Ready
**Plan ID**: pair-multi-keymap
**Wave**: 1 (no dependencies)
**Design Reference**: design-docs/specs/design-pair-view.md (Pane Toggle Shortcuts, Validation/TypeScript keymap)
**Created**: 2026-11-16
**Last Updated**: 2026-11-16

---

## Intent And Context

`{` (Shift+[) toggles the left comparison pane and `}` (Shift+]) toggles the
right one. Both go through the existing keymap system: rebindable and listed
in the keyboard help. This plan adds the actions, the default bindings and
the static help entries. The handlers are registered by
`pair-multi-workspace` in `WorkspaceShell`.

## Pinned Contract (consumed by pair-multi-workspace)

- `WORKSPACE_ACTIONS` in `src/features/keymap/keymap.ts` gains
  `"pair.left.toggle"` and `"pair.right.toggle"`. Append them after
  `"sidebar.toggle"` or at the end; order is not semantic.
- `DEFAULT_KEYMAP_INPUT.workspace` gains:
  - `b("{", "pair.left.toggle", "Toggle left comparison pane (pair view)")`
  - `b("}", "pair.right.toggle", "Toggle right comparison pane (pair view)")`

## Key Points

- `eventKey` already returns `{` for a keydown with `key: "{"` and
  `shiftKey: true`: `{` is not in the `["/", ",", ".", "0"]` `<S-...>`
  special list. Do NOT add `{` / `}` to that list and do NOT bind
  `<S-[>`; bindings match the produced character.
- `normalizeKey("{")` returns `{` (single character). No change needed.
- `KeymapActions` in `src/features/keymap/KeymapProvider.tsx` is
  `Partial<Record<KeymapAction, ...>>` (verified at planning time). Adding the
  actions therefore does not break `WorkspaceShell.tsx` typecheck. Do NOT edit
  `WorkspaceShell.tsx` or `KeymapProvider.tsx` here.
- Static help fallback `SHORTCUT_SECTIONS` in
  `src/features/workspace/workspaceShortcuts.tsx`, Workspace section: add
  - `{ keys: ["{"], description: "Toggle left comparison pane (pair view)" }`
  - `{ keys: ["}"], description: "Toggle right comparison pane (pair view)" }`

  Place them after the `Shift`+`L` entry.
- Check that no existing default binding in `file`, `diff`, or `workspace`
  already uses `{` or `}`. Expected: none.

## Non-Goals

- No handler logic, no WorkspaceShell or PairView edits, no Rust edits.
- No change to the dispatcher (`KeymapProvider.tsx`). Editable fields are
  already filtered there.

## File-Level Changes

- `src/features/keymap/keymap.ts`: actions and default bindings.
- `src/features/keymap/keymap.vitest.ts`: tests.
- `src/features/workspace/workspaceShortcuts.tsx`: static help entries.

## Test Cases (input -> expected)

- The compiled default keymap `workspace` contains a binding with keys `["{"]`
  and actions `["pair.left.toggle"]`, and one with `["}"]` and
  `["pair.right.toggle"]`.
- `eventKey(new KeyboardEvent("keydown", { key: "{", shiftKey: true }))` ->
  `"{"`. The same for `}`.
- A user config entry `{ on: "<C-h>", run: "pair.left.toggle" }` in
  `workspace.append_keymap` compiles without error (the action is valid).
- A user config with an unknown action still throws (existing behavior).

## Invariants

- Existing bindings and descriptions are unchanged.
- No emojis in descriptions.

## Overwrite Safety

Re-read fresh before each edit. Record start hashes. On drift, re-read and
re-apply. Touch only `writePaths`.

## Verification (run from repository root)

1. `bunx vitest run --config vitest.config.ts src/features/keymap`
   -> exit 0.
2. `bunx tsc --noEmit 2>&1 | grep -E "src/features/keymap/|workspaceShortcuts"`
   -> no output.
3. `bunx biome check src/features/keymap src/features/workspace/workspaceShortcuts.tsx`
   -> exit 0.

## Completion Criteria

- [ ] Two actions and two default bindings added.
- [ ] Static help entries added.
- [ ] Tests pass; verification 1-3 pass.
- [ ] Progress log updated.

## Progress Log

### Session: 2026-11-16
**Tasks Completed**: Plan created.
**Notes**: Not started.

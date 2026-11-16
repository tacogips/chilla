# Pair View Multi-File: README Pair View Section

**Status**: Ready
**Plan ID**: pair-multi-readme
**Wave**: 1 (no dependencies)
**Design Reference**: design-docs/specs/design-pair-view.md (Scope, Startup Classification, Active Pane, List Markers, Pane Toggle Shortcuts, Rollout Constraints)
**Created**: 2026-11-16
**Last Updated**: 2026-11-16

---

## Intent And Context

`README.md` (about line 159) describes the 0.4.0 pair view: exactly two
files, no file sidebar, mouse-only eye toggles, and three or more files
opening the sidebar list. Rewrite that bullet to match the accepted design.

## Required Content (rewrite the single pair-view bullet; keep it one bullet or split into at most three sub-bullets)

- `chilla <file_a> <file_b> [more files...]` with two or more distinct
  regular files opens pair view.
- The first file is on the left and the second on the right, in a 50/50
  split, using the same previews as before.
- All files appear, in command-line order with duplicates removed, in the
  left file list. The list starts folded; open it with the header toggle,
  the left-edge strip, or `Shift+L`.
- One pane is active; it is marked "Active". Clicking inside a pane makes it
  active. Choosing a file in the list (click or Enter) opens it in the active
  pane and shows that pane if it was hidden.
- The list marks the files shown on the left and right with `L` / `R`.
- Each pane has an eye icon. `{` toggles the left pane and `}` the right
  pane. Only one pane can be hidden at a time.
- A hidden pane keeps its zoom; `+` / `-` affect only visible panes; `r`
  reloads both panes.
- The same file given more than once counts once; if only one distinct file
  remains, Chilla opens it as a single file.
- A directory argument behaves as before.
- Pair view is only for command-line arguments. Opening files through macOS
  Finder or `open -a` uses the explicit file list.
- Remove the old sentences about "no file sidebar" and "With three or more
  file arguments ... appear as a list in the sidebar instead".

Also, in the same file:

- Keyboard shortcut list (the `Shift+L` bullet, about line 243): add one
  bullet after it: "`{` / `}`: in pair view, hide or show the left / right
  pane (the last visible pane cannot be hidden)."
- Keymap action-name list (about line 415, the line that contains
  `sidebar.toggle`): add `pair.left.toggle` and `pair.right.toggle`.

## Non-Goals

- Do not edit any other README sections, screenshots, the product website
  (`pubpage`), or design docs.
- No emojis.

## File-Level Changes

- `README.md`: the pair-view bullet, one shortcut bullet, and the
  action-name list.

## Overwrite Safety

Re-read fresh before editing; record the start hash. Make one localized edit.

## Verification (run from repository root)

1. `git diff --stat README.md` -> one file, a small localized change.
2. `grep -n "three or more file arguments" README.md` -> no output.
3. `grep -n "pair.left.toggle" README.md` -> at least one match.
   `grep -n "folded" README.md` -> a match inside the pair-view bullet.
4. `git diff --check README.md` -> exit 0.

## Completion Criteria

- [ ] Pair-view bullet rewritten per Required Content.
- [ ] Verification 1-4 pass.
- [ ] Progress log updated.

## Progress Log

### Session: 2026-11-16
**Tasks Completed**: Plan created.
**Notes**: Not started.

# Pair View Questions

These questions relate to `design-docs/specs/design-pair-view.md`. None of
them blocks implementation. The default below applies unless the user decides
otherwise.

## Resolved

- Should the file browser sidebar be available in pair view?
  - Resolved (0.5 revision): yes. The file list is available and starts
    folded; the header toggle, the left-edge expand strip, and `Shift+L`
    expand and fold it.
- Should the eye toggle have a keyboard shortcut?
  - Resolved (0.5 revision): yes. `{` toggles the left pane and `}` toggles
    the right pane through the keymap system.

## Questions

1. Should macOS Finder / Apple Event open-files with two or more files also
   open pair view?
   - Default: no. Pair view is for CLI arguments at launch only, and the
     open-files path keeps the explicit file-set behavior.
2. Should the pane split be resizable (reusing `PaneResizeHandle`)?
   - Default: no. Panes use a fixed 50/50 split.
3. Should pair panes refresh automatically when a file changes on disk?
   - Default: no. The existing reload action re-opens both panes.
4. Which pane is active at startup?
   - Default: the left pane.
5. What happens when the file chosen in the list is already shown in the
   other pane?
   - Default: it is loaded into the active pane as well, so both panes show
     the same file. Panes are not swapped.
6. Should moving the list cursor (`j` / `k` / arrows) preview files in the
   active pane?
   - Default: no. Only click, `Enter` / open, or an immediate-preview request
     loads a file into the active pane, so browsing the list does not replace
     the comparison by accident.
7. Should a pane keep its zoom level when a different file is loaded into it?
   - Default: no special handling. The pane behaves as the single-file view
     does when another file is opened.

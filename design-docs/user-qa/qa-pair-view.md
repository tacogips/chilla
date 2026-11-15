# Pair View Questions

These questions relate to `design-docs/specs/design-pair-view.md`. None of
them blocks implementation. The default below applies unless the user decides
otherwise.

## Questions

1. Should macOS Finder / Apple Event open-files with exactly two files also
   open pair view?
   - Default: no. Pair view is for CLI arguments at launch only, and the
     open-files path keeps the explicit file-set behavior.
2. Should the file browser sidebar be available in pair view?
   - Default: no. The two panes fill the window, and the "Expand left pane"
     tab is not shown.
3. Should the pane split be resizable (reusing `PaneResizeHandle`)?
   - Default: no. Panes use a fixed 50/50 split.
4. Should the eye toggle have a keyboard shortcut?
   - Default: no. Mouse/button only, with accessible button names.
5. Should pair panes refresh automatically when a file changes on disk?
   - Default: no. The existing reload action re-opens both panes.

# Link Navigation History Questions

These questions relate to `design-docs/specs/design-link-navigation-history.md`.
None of them blocks implementation. The default below applies unless the user
decides otherwise.

## Questions

1. Should every file-browser preview (moving the selection with `j` / `k`)
   push a history entry?
   - Default: yes. Each committed preview pushes, browser-style, as the intake
     requires ("any other open pushes an entry"). Consecutive identical
     locations are not duplicated. Alternative: merge consecutive tree
     previews into one entry.
2. Should pair view use one history or one history per pane?
   - Default: one history whose entries are full pair snapshots. Back
     restores both panes and the pair-list selection.
3. Should Ctrl+[ / Ctrl+] also be bound on macOS (and Cmd+[ / Cmd+] on
   Linux)?
   - Default: yes. Both are registered on all platforms, like the existing
     `<C-o>` / `<D-o>`. Users can unbind either through the keymap config.
4. Should a `#fragment` jump inside the same file create a history entry?
   - Default: yes, matching browser behavior. Back returns to the previous
     scroll position in the same file without a reload.

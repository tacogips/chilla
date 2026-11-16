# Pair View Questions

These questions relate to `design-docs/specs/design-pair-view.md`. None of
them blocks implementation. The default below applies unless the user decides
otherwise.

## Resolved

- Should the list in pair view list files or pairs?
  - Resolved (0.5 revision): pairs. One row per LEFT/RIGHT pair; there is no
    active pane and no single-file assignment.
- How are several pairs given on the command line?
  - Resolved (0.5 revision): `chilla --compare LEFT..RIGHT [SPEC ...]`, each
    SPEC split at exactly one `..` into two existing files.
- What do three or more positional files open?
  - Resolved (0.5 revision): the explicit file list, as before 0.5.
- Should the list be available and folded at startup?
  - Resolved (0.5 revision): yes, also for a single pair; header toggle,
    left-edge strip, pane fold button, and `Shift+L` expand and fold it.
- Should the eye toggle have a keyboard shortcut?
  - Resolved (0.5 revision): yes. `{` toggles the left pane and `}` the right
    pane through the keymap system.

## Questions

1. Should `--compare` be combinable with positional paths?
   - Default: no. `--compare` must be the first startup argument and every
     following argument is a SPEC; mixing is a usage error.
2. Is a SPEC whose two sides are the same file allowed?
   - Default: no. It is a usage error, matching the 0.4.0 rule that a pair
     needs two distinct files.
3. Are duplicate pairs detected by canonical path or by raw argument text?
   - Default: canonical paths, so `a..b` and `./a..b` count as one pair.
     `a..b` and `b..a` are different pairs.
4. Can `j` / `k` change the shown pair while the list is folded?
   - Default: no. Pair selection by keyboard needs the list expanded; while
     folded, `j` / `k` keep their existing workspace meaning.
5. Should moving the list selection with `j` / `k` show the pair immediately?
   - Default: yes. Moving the selection shows that pair (no debounce); stale
     pane loads are discarded.
6. Should macOS Finder / Apple Event open-files with two files open pair view?
   - Default: no. Pair view is for CLI arguments at launch only.
7. Should the pane split be resizable?
   - Default: no. Panes use a fixed 50/50 split.
8. Should pair panes refresh automatically when a file changes on disk?
   - Default: no. `r` reloads the shown pair.

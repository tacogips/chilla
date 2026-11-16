# Pair View Design

Side-by-side comparison view for one or more pairs of regular files given at
launch. The main use is comparing before/after images
(`chilla before.png after.png`) and stepping through several comparisons
(`chilla --compare a1.png..a2.png b1.png..b2.png`).

This document extends `design-file-viewer-mode.md` (Startup Behavior) and
`command.md` (startup forms). Everything not stated here keeps the behavior
defined in those documents.

Revision history:

- 0.4.0: exactly two positional files open a fixed two-pane view with no list
  and mouse-only eye toggles.
- 0.5 (this revision): pair view shows a list of LEFT/RIGHT pairs. The new
  `--compare LEFT..RIGHT [SPEC ...]` form opens several pairs; `chilla a b`
  opens one pair. The pair list starts folded. Choosing a pair shows both of
  its files. `{` / `}` toggle the left / right pane.
- Superseded draft: an earlier 0.5 draft (active pane, individual file list
  with `L` / `R` / `LR` badges, three or more positional files opening pair
  view, and a `source_order` option on `list_explicit_file_set`) was rejected
  by the user. None of it is kept except where this document restates it.

## Scope

In scope:

- CLI: the `--compare` startup form and its SPEC resolution.
- CLI classification: exactly two positional files keep the 0.4.0 single-pair
  behavior; three or more positional files go back to the pre-0.5 explicit
  file list.
- The `file_pair` startup payload carries an ordered, non-empty pair list.
- Frontend pair list pane, pair selection, the fold controls, `{` / `}`, and
  the existing two-pane `PairView` without an active-pane concept.

Out of scope (behavior unchanged):

- One file, directory, GitHub diff, and local Git diff startup.
- Three or more positional files: explicit file-set view exactly as before
  0.5 (`StartupTarget::FileSet`, `BrowserRoot::ExplicitFileSet`).
- macOS Finder / Apple Event open-files delivery (`design-macos-file-open.md`)
  and the frontend picker path (`openFiles.ts`).
- `list_explicit_file_set` and its sort/pagination: no new arguments.
- Editing, TOC, and markdown mode in pair view (panes are read-only previews).
- Pane split resizing, synchronized scroll/zoom, file watching, persistence of
  the selected pair or visibility, filtering or sorting the pair list, and
  adding or removing pairs at runtime.

## Compare CLI

Grammar (global flags `--verbose` and `--csv-first-row-header=...` are removed
by `normalize_cli` first, so they may appear anywhere as today):

```text
chilla [global flags] --compare SPEC [SPEC ...]
SPEC := LEFT..RIGHT
```

Placement rules (`parse_normalized_cli`, `src-tauri/src/cli/mod.rs`):

- `--compare` is recognized only as the first user argument after the binary
  path. The check runs before the GitHub shorthand, single-argument, and
  Git-diff dispatch, so it is never read as a path or an unsupported flag.
- Every following argument is a SPEC, including arguments that start with `-`.
  `--compare` cannot be combined with positional paths, GitHub targets, or
  `--no-github-diff-cache` (such arguments fail SPEC resolution below).
- `--compare` with no SPEC is a usage error.
- `--compare` anywhere other than the first user argument (for example
  `chilla a.png --compare b..c`) is a usage error stating that `--compare`
  must come first and cannot be mixed with positional paths.

SPEC resolution (one SPEC at a time, in command-line order):

1. A SPEC must be valid UTF-8 (same rule as other path arguments).
2. Candidate splits: for every byte index `i` where the SPEC has `..` at
   `i..i+2` (overlapping occurrences included), the candidate is
   `LEFT = spec[..i]`, `RIGHT = spec[i+2..]`. Candidates with an empty side are
   skipped.
3. A candidate is valid when both sides are existing regular files:
   `fs::metadata` (follows symlinks, relative paths resolve against the
   process working directory) succeeds and `is_file()` is true. A side that is
   a directory, missing, or unreadable makes the candidate invalid.
4. Exactly one valid candidate is required:
   - zero valid candidates: usage error naming the SPEC, for example
     `--compare SPEC "x.png..y.png" does not name two existing files (expected LEFT..RIGHT)`.
     This covers a missing file and a SPEC without `..`.
   - two or more valid candidates: usage error naming the SPEC and listing
     each valid `LEFT` / `RIGHT` split, asking the user to rename or use a
     different path spelling (for example `./`).
5. Both sides of the chosen split are canonicalized. If they are the same
   canonical file, it is a usage error (`both sides of SPEC "..." are the same
   file`), matching the 0.4.0 rule that a pair needs two distinct files.
6. Deduplication: a pair whose canonical `(left, right)` equals an earlier
   pair is dropped; the first occurrence keeps its position. `a..b` and `b..a`
   are different pairs.

All errors use `AppError::cli_usage(..., 2)` and fail before the window opens.
Verbose I/O recording uses the existing `verbose_log::record_io` calls for
the `metadata` / `canonicalize` operations it performs.

Example: `../x.png..../y.png` has `..` at indices 0, 8, 9, and 10. Index 0
has an empty left side. Index 8 gives `../x.png` / `../y.png`. Indices 9 and
10 give `../x.png.` / `./y.png` and `../x.png..` / `/y.png`, which are valid
only if those files exist. With only `../x.png` and `../y.png` present, the
SPEC resolves to them.

Help text: the usage block gains
`{binary_name} [--verbose] [--csv-first-row-header=true|false] --compare <left>..<right> [<left>..<right> ...]`.
The sentence about two or more file paths is replaced with: "If two file paths
are provided, chilla shows them side by side. If three or more file paths are
provided, chilla opens file view mode with the left pane limited to those
files. --compare LEFT..RIGHT [LEFT..RIGHT ...] opens each pair in a pair list;
each SPEC must split at exactly one `..` into two existing files."

## Startup Classification

Positional-file classification in `resolve_explicit_file_startup` returns to
the 0.4.0 rule (revert the uncommitted change):

| Condition | Startup target |
|-----------|----------------|
| no unique file | existing usage error |
| one unique file (`a`, `a a`, `a ./a`) | `StartupTarget::File` |
| exactly two positional arguments and two unique files (`a b`) | pair target with one pair `(a, b)` |
| any other case with two or more unique files (`a b c`, `a b a`) | `StartupTarget::FileSet` (explicit file list) |

`StartupTarget` (Rust):

- `FileSet(Vec<PathBuf>)` is restored as at HEAD `9aa3772`.
- The pair target holds a non-empty ordered pair list whose type keeps the
  "at least one pair" invariant, for example
  `FilePairs { first: FilePairPaths, rest: Vec<FilePairPaths> }` with
  `FilePairPaths { left: PathBuf, right: PathBuf }`. Both `chilla a b` and
  `--compare` produce it. Exact names are left to the implementation plan.

Rust consumers (exhaustive matches flag each one):

| Location | Pair target behavior |
|----------|----------------------|
| `viewer/service.rs` startup context | `initial_mode: FileView`, `BrowserRoot::FilePair` with the pair list (below), display paths from canonical paths. The `FileSet` arm is restored. |
| `verbose_log.rs` startup-load path | Returns the first pair's left path. The `FileSet` arm is restored. |
| `cli/mod.rs` `run_outcome` | Passes the target through. |

## Startup Payload Contract

```text
BrowserRoot
- file_pair:
  - kind: "file_pair"
  - pairs: [ { left_file_path, right_file_path }, ... ]   (length >= 1, CLI order, deduplicated)
- explicit_file_set: restored exactly as at HEAD 9aa3772
```

- The 0.4.0 top-level `left_file_path` / `right_file_path` fields are removed;
  the first pair is `pairs[0]`. Frontend and backend ship in one bundle, so
  there is no mixed-version case.
- TypeScript (`src/lib/tauri/document.ts`): the `file_pair` variant becomes
  `{ kind: "file_pair"; pairs: readonly FilePairPaths[] }` with
  `FilePairPaths = { left_file_path: string; right_file_path: string }`. The
  normalizer accepts `pairs` and per-pair `left_file_path` / `leftFilePath`
  and `right_file_path` / `rightFilePath`, and rejects a payload whose `pairs`
  is missing, not an array, empty, or has an entry with a missing or
  non-string path.
- `list_explicit_file_set` (Rust command and `listExplicitFileSet` in TS)
  returns to its HEAD signature: the `source_order` / `sourceOrder` option and
  the `LoadedDirectoryState.sourceOrder` field are removed.
- No new Tauri command. Panes load with the existing `open_file_preview` and
  `file_open_options`.

## Frontend Behavior

### State Ownership

`WorkspaceShell` owns the pair state because the pair list, header, keymap,
and panes read or change it. A pure module in `src/features/pair-view/`
(extending `pairPaneVisibility.ts`) holds the transitions and has unit tests:

```text
PairState
- pairs: readonly FilePairPaths[]   (from the startup payload, never changes)
- selectedIndex: number             (0 at startup)
- visibility: PairPaneVisibility    ("both" | "left_only" | "right_only")
```

- `selectPair(state, index)` returns the state with `selectedIndex` set when
  `index` is in range and otherwise returns the state unchanged. Visibility is
  never changed by selection (a hidden pane stays hidden).
- `togglePairPane(visibility, side)`: shows the side if hidden, otherwise
  hides it; hiding the only visible pane is a no-op. "Both hidden" cannot be
  represented. The 0.4.0 transition table (hide left from `both` gives
  `right_only`, and so on) is unchanged.
- Nothing is persisted.

`PairView` is controlled: it receives `leftPath` / `rightPath` (from
`pairs[selectedIndex]`) and `visibility`, and reports
`onChangeVisibility(next)`. It owns each pane's preview, loading flag, and
error, and exposes `reload()` as today. It is not keyed on the paths: when a
selection changes only one side's path (for example `a..b` to `a..c`), only
that pane reloads; the per-side request counter discards stale results when
the selection changes quickly.

### Active-Pane Removal

The active-pane concept is removed entirely. The following must not exist
after the change, and their code, CSS, and tests are deleted:

- `activeSide` state, `onActivate`, pointerdown/focusin activation handlers.
- `pair-view__pane--active`, `data-pair-active`, the pane `aria-current`
  marker, and the accent-border CSS for them (`PairView.css`, `App.css`).
- `pairMarkerForPath`, the `L` / `R` / `LR` badges and their accessible-name
  suffixes in `FileBrowserPane`, and the `sourceOrder` prop and
  "Order: command line" summary.
- Assignment of a single list file into one pane.

### Pair List Pane

A new component `src/features/pair-view/PairListPane.tsx` renders the left
slot in pair mode. `FileBrowserPane` is not used in pair mode, because its
rows are files with sort/filter/pagination semantics that do not apply to
pairs.

- Header: `CollapsePaneButton` (aria-label "Collapse left pane"), the title
  "Pairs", and the count (`N pairs`, singular `1 pair`).
- One row per pair in `pairs` order. The row is a button whose text is
  `basename(left) <-> basename(right)` and whose `title` is
  `fullLeft <-> fullRight`.
- The selected row has `aria-selected="true"` and a selected class; others
  have `aria-selected="false"`. Exactly one row is selected.
- Click on a row: `selectPair`.
- Keyboard: the component registers the existing `file` keymap context,
  enabled only while the list is expanded and the workspace is in pair mode.
  It accepts `cursor.down` / `cursor.up` (move selection by one and show that
  pair; clamped at the ends, no wrap), and `open` / `enter` (show the
  highlighted pair; a no-op re-select when already shown). All other `file`
  actions (parent, filter, sort, view, search, ignored, directory info) are
  not accepted in pair mode. Selecting the already selected pair does not
  reload panes (reload stays on `r`).
- The selected row scrolls into view on selection change.
- While the list is folded, `j` / `k` keep their existing workspace meaning
  and do not change the pair.

### Workspace Integration

The `file_pair` startup branch in `WorkspaceShell`:

- Folds the left slot (`setFileTreeOpen(false)`) for every pair count,
  including one pair.
- Initializes `PairState` with `selectedIndex = 0` and `visibility = "both"`.
- Does not load any directory or explicit file-set listing and does not call
  `previewSelectedFile`.

Layout and controls in pair mode:

- The viewer grid renders `PairListPane` (when expanded) followed by
  `PairView`. `TocPane` and the single-document column are not rendered.
- The header sidebar toggle, the full-height `.workspace__expand-tab`
  left-edge strip, `CollapsePaneButton`, and `Shift+L` (`sidebar.toggle`)
  fold and expand the pair list, with the existing focus handoff
  (`focusVisiblePane`, whose selector includes the pair list so the selected
  row receives focus on expand).
- Header controls that act on a single document stay hidden or disabled, as
  in 0.4.0.
- Reload (`r`, `document.reload`) re-runs `open_file_preview` for the
  currently shown pair only.
- `WorkspaceFeedback.tsx` keeps its `file_pair` loading message.
- `CollapsePaneButton` in `FileBrowserPane` and `PrDiffWorkspace` headers
  (already implemented in the working tree) is kept; it only calls the same
  fold handler.

### Pane Rendering And Visibility

Unchanged from 0.4.0: each pane renders through `WorkspaceDocumentColumn`; a
pane error does not block the other pane; each pane header shows the basename
(full path in `title`) and the eye button; the sole visible pane's eye button
is `aria-disabled="true"` with tooltip "Cannot hide the only visible pane";
the restore strip is rendered on the hidden side; accessible names are
"Hide left pane", "Hide right pane", "Show left pane", "Show right pane" with
`aria-pressed`. Hidden-pane keyboard suppression in `PreviewPane`,
`PdfFilePreviewPane`, and `MediaFilePreviewPane` is unchanged, so `+` / `-`
zoom only visible panes.

### Pane Toggle Shortcuts

- Workspace keymap actions `pair.left.toggle` and `pair.right.toggle` with
  default bindings `{` and `}` (already in `keymap.ts` in the working tree;
  kept). They are rebindable through the existing keymap configuration and
  appear in keyboard help (`ShortcutSectionList` and the static
  `SHORTCUT_SECTIONS` fallback in `workspaceShortcuts.tsx`).
- Handlers apply `togglePairPane` only in pair mode; otherwise they do
  nothing. Editable fields and modal dialogs are already excluded by the
  `KeymapProvider` dispatcher for non-modifier workspace bindings.

## Validation

Rust (`src-tauri/src/cli/tests.rs`, `src-tauri/src/viewer/service/tests.rs`
and/or `service/tests/startup_options_tests.rs`, `src-tauri/src/verbose_log.rs`),
using temp directories as test working roots or absolute paths:

- `--compare a..b c..d` gives pairs `[(a,b), (c,d)]` in order.
- `--compare a..b a..b` and `--compare a..b ./a..b` give one pair;
  `--compare a..b b..a` gives two pairs.
- A SPEC with `..` path components (`../x.png..../y.png`, from a nested
  working directory) resolves to the two parent-directory files.
- Ambiguous SPEC: with files `a`, `.b`, `a.`, and `b` present, `a...b` has
  two valid splits (`a` / `.b` and `a.` / `b`) and fails with exit code 2 and
  a message containing both splits.
- No valid split (missing file, no `..`, a directory side) fails with exit
  code 2 and names the SPEC.
- `--compare` alone fails with exit code 2; `a --compare b..c` fails with exit
  code 2; `--compare a..a` fails with exit code 2.
- `--verbose --compare a..b` and `--compare a..b --csv-first-row-header=true`
  still resolve the pair with the global options applied.
- Positional: `a b` gives one pair; `a a` gives `File`; `a b c` and `a b a`
  give `FileSet` (restored tests); a directory among several paths keeps the
  existing usage error.
- Startup context for a two-pair target serializes as `kind: "file_pair"` with
  `pairs` (two entries, CLI order, canonical paths) and
  `initial_mode: "file_view"`; for `FileSet` it serializes the restored
  `explicit_file_set` root.
- The verbose startup-load path returns the first pair's left path.
- `list_explicit_file_set` source-order tests are removed with the option.

TypeScript (vitest):

- `document.vitest.ts`: the normalizer accepts `file_pair` with `pairs`
  (snake and camel case) and rejects missing, empty, or malformed `pairs`;
  `listExplicitFileSet` sends no `sourceOrder` key.
- Pair state module: `selectPair` in range, out of range, and with a hidden
  pane (visibility unchanged); every visibility transition including the two
  no-ops; no sequence reaches both hidden.
- `PairListPane` DOM tests (new vitest file): row text and `title`, order,
  exactly one `aria-selected="true"`, click selects, `j` / `k` move and clamp,
  `Enter` selects, non-accepted `file` actions do nothing, the count label,
  and the collapse button calling `onCollapse`.
- `PairView.vitest.tsx`: left/right order, eye buttons and disabled sole
  visible button, restore strip, per-pane error, path change of one side
  reloading only that pane; active-pane tests removed and no element has
  `data-pair-active`, `pair-view__pane--active`, or `aria-current`.
- `PairViewHiddenZoom.vitest.tsx`: hidden-pane zoom cases still pass.
- `FileBrowserPane.vitest.tsx`: marker and source-order tests removed;
  `CollapsePaneButton` tests kept.
- `keymap.vitest.ts`: `{` and `}` default bindings kept.
- `WorkspaceShell.vitest.tsx`:
  - A two-pair `file_pair` startup shows pair 1 (`open_file_preview` once per
    path), starts folded with the expand strip shown, and calls no listing
    command.
  - Expanding (header toggle, expand strip, `Shift+L`) shows two rows; clicking
    or `Enter` on the second row shows pair 2; `j` / `k` change the shown pair;
    `CollapsePaneButton` and `Shift+L` fold the list again.
  - A single-pair startup also starts folded and lists one row.
  - With the right pane hidden, selecting another pair keeps it hidden.
  - `{` / `}` hide and restore panes, are no-ops for the sole visible pane,
    do nothing outside pair mode, and do nothing in an editable field.
  - `r` reloads only the shown pair.
  - Restored `explicit_file_set` startup tests (three files) still pass.

Commands:

- `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- `mise run test` (cargo tests, `bun run typecheck`, `bun run test`, and the
  vitest DOM suite)
- `bunx biome check src`
- Runtime: chilla-post-edit-launch skill (`target/debug/chilla --compare
  a.png..b.png c.png..d.png`). If the implementer cannot see the window, this
  check is reported as not performed; the parent session performs the GUI
  check after the workflow.

## Rollout Constraints

- The `file_pair` payload shape changes (`pairs` replaces the two top-level
  fields); Rust and TypeScript change in the same change set.
- User-visible changes relative to 0.4.0: two-file launches gain the folded
  one-row pair list and `{` / `}`; the new `--compare` form is added. Three or
  more positional files keep the pre-0.5 explicit file list.
- Users with a custom `workspace` keymap section that replaces the defaults do
  not get `{` / `}` until they add them (existing keymap behavior).
- The former `impl-plans/active/pair-multi-*.md` plans and
  `impl-plans/active/pair-multi-20261116-01-dispatch.json` described the
  rejected model; they were removed and superseded by the
  `impl-plans/completed/pair-compare-*.md` plans derived from this document.
- `README.md` documents `--compare`, the pair list, the fold controls, and
  `{` / `}`, and drops the active pane and `L` / `R` markers.
- Default decisions still open for user confirmation are listed in
  `design-docs/user-qa/qa-pair-view.md`. They do not block implementation.

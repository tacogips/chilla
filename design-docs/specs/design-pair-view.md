# Pair View Design

Side-by-side comparison view for two or more regular-file CLI arguments at
launch. The main use is comparing before/after images
(`chilla before.png after.png`) and stepping through a series of files
(`chilla v1.png v2.png v3.png`) by loading any of them into either pane.

This document extends `design-file-viewer-mode.md` (Startup Behavior, Explicit
File Set View) and `command.md` (positional path forms). Everything not stated
here keeps the behavior defined in those documents.

Revision history:

- 0.4.0: exactly two positional files open a fixed two-pane view with no file
  list and mouse-only eye toggles.
- 0.5 (this revision): two or more distinct files open pair view; the file
  list is available but starts folded; one pane is active and receives files
  chosen in the list; `{` / `}` toggle the left / right pane.

## Scope

In scope:

- CLI startup classification: two or more positional file arguments that
  resolve to two or more distinct canonical regular files produce the pair
  target. The pair target carries the full ordered, deduplicated file list.
- The `file_pair` startup payload gains the ordered file list.
- An optional `source_order` flag on the existing `list_explicit_file_set`
  command so the pair list keeps deduplicated CLI order across filtering and
  pagination.
- Frontend pair layout with two horizontal panes, each reusing the existing
  preview renderers and an eye toggle.
- The left file list (`FileBrowserPane` in `explicit_file_set` listing mode)
  in pair view, folded at startup.
- Active pane selection and loading list choices into the active pane, with
  L / R markers in the list.
- `{` / `}` keymap actions that toggle the left / right pane.

Out of scope (behavior unchanged):

- Zero or one unique file argument, directory arguments, mixed directory and
  file arguments, GitHub diff targets, and local Git diff targets.
- macOS Finder / Apple Event open-files delivery (`design-macos-file-open.md`)
  and the frontend picker path (`startupContextForPickedTarget` in
  `src/features/workspace/openFiles.ts`). These still build directory or
  frontend-side `explicit_file_set` contexts, even for two or more files.
- Editing. Pair panes are read-only previews. Markdown editing, TOC, and
  file-view to markdown-mode switching are not available in pair view.
- Pane split resizing, synchronized scroll/zoom, live file watching per pane,
  and persistence of pane assignment, active pane, or visibility.
- Directory browsing from the pair file list (no parent navigation, tree view
  of directories, Git-ignored toggle, or recursive search; these are already
  unavailable in `explicit_file_set` listing mode).

## Startup Classification

Classification stays in `resolve_explicit_file_startup`
(`src-tauri/src/cli/mod.rs`). It runs only after the existing GitHub and local
Git-diff detection has declined the arguments. Canonicalization, the directory
rejection message, the non-regular-file error, and first-occurrence
deduplication are unchanged.

`U` is the number of unique canonical regular files after first-occurrence
deduplication. Only the final match changes; the positional-argument count no
longer matters:

| Condition | Startup target |
|-----------|----------------|
| `U == 0` | existing usage error (unchanged) |
| `U == 1` (for example `a a`, `a ./a`, `a a a`) | `StartupTarget::File` (unchanged) |
| `U >= 2` (for example `a b`, `a b c`, `a b a`) | `StartupTarget::FilePair` with the unique files in first-occurrence order (changed) |

Rules:

- `StartupTarget::FilePair` keeps the "at least two" invariant in its type:
  `FilePair { left, right, rest }`, where `left` is the first unique file,
  `right` the second, and `rest` the remaining unique files in order (empty
  for two files). A pair with fewer than two files cannot be represented.
- `a b a` produces `FilePair { left: a, right: b, rest: [] }`.
- Any directory argument among two or more paths still fails with the existing
  `multi-path startup only accepts regular files` usage error (exit code 2).
- `StartupTarget::FileSet` is no longer produced by the CLI and has no other
  constructor; it is removed. `BrowserRoot::ExplicitFileSet` (Rust) is only
  built from `FileSet` and is removed with it. The frontend-built
  `explicit_file_set` context, its TypeScript union variant, its normalizer
  branch, and the `list_explicit_file_set` command stay, because the macOS
  open-files and picker paths use them.
- The CLI help sentence "If two file paths are provided, chilla shows them side
  by side. If three or more file paths are provided, chilla opens file view
  mode with the left pane limited to those files." is replaced with: "If two or
  more file paths are provided, chilla shows the first two side by side and
  lists all of them in the folded left pane; a file chosen in the list opens in
  the active pane."

## Rust Consumers

All `StartupTarget` matches are exhaustive, so the compiler flags every
consumer:

| Location | Behavior for `FilePair` |
|----------|-------------------------|
| `viewer/service.rs` startup context | Builds `initial_mode: FileView` and `BrowserRoot::FilePair` (below). All display paths come from the canonical paths. The `FileSet` arm is removed. |
| `verbose_log.rs` startup-load path | Returns `left` (unchanged). The `FileSet` arm is removed. |
| `cli/mod.rs` (`run_outcome` and the other startup plumbing) | Passes the target through unchanged. |

## Startup Payload Contract

`BrowserRoot::FilePair`, serialized with the existing `kind` tag, gains one
field:

```text
BrowserRoot
- file_pair:
  - kind: "file_pair"
  - left_file_path          (unchanged; equals source_order_paths[0])
  - right_file_path         (unchanged; equals source_order_paths[1])
  - source_order_paths      (new; all unique files in CLI order, length >= 2)
```

- The existing two fields stay so the initial pane assignment is explicit and
  the 0.4.0 field names keep working; `source_order_paths` is the list shown
  in the file list.
- `StartupContext.initial_mode` is `file_view` and `file_open_options` is
  passed through unchanged.
- The TypeScript `BrowserRoot` `file_pair` variant in
  `src/lib/tauri/document.ts` gains `source_order_paths: readonly string[]`.
  The normalizer accepts `source_order_paths` / `sourceOrderPaths` and rejects
  a pair payload when either path field is missing, when `source_order_paths`
  is missing, not an array of strings, or shorter than two, or when its first
  two entries differ from `left_file_path` / `right_file_path`.
- No new Tauri command is added. Panes load with the existing
  `open_file_preview` command and `file_open_options`. The file list loads with
  the existing `list_explicit_file_set` command, given `source_order_paths`
  and the source-order flag below.
- Rust and TypeScript change together (tauri-development skill). The frontend
  and backend ship in one bundle, so there is no mixed-version case.

## Source-Order Listing Contract

The pair list must show rows in deduplicated CLI order. Today
`list_explicit_file_set` always sorts by the requested `DirectoryListSort`
(the frontend default is name ascending, `src/features/file-view/sort.ts`)
before it paginates (`src-tauri/src/viewer/directory_listing.rs`, sort then
`page_bounds`). Sorting each returned page on the frontend afterwards would
not work: rows would still be out of order across pages. The command
therefore gains one optional argument:

```text
list_explicit_file_set(paths, sort?, query?, offset?, limit?, source_order?)
- source_order: Option<bool>, default false
```

Rules (Rust: `src-tauri/src/commands/document.rs`,
`src-tauri/src/viewer/service.rs`, `src-tauri/src/viewer/directory_listing.rs`):

- `source_order` absent or `false`: behavior unchanged (sort by `sort`, then
  paginate). Directory, macOS open-files, and picker explicit lists never send
  `true`, so their order is unchanged.
- `source_order == true`: records keep first-occurrence canonical order of
  `paths` (the existing dedup loop already builds that order), the query
  filter is applied as today, the sort step is skipped, and then pages are
  cut with the existing `page_bounds`. `sort` is ignored. Every page is
  therefore a contiguous slice of one fixed order, so concatenating pages
  always reproduces the source order.

TypeScript (`src/lib/tauri/document.ts`): `listExplicitFileSet` gains an
optional trailing options argument `{ sourceOrder?: boolean }`, sent as the
Tauri invoke key `sourceOrder` (Tauri maps the Rust `source_order` argument to
camelCase). Existing call sites pass nothing and behave as before.

Frontend state (`src/features/workspace/WorkspaceShell.tsx`): the
explicit-file-set `LoadedDirectoryState` gets a `sourceOrder: boolean` field.
The pair startup sets it to `true`. Every later explicit-list request for that
state (load more, query change, `explicit_file_set` reload) reuses the stored
flag, so pagination and filtering stay in source order. Other explicit-list
loads set it to `false`.

Sorting in the pair list: while `sourceOrder` is `true`, sort changes
(`sort.*` and `sort.reset` actions, sort UI) are ignored by
`handleChangeDirectorySort`. `FileBrowserPane` gets an optional
`sourceOrder?: boolean` prop. When it is `true`, the sort summary shows
"Order: command line" instead of `describeFileTreeSort`, and sort actions are
not dispatched. Without the prop, rendering and sorting are unchanged.

Expected order example: `chilla z.png a.png m.png z.png` deduplicates to
`[z.png, a.png, m.png]`. Rows are `z.png, a.png, m.png`; the left pane shows
`z.png` (marker `L`), the right pane shows `a.png` (marker `R`), and `m.png`
has no marker. With a filter that matches only `z.png` and `m.png`, rows are
`z.png, m.png`.

## Frontend Behavior

### State Ownership

`WorkspaceShell` owns the pair state, because the file list, the header, the
keymap, and the panes all read or change it. The state is a pure TypeScript
module in `src/features/pair-view/` (extending `pairPaneVisibility.ts` or a
sibling module) with unit tests:

```text
PairState
- leftPath: string
- rightPath: string
- activeSide: "left" | "right"
- visibility: PairPaneVisibility ("both" | "left_only" | "right_only")
```

Initial state: `leftPath = source_order_paths[0]`,
`rightPath = source_order_paths[1]`, `activeSide = "left"`,
`visibility = "both"`. Nothing is persisted.

`PairView` becomes a controlled component. It receives `leftPath`,
`rightPath`, `activeSide`, and `visibility`, and reports `onActivate(side)` and
`onChangeVisibility(next)`. It keeps owning each pane's `FilePreview | null`,
loading flag, and error, and it exposes `reload()` as today.

### Workspace Integration

The `file_pair` startup branch in `WorkspaceShell`:

- Sets the file tree folded (`setFileTreeOpen(false)`).
- Loads the file list with the existing `loadExplicitFileSetState`
  (`source_order_paths`, selected path = `left_file_path`) in source-order mode
  (see Source-Order Listing Contract), so `directoryState().listingKind` is
  `explicit_file_set` and rows follow deduplicated CLI order. It does not call
  `previewSelectedFile`; the single-document area stays empty.
- Initializes `PairState`.

Layout in pair mode:

- The viewer grid renders `FileBrowserPane` (when the tree is open) followed by
  `PairView` in the document column. `TocPane` and `WorkspaceDocumentColumn`
  for the single document are not rendered.
- `PairView` is not keyed on the pane paths. Changing one pane's path reloads
  only that pane; the other pane keeps its preview, scroll, and zoom state.
- The `isPairMode()` guards in `handleToggleFileTree` and `showExpandTab` are
  removed. The header toggle, the `.workspace__expand-tab` left-edge strip, and
  `Shift+L` (`sidebar.toggle`) expand and fold the list in pair mode exactly as
  in other file-view modes, including the existing focus handoff
  (`focusVisiblePane`).
- Header controls that act on the single active document stay hidden or
  disabled in pair view, as in 0.4.0.
- Reload (`r`, `document.reload`) keeps the pair branch: it re-runs
  `open_file_preview` for the two currently assigned paths. It does not re-list
  the file list.
- `WorkspaceFeedback.tsx` `loadingMessage` keeps its `file_pair` branch.

### Pane Rendering

Unchanged from 0.4.0 except for the active marker:

- Each pane renders its preview with the existing `WorkspaceDocumentColumn`
  (`markdownDoc = null`, CSV `formatted` when available, structured data and
  HTML at their existing defaults). No renderer is duplicated.
- One pane failing to load shows its error inside that pane and does not
  block the other pane.
- Each pane header shows the file basename (full path in `title`) and the eye
  toggle.
- When a pane's path changes, that pane's preview is replaced the same way the
  single-file view replaces a preview when another file is opened. No extra
  zoom preservation or reset logic is added.

### Active Pane

- Exactly one side is active at any time (`activeSide`). The initial active
  side is `left`.
- The active pane's `section` gets the class `pair-view__pane--active` and
  `data-pair-active="true"`; the inactive pane gets neither. The active pane
  shows an accent border and an accented header, and its header shows a small
  "Active" text label so the marker does not rely on color alone.
- A `pointerdown` inside a pane's `section` (capture phase, without
  `preventDefault` or `stopPropagation`) sets that side active, so pan, wheel
  zoom, and right-drag handlers in the preview are unaffected. Keyboard
  `focusin` inside the section also activates it.
- The pane header eye button and the restore strip button do not change the
  active side. Hiding a pane does not change the active side, so the active
  pane can be hidden.

### Loading A List Choice Into The Active Pane

In pair mode, `FileBrowserPane` callbacks are routed as follows:

| List interaction | Existing callback | Pair-mode effect |
|------------------|-------------------|------------------|
| Cursor move (`j` / `k` / arrows) | `onSelectEntry(entry)` | Moves the list highlight only. No pane load and no debounced preview. |
| Click, `Enter` / `open`, or a request with `immediatePreview: true` | `onConfirmEntry` / `onSelectEntry(entry, { immediatePreview: true })` | Moves the highlight and assigns `entry.path` to the active side. |

Assignment rules:

- If the active pane is hidden, it is shown (`visibility` becomes `both`)
  as part of the same assignment.
- If `entry.path` already equals the active side's path, the pane is not
  re-fetched (reload stays on `r`); only the visibility rule applies.
- The same file may be shown in both panes. Choosing the file shown in the
  other pane loads it into the active pane too; panes are not swapped.
- The active side does not change on assignment.
- Entries are always files in this listing mode; there is no directory
  handling path in pair mode.

### List Markers

- `FileBrowserPane` gains one optional prop that maps a path to a marker
  (`"L"`, `"R"`, or `"LR"` when both panes show it). It is passed only in pair
  mode; without it, rendering is unchanged for directory and explicit-file-set
  modes.
- A row whose path is marked shows a small badge after the file name (`L`,
  `R`, or `L R`), and its accessible name gets a suffix such as
  ", shown in left pane", ", shown in right pane", or ", shown in both panes".
- Markers reflect the current `leftPath` / `rightPath`, independent of
  visibility and of the list highlight.

### Pane Visibility State

The three-value union from 0.4.0 stays; "both hidden" cannot be represented:

```text
PairPaneVisibility = "both" | "left_only" | "right_only"
```

| Current | Action | Next |
|---------|--------|------|
| `both` | hide left | `right_only` |
| `both` | hide right | `left_only` |
| `right_only` | show left | `both` |
| `left_only` | show right | `both` |
| `left_only` | hide left | `left_only` (no-op) |
| `right_only` | hide right | `right_only` (no-op) |

A new pure function `togglePairPane(state, side)` returns `showPairPane` when
the side is hidden and `hidePairPane` otherwise, so toggling the only visible
pane is a no-op.

UI rules (unchanged from 0.4.0): the sole visible pane's eye button is
`aria-disabled="true"` with tooltip "Cannot hide the only visible pane"; the
restore strip is always rendered on the hidden side; buttons use the
accessible names "Hide left pane", "Hide right pane", "Show left pane", and
"Show right pane" with `aria-pressed`; glyphs are inline SVG.

Hidden-pane shortcut suppression is unchanged: `PreviewPane`,
`PdfFilePreviewPane`, and `MediaFilePreviewPane` ignore window keydown when
inside a `.pane--hidden, [hidden], [aria-hidden='true']` ancestor, so `+` / `-`
zoom affects only visible panes.

### Pane Toggle Shortcuts

- Two workspace keymap actions are added to `WORKSPACE_ACTIONS` in
  `src/features/keymap/keymap.ts`: `pair.left.toggle` and `pair.right.toggle`.
- Default workspace bindings: `b("{", "pair.left.toggle", "Toggle left
  comparison pane (pair view)")` and `b("}", "pair.right.toggle", "Toggle
  right comparison pane (pair view)")`.
- Bindings match the produced character. `eventKey` already returns `{` / `}`
  for Shift+`[` / Shift+`]` on US layouts, and returns the same characters on
  any layout (for example JIS) whose key produces them. No `<S-...>` mapping is
  added. Users rebind them through the existing keymap configuration.
- `WorkspaceShell` registers both actions in its existing workspace
  `keymap.register` call. The handlers apply `togglePairPane` when
  `isPairMode()` is true and do nothing otherwise.
- Editable fields and modal dialogs are already excluded by the
  `KeymapProvider` dispatcher for non-modifier workspace bindings; no extra
  guard is added. The file-browser (`file`) and diff contexts have no `{` / `}`
  bindings, so there is no conflict. Pair panes are read-only and contain no
  markdown editor.
- The keyboard help overlay lists workspace bindings from the effective keymap
  (`ShortcutSectionList`), so the new bindings appear automatically. The static
  fallback list `SHORTCUT_SECTIONS` in `workspaceShortcuts.tsx` also gets the
  two entries.

## Validation

Rust (`src-tauri/src/cli/tests.rs`, `src-tauri/src/viewer/service/tests.rs`
and/or `service/tests/startup_options_tests.rs`, `src-tauri/src/verbose_log.rs`):

- `a b` produces `FilePair { left: a, right: b, rest: [] }`; `b a` produces
  the reverse.
- `a b c` produces `FilePair { left: a, right: b, rest: [c] }`.
- `a b a` produces `FilePair { left: a, right: b, rest: [] }`.
- `a a`, `a ./a`, and `a a a` produce `File(a)`.
- A directory together with a file still fails with the existing usage error
  and exit code 2.
- A local Git directory plus a commit-ish still resolves to `GitDiff`.
- The startup context for a three-file pair serializes as `kind: "file_pair"`
  with `left_file_path`, `right_file_path`, `source_order_paths` (three
  entries, CLI order), and `initial_mode: "file_view"`.
- The startup-load marker arms the left path for `FilePair`.
- Tests that asserted `FileSet` / `BrowserRoot::ExplicitFileSet` from CLI
  startup are rewritten to the pair expectations.
- `z a m z` (unsorted, with a duplicate) produces
  `FilePair { left: z, right: a, rest: [m] }`, and its startup context has
  `source_order_paths = [z, a, m]`.
- `src-tauri/src/viewer/directory_listing/tests.rs` (or
  `viewer/service/tests.rs`): `list_explicit_file_set` with paths
  `[z.png, a.png, m.png, z.png]`, `source_order = true`, and a name-ascending
  `sort` returns rows `z.png, a.png, m.png`. With `limit = 2`, offset 0
  returns `z.png, a.png` and offset 2 returns `m.png`, with
  `total_entry_count = 3`. A query matching `z` and `m` returns `z.png, m.png`.
  The same paths with `source_order` absent or `false` still return
  `a.png, m.png, z.png` (existing sort unchanged).

TypeScript (vitest):

- `document.vitest.ts`: the normalizer accepts `file_pair` / `filePair` with
  `source_order_paths` / `sourceOrderPaths`, and rejects missing paths, a
  missing or short list, and a list whose first two entries mismatch.
- Pair state module: every visibility transition including the two no-ops;
  `togglePairPane` for each state and side; no sequence reaches "both hidden";
  assignment shows a hidden active pane, keeps the active side, and allows the
  same path on both sides.
- `PairView.vitest.tsx`: left/right order, eye buttons and the disabled sole
  visible button, restore strip, per-pane error with the other pane rendered,
  active marker on the active side only, `pointerdown` inside a pane reporting
  `onActivate`, eye/restore buttons not reporting `onActivate`, and a path
  change reloading only that pane.
- `PairViewHiddenZoom.vitest.tsx`: existing hidden-pane zoom cases still pass.
- `FileBrowserPane.vitest.tsx`: L / R / both markers and accessible-name
  suffixes render only when the marker prop is supplied; with
  `sourceOrder` the summary shows "Order: command line" and sort keys do not
  call `onChangeSort`; without it, sort behavior is unchanged.
- `document.vitest.ts`: `listExplicitFileSet` sends `sourceOrder: true` only
  when the option is given, and sends no `sourceOrder` key otherwise.
- `keymap.vitest.ts`: default workspace bindings include `{` and `}` mapped to
  the new actions; a Shift+`[` event with `key: "{"` resolves to `{`.
- `WorkspaceShell.vitest.tsx`:
  - Two-file and three-file `file_pair` startup renders the pair view with
    `open_file_preview` called once per assigned path, calls
    `list_explicit_file_set` with `source_order_paths`, and starts with the
    file list folded and the expand strip shown.
  - A `file_pair` startup with `source_order_paths = [z.png, a.png, m.png]`
    calls `list_explicit_file_set` with `sourceOrder: true`; the expanded
    list shows rows `z.png, a.png, m.png` in that order, with `L` on `z.png`,
    `R` on `a.png`, and no marker on `m.png`. Load-more and query-change
    requests for that list also send `sourceOrder: true`, and a sort action
    sends no new list request.
  - Non-pair `explicit_file_set` startup and picker loads do not send
    `sourceOrder`.
  - The header toggle, the expand strip, and `Shift+L` expand and fold the
    list in pair mode.
  - With the right pane activated, confirming the third list entry calls
    `open_file_preview` for it and shows it in the right pane; the left pane
    is not reloaded; markers update.
  - Confirming an entry while the active pane is hidden shows that pane.
  - A cursor move in the list does not load any pane.
  - `{` and `}` hide and restore panes, are no-ops for the sole visible pane,
    do nothing outside pair mode, and do nothing while focus is in an
    editable field.
  - Existing `explicit_file_set`, directory, and single-file startup tests
    still pass.

Commands:

- `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- `mise run test` (cargo tests, `bun run typecheck`, `bun run test`, and the
  vitest DOM suite)
- `bunx biome check src`
- Runtime: chilla-post-edit-launch skill. Rebuild, then launch
  `target/debug/chilla <a.png> <b.png> <c.png>`; confirm a/b side by side with
  the list folded, expand the list, activate the right pane, choose c.png, and
  check that `{` / `}` toggle panes. If no GUI verification is possible, report
  this check as partial.

## Rollout Constraints

- The payload change is additive within the `file_pair` variant, and frontend
  and backend ship in one bundle.
- User-visible changes:
  - Launches with three or more positional files resolving to two or more
    unique files (including `a b a`) now open pair view instead of the
    explicit-file-set single-document view. This intentionally replaces the
    previous behavior.
  - Two-file launches gain the folded file list, active pane, and `{` / `}`.
- Single-file, directory, GitHub/Git diff, macOS open-files, and picker
  launches are unchanged.
- Users with a custom `workspace` keymap section that replaces the defaults do
  not get `{` / `}` until they add them; this is the existing keymap
  configuration behavior.
- Default decisions still open for user confirmation are listed in
  `design-docs/user-qa/qa-pair-view.md`. They do not block implementation.

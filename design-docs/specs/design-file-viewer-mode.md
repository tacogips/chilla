# File Viewer Mode Design

Detailed design for extending `chilla` from a Markdown-only workbench into a mixed file viewer with a switchable Markdown editor mode.

## Overview

This document defines the startup behavior, Rust-side file classification, and frontend interaction model for a yazi-style flat directory browser plus viewer pane.

## Startup Behavior

`chilla` accepts zero, one, or multiple positional paths.

| Invocation | Startup Target | Initial Mode |
|-----------|----------------|--------------|
| `chilla` | current working directory | file view |
| `chilla <dir_path>` | requested directory | file view |
| `chilla <markdown_file>` | requested file | markdown |
| `chilla <other_file>` | parent directory + selected file | file view |
| `chilla <file_a> <file_b> ...` | explicit file set + first file selected | file view |

Rules:

- The CLI canonicalizes startup paths before the Tauri window opens.
- Unsupported paths still fail fast before window creation.
- Bare startup uses the current working directory rather than treating missing input as an error.
- Multi-file startup is accepted only when every positional argument resolves to a readable file.
- Multi-file startup preserves the first unique canonicalized CLI filepath as the initially opened file but constrains left-pane selection to the explicit file set rather than the containing directories.

## Modes

### Markdown Mode

- Preserves the existing editor + TOC + rendered preview workflow.
- Is available only when the selected file is Markdown.
- Can be entered from file view mode by selecting a Markdown file and switching modes.

### File View Mode

- Left pane shows only the entries in the current directory, not a recursive tree.
- Right pane shows a preview for the selected file.
- Selecting a directory replaces the left pane contents with that directory's entries.
- The active directory is shown via path/breadcrumb style context rather than nested tree indentation.

### Explicit File Set View

- When startup receives two or more explicit filepaths, the left pane switches from directory browsing to explicit file-set selection.
- The pane shows only the provided files; sibling files from the same directories are intentionally excluded.
- The pane occupies the same left-side slot as the current file browser, but it is implemented as a distinct view model rather than overloading directory-navigation semantics.
- The first requested file opens immediately in the viewer, and the left pane remains visible by default so the constrained selection set is discoverable.

## Left Pane View Strategy

The new behavior should be implemented as a second left-pane view, not as a hidden variant of directory navigation.

Reasoning:

- Directory browsing and explicit file-set selection share row selection, filtering, sorting, and preview-opening behavior.
- They differ on core navigation rules: explicit file-set mode has no parent directory, no directory rows, and no valid "go up" action.
- The current `FileBrowserPane` language and state model are directory-specific (`current_directory_path`, `parent_directory_path`, "No entries in this directory", `h` to move up).
- Keeping distinct view models avoids weak sentinel behavior such as fake parent paths or pretending the explicit set is a directory.

Design direction:

- Keep one left pane slot in the workspace layout.
- Provide two browser sources:
  - directory browser
  - explicit file set selector
- Share list-row styling and keyboard patterns where practical, but let each source define its own header copy, empty-state copy, and navigation affordances.

## Keyboard Navigation

File view mode supports:

| Key | Action |
|-----|--------|
| `j` or `ArrowDown` | move selection down |
| `k` or `ArrowUp` | move selection up |
| `h` or `ArrowLeft` | open parent directory |
| `l`, `Enter`, or `Ctrl-M` | confirm current selection |

Confirm behavior:

- When the selected row is a directory, navigate into that directory.
- When the selected row is a file, refresh the viewer pane with that file.

Explicit file-set additions:

- `j` / `k` / arrow keys still move within the constrained file list.
- `l`, `Enter`, and `Ctrl-M` still open the selected file immediately.
- `h` / `ArrowLeft` do nothing in explicit file-set mode; they must not expand the scope to a parent directory.
- Filtering and sort shortcuts remain available.
- `Shift+L` still hides or shows the left pane.

## Rust File Classification

Rust is responsible for file-type parsing and preview classification.

Requirements:

- Use a dedicated file-type detection library in Rust rather than frontend heuristics.
- Markdown detection should still preserve the richer Markdown parsing pipeline.
- CSV detection should produce a dedicated structured preview kind rather than falling back to generic text.
- Image and video files render directly in the viewer pane.
- Non-Markdown, non-CSV text files render as escaped plain text in the viewer.
- Binary files are not rendered; the viewer shows metadata and a non-rendered placeholder.

The preview contract should distinguish at least:

```text
FilePreview
- markdown
- csv
- image
- video
- audio
- pdf
- epub
- text
- binary
```

Each preview variant should include:

- canonical path
- file name
- MIME or detected type summary
- last modified timestamp

Markdown previews also include:

- source text
- rendered HTML
- heading metadata
- revision token

CSV previews include:

- raw source-oriented preview content
- parsed cell matrix for formatted rendering
- row / column count metadata
- truncation or parse-status metadata when formatted view is limited

## Browser Contracts

### Directory Browser Contract

Rust provides the directory listing contract for directory-scoped file view:

```text
DirectorySnapshot
- current_directory_path
- parent_directory_path?
- entries[]
- selected_path?

DirectoryEntry
- path
- name
- is_directory
```

Behavior rules:

- Entries are sorted by the requested sort contract; the current default is case-insensitive name ascending.
- Hidden files remain visible unless a later feature explicitly adds filtering.

### Symbolic Link Presentation

- Directory entries identify whether the logical row path is a symbolic link without changing the existing resolved `canonical_path` contract.
- A symbolic-link row uses a dedicated symbolic-link glyph, regardless of whether its target is a file or directory.
- A symbolic-link row renders `→ <relative target path>` beneath its name, relative to the containing directory. Same-directory targets show just the target name; parent targets use `../` and the containing directory itself uses `.`. The resolved absolute destination remains available in the tooltip and accessible row name. Paths without a compatible root retain their absolute form.
- Selecting or opening a symbolic link continues to use the logical link path, while preview identity and target matching may continue to use the canonical path.
- Explicit file sets contain canonicalized files and therefore do not present their source arguments as symbolic links.
- Existing dangling symbolic-link omission remains unchanged.

### Git-Ignored Entry Visibility

- Directory browsing includes Git-ignored entries by default so the existing file-view behavior remains unchanged.
- A compact icon button beside the file-name filter toggles exclusion of entries ignored by the applicable Git repository rules.
- The active button state means ignored entries are hidden. Its accessible name and tooltip must describe both the state and the `.` shortcut.
- `.` toggles the same state when focus is within the file browser and the event target is not editable, matching yazi's visibility-toggle key.
- Git ignore evaluation is Rust-owned and occurs before sorting, counting, and pagination so page totals remain accurate.
- Ignore evaluation uses Git's own rule resolution, including repository, nested, and global excludes. A directory outside a Git worktree or an unavailable Git executable behaves as though no entries are ignored.
- The visibility preference persists while navigating, sorting, filtering, loading additional pages, and refreshing during the current workspace session.
- Explicit file-set mode never removes user-selected files and does not show the Git-ignore toggle.

### Compact Directory Path And Directory Information

- The current-directory line remains an absolute path, but paths longer than roughly 40 characters render as the first 20 characters, an ellipsis, and the last 20 characters.
- The compact path may wrap to at most two lines. Its hover title exposes the complete absolute path.
- `Tab` opens a directory-information popup while the file browser is active and focus is not in an editable control, matching yazi's spot shortcut.
- The popup renders the complete absolute directory as a root-to-leaf component tree without truncation and also shows the current entry count, sort, text filter, and Git-ignored visibility state.
- `Escape` closes the popup and restores normal file-browser interaction.
- Explicit file-set mode keeps its neutral context label and does not expose directory information.
- Non-readable directories fail with a user-facing error rather than partial silent omission.

### Explicit File Set Contract

Rust also provides an explicit-file-set contract for multi-file startup:

```text
StartupContext
- initial_mode
- browser_root

BrowserRoot
- directory:
  - kind
  - current_directory_path
  - selected_file_path?
- explicit_file_set:
  - kind
  - file_count
  - selected_file_path
  - source_order_paths[]
```

```text
ExplicitFileSetPage
- entries[]
- total_entry_count
- offset
- limit
- has_more
```

`entries[]` should reuse the same per-row metadata shape already needed for previewing and sorting, but explicit-file-set rows additionally need a directory hint so the UI can disambiguate duplicate basenames.

Behavior rules:

- Only the canonicalized requested files are returned.
- Directories are never returned in explicit-file-set pages.
- Duplicate canonical paths are removed while preserving the first occurrence as the selected/opened file candidate.
- Filtering matches both basename and path hint so files with identical names remain searchable.
- Sorting keeps the existing field set (`name`, `extension`, `mtime`, `size`).
- The displayed list may default to name ascending for implementation simplicity, but the initially opened file is still determined by deduplicated CLI order, not sorted order.

## Frontend Interaction Model

- The frontend asks Rust for startup context first.
- File view mode owns the directory browser state and the currently previewed file.
- Markdown mode owns the editable document snapshot and save/reload flows.
- CSV preview remains inside file view mode but can switch between raw and formatted presentation.
- Switching from file view to Markdown mode reuses the selected Markdown file path and calls the Markdown open command.
- Switching from Markdown mode back to file view uses the active file's parent directory and selects that file in the list.
- In explicit file-set mode, the frontend loads the explicit selector page instead of a directory page and keeps the selector open by default.
- Explicit file-set rows should show basename as the primary label and a compact parent-path hint as secondary text when needed for disambiguation.
- Empty-state copy must describe the constrained selection set rather than directories, for example "No files match this filter."
- Previewing and Markdown open flows remain identical once a file path is chosen.

CSV-specific interaction rule:

- CSV reuses the existing source/rendered toggle pattern with `Raw` and `Formatted` labels, but does not expose editor or TOC behavior.

## UX Details For Explicit File Sets

- Header title: `Selected Files`
- Header summary: `<n> files`
- Top context line: a neutral summary such as `Opened from CLI selection`, not a filesystem directory path
- Row content:
  - primary label: file basename
  - secondary label: parent directory or compact path hint
- Empty state:
  - no files: `No files were provided.`
  - filtered empty: `No selected files match this filter.`

## Validation And Failure Policy

- `chilla file-a file-b` fails before window creation when any path is unreadable, missing, or a directory.
- A multi-file startup containing both files and directories is rejected instead of silently converting to directory mode.
- If all provided filepaths canonicalize to the same file, the app falls back to single-file behavior after deduplication.

## Left Pane Tree View

The view toolbar uses icon buttons: List/Tree on the left, filter and (for
directory browsing) Git-ignore visibility on the right. Buttons have accessible
names, tooltips and selected/expanded state; there is no visible Filter title.
The filter textbox starts hidden. Clicking the filter icon or pressing `/`
reveals and focuses it. Escape clears the query, hides the textbox and returns
focus to the file rows (or filter icon when empty). Active queries remain visible
so filtering is never hidden unexpectedly. The same toolbar and reveal behavior
apply to changed-file browsing; explicit file sets retain their filter without
directory-only controls.

The directory browser offers List and Tree views. Plain `t` toggles between them
in directory and diff browsing, except while typing or composing text. Modified
keys are excluded so `Shift+T` continues to control the table of contents.
List remains the default for
ordinary browsing. Switching to Tree uses the current directory as a fixed root;
expanding a folder reveals its children inline without navigating away from that
root. Selecting a nested file uses the existing preview/open behavior. Explicit
CLI file selections retain their constrained list presentation.

Directory children load on demand through the existing paginated directory
command, respecting sort and Git-ignore visibility. Expansion must handle loading,
errors, paging, and changes of root without applying stale responses. Tree keyboard
navigation follows visible rows, with Left/Right collapsing/expanding folders.
Switching views reuses a compatible loaded root page instead of rereading it.
Each folder expansion requests only that folder's immediate children, in bounded
pages; it never prefetches unopened descendants. Branch caches survive view
switches. Refresh and sort/ignore changes invalidate caches, but only visible
expanded branches reload; hidden descendants remain lazy. Returning to List must
not exhaust root pagination trying to locate a nested file. Directory filesystem
I/O runs on Tauri's blocking worker pool so a slow read does not block the UI.
Directory filtering retains the existing name-filter scope; ancestors must remain
available to navigate to nested matches without scanning the whole filesystem.

Git diff and PR diff browsers default to Tree, organizing changed files into
expandable ancestor folders and retaining status and change counts. Their tree
root is the current diff directory (the repository root initially), and folders
come from diff paths so deleted or remote-only files remain visible. Filtering
keeps matching files and ancestors visible. List remains selectable. File-to-file
diff navigation must reveal the selected file without moving the tree root.

## Recursive Directory Search

The filesystem browser toolbar provides two additional icon actions: Search file
contents and Find files. Both search recursively under the current browser root
in List or Tree mode and respect Git-ignore visibility. Opening a search reveals
a query field and results panel; submitting with Enter starts the search. Name
search matches filename or relative-path substrings case-insensitively; content
search matches literal, case-sensitive text in UTF-8 text files. Content results
include one-based line numbers and a bounded excerpt containing the match.
Activating a result opens its file through the existing preview flow. Closing
search restores ordinary browsing without changing its root or cached tree.

Search is separate from the existing shallow name filter. These filesystem
actions are shown for directory browsing, not explicit file sets or remote diffs.
No recursive search happens until a query is submitted. Work runs on a blocking
worker; the UI ignores stale responses after query, root, mode, or ignore changes.
Binary/non-UTF-8/oversized/unreadable entries are skipped and reported. Directory
symlinks are not traversed; symlink entries are skipped to keep reads within the
chosen root. Git metadata directories are excluded. Search results and work are
bounded and incomplete results are identified explicitly.

The `search_directory` command accepts an `input` object with `path`, `query`,
`kind` (`name` or `content`) and `hideGitIgnored`. Its response includes
`root_path`, `matches`, `truncated`, `skipped_count` and `scanned_files`.
Each match includes an existing `DirectoryEntry` as `entry`, `relative_path`,
nullable `line_number` and nullable `line_text`. Filesystem payload fields retain
the existing snake_case response convention. Limits: 200 results, 50,000 visited
entries, 8 MiB per content file, 64 MiB total content, and a 5-second scan budget.

## Yazi-style Browser Shortcuts

Existing browser sorting uses comma-prefixed sequences: comma followed by a/A
for name, e/E for extension, m/M for modification time, or s/S for size;
lowercase is ascending and uppercase descending. Comma then 0 resets sorting;
plain 0 remains a compatibility alias. Bare a/A/e/E/m/M no longer sort.
Plain s opens recursive filename search and Shift+S opens recursive literal
content search for filesystem directories. The browser takes precedence over
the workspace theme shortcut only in its own keyboard context; theme remains
available outside that context. Ctrl/Cmd+S remains document save.

The f key reveals the filter; / remains its existing alias. Existing h/j/k/l,
arrow navigation, Enter, Tab information, dot ignore visibility and t Tree
toggle remain unchanged. This adapts existing browser features, not Yazi's
destructive file-management commands or new sorting algorithms. Diff filter
also accepts f, while recursive search remains filesystem-only.

Comma displays a nonmodal popup fixed to the app window's bottom-right corner,
independent of the left pane, listing all valid next keys and their
actions, including ascending/descending direction and reset. It preserves
keyboard focus and remains visible while the user reads; there is no timeout.
Escape, invalid continuation, focus leaving the browser, and root/view/context
changes cancel pending state. Shift alone must not cancel uppercase continuations.
Editable controls, IME composition, repeats and Ctrl/Alt/Meta combinations
must not initiate or accidentally complete sequences. Invalid continuations
are consumed rather than executing another action unexpectedly.
See the Yazi quick-start entry in the design references index.

## References

See `design-docs/references/README.md` for external references.
See `design-docs/specs/design-csv-viewer.md` for CSV-specific preview behavior.

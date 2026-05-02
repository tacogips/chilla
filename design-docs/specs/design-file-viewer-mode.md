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

## References

See `design-docs/references/README.md` for external references.
See `design-docs/specs/design-csv-viewer.md` for CSV-specific preview behavior.

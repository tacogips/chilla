# File Viewer Mode Design

Detailed design for extending `chilla` from a Markdown-only workbench into a mixed file viewer with a switchable Markdown editor mode.

## Overview

This document defines the startup behavior, Rust-side file classification, and frontend interaction model for a yazi-style flat directory browser plus viewer pane.

## Startup Behavior

`chilla` accepts zero or one positional path.

| Invocation | Startup Target | Initial Mode |
|-----------|----------------|--------------|
| `chilla` | current working directory | file view |
| `chilla <dir_path>` | requested directory | file view |
| `chilla <markdown_file>` | requested file | markdown |
| `chilla <other_file>` | parent directory + selected file | file view |

Rules:

- The CLI canonicalizes the startup path before the Tauri window opens.
- Unsupported paths still fail fast before window creation.
- Bare startup uses the current working directory rather than treating missing input as an error.

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

## Rust File Classification

Rust is responsible for file-type parsing and preview classification.

Requirements:

- Use a dedicated file-type detection library in Rust rather than frontend heuristics.
- Markdown detection should still preserve the richer Markdown parsing pipeline.
- Image and video files render directly in the viewer pane.
- Non-Markdown text files render as escaped plain text in the viewer.
- Binary files are not rendered; the viewer shows metadata and a non-rendered placeholder.

The preview contract should distinguish at least:

```text
FilePreview
- markdown
- image
- video
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

## Directory Browser Contract

Rust provides the directory listing contract for the file view pane:

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

- Entries are sorted with directories first, then files, using case-insensitive name ordering.
- Hidden files remain visible unless a later feature explicitly adds filtering.
- Non-readable directories fail with a user-facing error rather than partial silent omission.

## Frontend Interaction Model

- The frontend asks Rust for startup context first.
- File view mode owns the directory browser state and the currently previewed file.
- Markdown mode owns the editable document snapshot and save/reload flows.
- Switching from file view to Markdown mode reuses the selected Markdown file path and calls the Markdown open command.
- Switching from Markdown mode back to file view uses the active file's parent directory and selects that file in the list.

## References

See `design-docs/references/README.md` for external references.

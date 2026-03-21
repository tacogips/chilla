# Command Design

This document describes CLI command interface design specifications.

## Overview

Command-line interface design decisions, including subcommands, flags, options, and environment variables.

---

## Sections

### Subcommands

The current command surface defines no named subcommands. The binary accepts an optional information flag or zero/one positional filesystem path.

| Invocation | Arguments | Behavior |
|------------|-----------|----------|
| `chilla` | None | Open the current working directory in file view mode |
| `chilla <path>` | Path to a file or directory | Open Markdown files in markdown mode, other files in file view mode, or directories in file view mode |
| `chilla --help` | None | Show CLI help |
| `chilla --version` | None | Show application version |

The positional argument is named `path` in product messaging and accepts a relative or absolute filesystem path.

### Flags and Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--help` | boolean | `false` | Show CLI help and exit without starting the desktop app |
| `--version` | boolean | `false` | Show application version and exit without starting the desktop app |

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| None | - | - | The first product slice does not define end-user runtime environment variables |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid CLI usage such as unsupported flags or missing option values |
| 3 | Provided Markdown path could not be opened or is not readable |

### Startup Contract

- `chilla` with no positional argument starts in file view mode rooted at the current working directory.
- `chilla <dir_path>` starts in file view mode rooted at the requested directory.
- `chilla <markdown_file>` starts in markdown mode for that file.
- `chilla <other_file>` starts in file view mode rooted at the parent directory with that file selected for preview.
- The CLI validates that the path exists and is readable before initializing the desktop app.
- Canonicalized startup context is forwarded into the Tauri application, including both the initial mode and the initial directory/file selection.
- Markdown mode still recognizes `.md`, `.markdown`, and `.mdown` as Markdown inputs.

### Future-Compatible Command Notes

- The initial design does not require subcommands such as `open`, `watch`, or `export`.
- Future additions should preserve direct `chilla <path>` startup because it is the primary interaction model.
- If recent-files or workspace-restoration support is added later, it should not break direct file open behavior.

---

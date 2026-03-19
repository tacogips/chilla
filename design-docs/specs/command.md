# Command Design

This document describes CLI command interface design specifications.

## Overview

Command-line interface design decisions, including subcommands, flags, options, and environment variables.

---

## Sections

### Subcommands

The first product slice defines no named subcommands. The command surface is a single binary invocation with an optional information flag or one required document path.

| Invocation | Arguments | Behavior |
|------------|-----------|----------|
| `marky <file_name>` | Path to a Markdown file | Open the file directly in the desktop editor workspace |
| `marky --help` | None | Show CLI help |
| `marky --version` | None | Show application version |

The positional argument is named `file_name` in product messaging, but it should accept a relative or absolute filesystem path.

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

- `marky <file_name>` is the only document-open entry point required for the first slice.
- Invoking `marky` with no positional argument is invalid in the first slice and exits with code `2`.
- The CLI validates that the path exists, is readable, and resolves to a supported Markdown-like file before initializing the desktop app.
- Supported file extensions for the first slice are `.md`, `.markdown`, and `.mdown`.
- The validated path is canonicalized as needed and forwarded into the Tauri application as initial document context.
- Unsupported file types fail fast with a readable error before the desktop window opens.

### Future-Compatible Command Notes

- The initial design does not require subcommands such as `open`, `watch`, or `export`.
- Future additions should preserve `marky <file_name>` as the shortest open path because it is the primary interaction model.
- Bare `marky` startup without an initial file is intentionally deferred until a no-document workspace or file-picker experience is designed.
- If recent-files or workspace-restoration support is added later, it should not break direct file open behavior.

---

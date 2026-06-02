# Command Design

This document describes CLI command interface design specifications.

## Overview

Command-line interface design decisions, including subcommands, flags, options, and environment variables.

---

## Sections

### Subcommands

The target command surface defines no named subcommands. The binary accepts either an information flag or zero or more positional filesystem paths.

| Invocation | Arguments | Behavior |
|------------|-----------|----------|
| `chilla` | None | Open the current working directory in file view mode |
| `chilla <path>` | One file or directory path | Open Markdown files in markdown mode, other files in file view mode, or directories in file view mode |
| `chilla <github_pr_url>` | One GitHub pull request URL | Open PR diff viewer mode for the referenced pull request |
| `chilla <file_path> <file_path> ...` | Two or more file paths | Open file view mode with the left pane constrained to the provided files only |
| `chilla --help` | None | Show CLI help |
| `chilla --version` | None | Show application version |

The positional arguments are named `path` in product messaging and accept relative or absolute filesystem paths.

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
| 3 | Provided filesystem path could not be opened or is not readable |

### Startup Contract

- `chilla` with no positional argument starts in file view mode rooted at the current working directory.
- `chilla <dir_path>` starts in file view mode rooted at the requested directory.
- `chilla <markdown_file>` starts in markdown mode for that file.
- `chilla <other_file>` starts in file view mode rooted at the parent directory with that file selected for preview.
- `chilla <github_pr_url>` starts in PR diff viewer mode when the argument is a valid GitHub pull request URL.
- `chilla <file_a> <file_b> ...` starts in file view mode with an explicit file-set selector that contains only the canonicalized requested files.
- GitHub PR URLs are valid only as a single positional startup target in this slice. Combining a PR URL with local paths is invalid CLI usage.
- Multi-file startup is valid only when every positional argument resolves to a readable file. Mixing directories into a multi-path invocation is rejected as invalid CLI usage for this slice.
- In multi-file startup, the initially opened file is the first canonicalized filepath in CLI order; the left pane remains open because file switching is the primary task.
- If multiple provided paths canonicalize to the same file, duplicates are removed while preserving the first occurrence for initial selection. If only one unique file remains, startup follows the single-file contract.
- The CLI validates that each path exists and is readable before initializing the desktop app.
- The CLI validates GitHub PR URL shape before initializing the desktop app, including owner, repository, and positive pull request number.
- Canonicalized startup context is forwarded into the Tauri application, including both the initial mode and the initial browser scope.
- For PR diff viewer mode, startup context includes the canonical PR URL and parsed owner/repository/number. Diff retrieval occurs through the Tauri backend after app startup so loading and network errors can be shown in the workspace.
- Markdown mode still recognizes `.md`, `.markdown`, and `.mdown` as Markdown inputs.

### GitHub PR URL Contract

Accepted URL shape:

```text
https://github.com/<owner>/<repo>/pull/<number>
```

Query strings and fragments may be ignored after the owner, repository, and pull request number are parsed. Non-GitHub hosts, non-PR GitHub URLs, git remote URLs, and non-positive pull request numbers are rejected.

PR URL startup is intentionally modeled as another direct-open target instead of a named subcommand. This preserves the current `chilla <target>` command shape while extending `<target>` from local filesystem resources to a remote diff resource.

### Future-Compatible Command Notes

- The initial design does not require subcommands such as `open`, `watch`, or `export`.
- Future additions should preserve direct `chilla <path>` and `chilla <file_a> <file_b> ...` startup because they are primary interaction models.
- If recent-files or workspace-restoration support is added later, it should not break direct file open behavior.
- If a future release needs mixed directory + file startup, it should be designed as a separate workspace concept rather than silently broadening the explicit-file-set contract.
- If future releases add non-GitHub providers or branch/commit diff URLs, they should be added behind explicit remote-target parsing rules rather than broadening GitHub PR parsing implicitly.

---

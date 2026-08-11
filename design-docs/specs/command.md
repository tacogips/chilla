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
| `chilla <github_diff_url>` | One supported GitHub pull request, commit, or compare URL | Open GitHub diff viewer mode for the referenced source |
| `chilla <git_dir> <commit>` | Local Git repository directory and one commit-ish | Open local Git diff viewer mode for one commit compared with its first parent |
| `chilla <git_dir> <base>..<head>` | Local Git repository directory and two-dot range | Open local Git diff viewer mode for a direct base-to-head comparison |
| `chilla <git_dir> <base>...<head>` | Local Git repository directory and three-dot range | Open local Git diff viewer mode for merge-base-to-head comparison |
| `chilla <file_path> <file_path> ...` | Two or more file paths | Open file view mode with the left pane constrained to the provided files only |
| `chilla --verbose [startup arguments]` | Global diagnostic flag plus any supported startup form | Start normally and record verbose startup and file-I/O diagnostics |
| `chilla --help` | None | Show CLI help |
| `chilla --version` | None | Show application version |

The positional arguments are named `path` in product messaging and accept relative or absolute filesystem paths.

### Flags and Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--help` | boolean | `false` | Show CLI help and exit without starting the desktop app |
| `--version` | boolean | `false` | Show application version and exit without starting the desktop app |
| `--verbose` | boolean | `false` | Write startup and file-I/O diagnostics to `~/Library/Logs/chilla/chilla-verbose-<pid>[-<collision>].log`; also mirror the same records to an attached terminal |
| `--no-github-diff-cache` | boolean | `false` | Bypass the GitHub diff cache for a GitHub diff URL startup target |
| `--no-pr-diff-cache` | boolean | `false` | Compatibility alias for `--no-github-diff-cache` |

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | No | unset | Optional token for GitHub API and raw-file requests. The backend only attaches it to internally constructed GitHub API URLs or validated `https://github.com` / `https://raw.githubusercontent.com` raw-file URLs. |
| `GH_TOKEN` | No | unset | Compatibility fallback used when `GITHUB_TOKEN` is unset. It has the same host restrictions as `GITHUB_TOKEN`. |

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
- `chilla <github_diff_url>` starts in GitHub diff viewer mode when the argument is a valid GitHub pull request, commit, or compare URL.
- `chilla <git_dir> <commit>` starts in local Git diff viewer mode for the selected commit against its first parent.
- `chilla <git_dir> <base>..<head>` starts in local Git diff viewer mode for a direct base-to-head range.
- `chilla <git_dir> <base>...<head>` starts in local Git diff viewer mode for a merge-base-to-head range.
- `chilla <file_a> <file_b> ...` starts in file view mode with an explicit file-set selector that contains only the canonicalized requested files.
- `--verbose` is a global modifier for app-starting invocations. It may appear before, between, or after startup arguments and must be removed before the existing argument-count and target-classification rules run.
- Removing `--verbose` must leave every existing startup form unchanged, including bare, single-file, directory, multi-file, GitHub URL, local Git revision, and `--no-github-diff-cache` invocations.
- Only the long form `--verbose` is defined. `-v` remains unsupported so it cannot be confused with version behavior or acquire an undocumented compatibility contract.
- Repeated `--verbose` occurrences are idempotent: diagnostics are enabled once and all occurrences are removed before startup classification.
- `--help` and `--version` remain information-only exits. Combining either with `--verbose` does not launch the desktop app or create a verbose log.
- GitHub diff URLs are valid only as a single positional startup target in this slice. Combining a GitHub diff URL with local paths is invalid CLI usage.
- Local Git diff startup is recognized when the first positional argument resolves to a directory inside a Git repository and the second positional argument is not an existing file path.
- If both positional arguments resolve to files, explicit file-set startup wins.
- If the second argument names an existing path in the current working directory, `chilla <git_dir> <name>` is treated as explicit file-set startup rather than a Git revision selector. Use a non-colliding revision spelling when a branch or commit-ish name collides with a local path.
- Multi-file startup is valid only when every positional argument resolves to a readable file. Mixing directories into a multi-path invocation is rejected as invalid CLI usage for this slice.
- In multi-file startup, the initially opened file is the first canonicalized filepath in CLI order; the left pane remains open because file switching is the primary task.
- If multiple provided paths canonicalize to the same file, duplicates are removed while preserving the first occurrence for initial selection. If only one unique file remains, startup follows the single-file contract.
- The CLI validates that each path exists and is readable before initializing the desktop app.
- The CLI validates supported GitHub diff URL shapes before initializing the desktop app, including owner, repository, source kind, and source-specific identity.
- Canonicalized startup context is forwarded into the Tauri application, including both the initial mode and the initial browser scope.
- For GitHub diff viewer mode, startup context includes the canonical source URL and parsed owner/repository/source identity. Diff retrieval occurs through the Tauri backend after app startup so loading and network errors can be shown in the workspace.
- For local Git diff viewer mode, startup context includes the detected repository root, the originally requested Git directory, source kind, and normalized revision selector. Diff retrieval occurs through the Tauri backend after app startup so Git and revision errors can be shown in the workspace.
- Markdown mode still recognizes `.md`, `.markdown`, and `.mdown` as Markdown inputs.

### Verbose Diagnostic Contract

Verbose diagnostics are an opt-in troubleshooting surface, not a change to normal application logging.

- When `--verbose` is absent, no verbose log directory or file is created, no new terminal output is emitted, and existing startup and file-I/O behavior remains unchanged.
- When `--verbose` is present, `HOME` is absolute, and the home plus `Library/Logs/chilla` path components are physical directories rather than symlinks, the app writes newline-delimited diagnostic records to `~/Library/Logs/chilla/chilla-verbose-<pid>.log`, or a deterministic `-<collision>` suffix when an existing entry already owns that process filename. An unsafe home path disables the file sink before diagnostic creation or retention deletion.
- Each process log is capped at 10 MiB. The final record reports `verbose_log_limit_reached`, after which that process suppresses further diagnostic records. After the first current-process record, a background cleanup checks at most 256 entries for at most 25 ms and removes matching regular verbose logs older than 14 days only when they are not actively locked; active logs, symlinks, and unrelated entries are never retention targets.
- Each record carries a Unix-epoch timestamp, elapsed time since process start, an event name, an outcome, and event-specific fields. Completed phases also carry their duration.
- The same complete line is mirrored to stderr when stderr is a TTY, otherwise to stdout when stdout is a TTY. When neither stream is a TTY, no terminal write is attempted. Finder and `.app` launches therefore retain file diagnostics without depending on a terminal.
- Application threads enqueue records without blocking into a bounded 1,024-record background sink. Queue saturation drops records and later emits `verbose_log_records_dropped`; file or terminal backpressure never blocks startup, UI commands, watcher callbacks, or measured file operations.
- Failure to resolve a safe home directory, start the sink worker, create the log directory, create the file, lock the writer, enqueue, or write a record must never prevent startup or file operations. The file sink may degrade to the permitted TTY sink or become silent. Shutdown drains for at most 250 ms.
- Startup records cover process start, CLI parse completion or failure, Tauri builder setup, window/webview creation, the first `get_startup_context` invocation as the frontend-ready marker, and startup-target load completion or failure.
- File open, read, and metadata records include the operation, full path, elapsed duration, byte size when known, success or failure, and the underlying OS error message and raw OS error code when available.
- Diagnostic records may contain full local paths because that is the feature's troubleshooting purpose. They must not contain file contents, environment values, credentials, authorization headers, or GitHub tokens.
- Help output must document both `--verbose` and the `~/Library/Logs/chilla/chilla-verbose-<pid>[-<collision>].log` location pattern.

### GitHub Diff URL Contract

Accepted URL shapes:

```text
https://github.com/<owner>/<repo>/pull/<number>
https://github.com/<owner>/<repo>/pull/<number>/files
https://github.com/<owner>/<repo>/commit/<sha>
https://github.com/<owner>/<repo>/compare/<base>...<head>
```

Query strings and fragments may be ignored after the owner, repository, and source identity are parsed. Non-GitHub hosts, unsupported GitHub URLs, git remote URLs, non-positive pull request numbers, empty commit SHAs, and compare URLs without non-empty base/head refs are rejected.

GitHub diff URL startup is intentionally modeled as another direct-open target instead of a named subcommand. This preserves the current `chilla <target>` command shape while extending `<target>` from local filesystem resources to a remote diff resource.

GitHub diff startup remains read-only. The frontend may expose source-aware labels and a jump action back to GitHub, but review comments, approvals, pushes, and other mutation flows are outside this command contract.

### Local Git Diff Startup Contract

Accepted local Git startup shapes:

```text
chilla <git_dir> <commit>
chilla <git_dir> <base>..<head>
chilla <git_dir> <base>...<head>
```

Validation rules:

- `<git_dir>` must resolve to an existing directory inside a Git repository.
- Repository root detection is performed by Git, then normalized by Rust before being serialized to startup context.
- Revision selectors are passed to Git as structured arguments, not shell text.
- A single commit selector must resolve to one commit object. It compares that commit with the first parent, or with the empty tree for a root commit.
- A two-dot selector compares the left revision with the right revision directly.
- A three-dot selector compares the merge base of the left and right revisions with the right revision.
- Empty selectors, missing range endpoints, invalid revisions, and non-commit endpoints are rejected with invalid CLI usage before the desktop app starts when validation is possible.

Local Git diff startup is read-only. It must not stage files, commit files, mutate repository refs, run hooks, fetch remotes, or infer GitHub repository metadata.

### Local Git Diff Mode From File View

When file view mode is rooted inside a Git repository, the workspace may expose a switch into local Git diff mode for that repository. This switch uses the same local diff contract as opening uncommitted repository changes and defaults to the `working_tree` source kind.

While local Git diff mode is active:

- The left-pane changed-file browser is rooted at the Git repository root.
- Parent navigation above the Git repository root is disabled.
- Opening full-file content or projected changed-file entries must go through repository-scoped Tauri commands.
- Returning to normal file view restores ordinary directory browsing behavior for the previously opened location.

### Future-Compatible Command Notes

- The initial design does not require subcommands such as `open`, `watch`, or `export`.
- Future additions should preserve direct `chilla <path>` and `chilla <file_a> <file_b> ...` startup because they are primary interaction models.
- If recent-files or workspace-restoration support is added later, it should not break direct file open behavior.
- If a future release needs mixed directory + file startup, it should be designed as a separate workspace concept rather than silently broadening the explicit-file-set contract.
- If future releases add non-GitHub providers or repository remote URLs, they should be added behind explicit remote-target parsing rules rather than broadening GitHub diff parsing implicitly.
- If future releases need a shorter positional local Git diff syntax, it should be added only after resolving ambiguity with explicit-file-set startup and directory startup.

---

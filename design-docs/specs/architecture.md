# Architecture Design

This document describes system architecture and design decisions.

## Overview

Architectural patterns, system structure, and technical decisions.

## macOS File Open

[Native file delivery](design-macos-file-open.md) routes LaunchServices events through a queue managed before Tauri setup and a serialized frontend consumer, preserving cold and warm file opening.

## Mise Native Toolchain

Development and CI follow ign-template's tauri-v1 at revision
cd4284b7c942f3b1bc38b81212525830e6c99bb8. mise.toml owns tool versions and task
entry points; Bun's lockfile owns frontend dependencies and Cargo.lock owns
Rust dependencies. Native OS SDKs and libraries are prerequisites, not installed
by mise. Ubuntu CI installs Tauri/WebKitGTK and WebDriver packages using apt;
macOS uses Xcode tools. No Nix shell, flake check, generated Bun Nix manifest,
or Nix runtime is required for new builds.

Local and CI verification share mise tasks covering frontend typecheck, lint,
Bun/DOM tests, Rust format/clippy/tests and native builds. Linux desktop E2E
remains a separate job, retaining its existing advisory status. Actions are
SHA-pinned with read-only permissions; signed releases remain local operations.

Native tarballs retain install.sh's version/target naming, top-level directory,
bin/chilla entry point and SHA-256 sidecar. Packaging rejects Nix linkage and
non-native builds, refuses existing output artifacts, and stages in a fresh
temporary directory. Linux tarballs require compatible system WebKitGTK/GTK
libraries; macOS public distribution continues to prefer signed/notarized DMGs.
Older published Nix tarballs are historical artifacts, not retroactively fixed.

---

## Sections

## Markdown Workbench Architecture

This section defines the target architecture for the desktop Markdown viewer/editor experience.

**Status note (2026-07-03)**: This section is partially superseded by the current
file/Git viewer product shape described in `README.md` and
`design-docs/specs/design-file-viewer-mode.md`. The still-current parts are the
mixed Tauri/Bun boundary, backend-owned Markdown parsing, save conflict semantics,
and file watcher behavior. The three-column editor-first layout is historical
context rather than the primary shipped workspace.

### Repository Baseline And Migration Context

The repository is now a mixed Tauri + Bun application:

- Solid.js / TypeScript frontend code lives under `src/`.
- Tauri backend code lives under `src-tauri/`.
- The root `Cargo.toml` is a workspace manifest for the Tauri crate.
- `package.json`, `bun.lock`, and `Taskfile.yml` provide Bun, Vite, Tauri, Cargo, and go-task workflows.

New design work should treat the mixed-stack structure as the current project baseline.

### Product Scope

- `chilla {file_name}` opens a Markdown file directly into the desktop workbench.
- The main workspace is a three-column layout:
  - Left: collapsible table of contents generated from Markdown headings
  - Center: Markdown editor
  - Right: rendered Markdown preview
- The preview column is collapsed by default.
- The table of contents column can also be collapsed and expanded at runtime.
- File changes on disk are detected in real time and refresh the workspace when the editor is clean.
- If the editor has unsaved changes, an external file update enters an explicit conflict state instead of silently overwriting the buffer.
- Mermaid code blocks are supported in preview output and rendered on the frontend side after HTML is injected.

### Architecture Summary

The target application is a mixed Tauri desktop system with clear responsibility boundaries:

- Rust in `src-tauri/` owns file I/O, file watching, Markdown parsing, heading extraction, and CLI/bootstrap behavior.
- Solid.js in `src/` owns window layout, editor interactions, panel state, keyboard shortcuts, and Mermaid rendering orchestration.
- Tauri commands and events form the boundary between frontend state and backend processing.
- Bun is the frontend package manager and task runner for TypeScript-oriented scripts.
- `go-task` will provide repository-level `build`, `test`, and `dev` entry points that orchestrate Cargo and Bun workflows together after the mixed-stack migration is in place.

### Major Runtime Components

| Component | Stack | Responsibility |
|-----------|-------|----------------|
| CLI/bootstrap | Rust | Parse `chilla {file_name}`, validate path, launch Tauri app with initial document context |
| Document service | Rust | Load Markdown file, normalize metadata, persist editor writes, expose current document snapshot |
| Markdown pipeline | Rust | Convert Markdown to HTML, extract heading tree, derive stable anchor identifiers |
| File watch service | Rust | Detect external file modifications and emit refresh events to the frontend |
| Tauri IPC boundary | Rust + TypeScript | Commands for open/save/reload and events for file refresh state |
| Workspace shell | Solid.js | Three-column layout, collapse state, resize state, status banners, and routing of user actions |
| Editor pane | Solid.js | Text editing surface, dirty-state tracking, save triggers, and cursor/selection behavior |
| Preview pane | Solid.js | Display sanitized HTML, dispatch Mermaid enhancement, and support heading anchor navigation |
| TOC pane | Solid.js | Render heading tree, allow jump-to-heading, support collapse and active heading highlight |

### Transition Plan Constraints

The original Rust-only scaffold has already moved to the mixed-stack structure, so transition constraints now focus on preserving contracts across the Tauri boundary.

- Root-level Rust configuration should remain workspace-oriented; backend package configuration belongs under `src-tauri/`.
- Frontend feature work should keep TypeScript IPC types aligned with Rust `serde` payloads.
- Task automation should continue to orchestrate Bun and Cargo workflows rather than reintroducing Rust-only checks.
- Implementation plans should call out cross-boundary contract changes explicitly.

### Data Flow

#### Initial Open

1. The CLI receives a Markdown path from `chilla {file_name}`.
2. Rust validates the path and passes it into the Tauri app as initial state.
3. The document service reads file content.
4. The Markdown pipeline returns:
   - source text
   - rendered HTML
   - parsed heading tree
   - document metadata such as path and last modified time
5. The frontend initializes the workspace with editor content visible, TOC visible, and preview collapsed.

#### Local Edit Flow

1. The user edits the document in the center pane.
2. Frontend state marks the document dirty immediately.
3. Save actions invoke a Rust command that persists the content.
4. After save completes, Rust re-runs Markdown and TOC parsing and returns an updated snapshot.
5. The frontend refreshes the TOC and preview from the latest parsed result.

#### External File Change Flow

1. Rust file watching subscribes to the opened file path.
2. When the file changes on disk, Rust reloads the file contents.
3. Rust re-runs HTML generation and heading extraction.
4. Rust emits either a refreshed snapshot event or a conflict signal, depending on whether the frontend buffer is still clean.
5. The frontend either updates the editor, TOC, and preview in one state transition or surfaces a conflict state without overwriting in-progress edits.

### UI State Model

The frontend keeps only presentation state and in-progress editing state. Parsed document state is treated as backend-authored data.

| State | Owner | Notes |
|-------|-------|-------|
| Current file path | Rust + frontend mirror | Rust is source of truth |
| Editor text | Frontend | Becomes Rust-authored again after save or external reload |
| Rendered HTML | Rust | Returned as part of document snapshot |
| Heading tree | Rust | Returned as structured TOC data |
| Preview visibility | Frontend | Default `false` on first open |
| TOC visibility | Frontend | Default `true` on first open |
| Panel widths | Frontend | Persist locally per window if desired |
| Dirty state | Frontend | Cleared on successful save or external reload resolution |

### Shared Presentation Shortcut Model

Screens that expose a finite view-mode control should support direct numeric selection when the shortcut is unambiguous for that screen.

Design contract:

- Git diff keeps its existing text-mode mapping: `1` selects left/right, `2` selects stack, and `3` selects full-file diff. `4` selects rendered image review only when the current file is SVG.
- Markdown uses the same direct-selection pattern for its two-state document presentation control: `1` selects raw source and `2` selects preview.
- CSV uses the same two-state mapping in file view mode: `1` selects raw source and `2` selects formatted table when formatted output is available.
- Numeric indexes that do not map to an available option are no-ops. For example, `3` does not change Markdown or CSV presentation, and `2` does not force CSV formatted mode when parsing or safety limits make it unavailable.
- Numeric view shortcuts are frontend presentation state only. They must not call Tauri commands, mutate document content, reload files, or alter backend-authored snapshots.

Shortcut validation rules:

- The active screen owns its own numeric mapping so nested workspaces do not receive duplicate handling.
- Global workspace shortcuts must ignore events whose target is editable, including text inputs, textareas, selects, and contenteditable elements.
- Markdown editing remains the highest-risk editable surface; typing digits in the editor must insert text rather than switch views.
- Existing non-numeric shortcuts, including save/open, TOC toggles, preview toggles, file-browser navigation, and git diff navigation, retain their current behavior.

### Keyboard Shortcut Help Layout

The global keyboard-shortcut help remains a modal dialog owned by the Solid.js
frontend. On desktop-width windows, its shortcut sections are presented in two
balanced columns so the complete reference uses horizontal space and requires less
vertical scrolling.

Layout contract:

- The dialog title and typing-safety footer span the full dialog width.
- Shortcut sections flow through a two-column section container without splitting
  an individual section between columns.
- The dialog retains its existing keyboard semantics, focus behavior, accessible
  dialog labelling, shortcut content, colors, and row-level key/description layout.
- A narrow-window media query returns the section container to one column so the
  dialog does not force cramped shortcut descriptions or horizontal scrolling.
- The change is frontend presentation only and does not add or modify Tauri IPC.

### Markdown and TOC Parsing

Rust performs Markdown parsing to minimize duplicate parsing logic and keep expensive transformations close to the file-watch and persistence layers.

Design constraints:

- One parser pipeline should produce both rendered HTML and heading metadata from the same source text.
- Heading identifiers must be deterministic so TOC navigation and preview anchors remain stable.
- The output sent to the frontend should be structured enough to avoid reparsing headings in JavaScript.
- Parser selection must support fenced code blocks and preserve Mermaid code blocks for later frontend rendering.

### Mermaid Rendering Strategy

Mermaid rendering remains a frontend concern because diagram hydration occurs inside the webview.

Flow:

1. Rust converts Markdown code fences into HTML that preserves Mermaid code blocks in a detectable form.
2. The preview pane inserts the HTML into the DOM.
3. Frontend code scans for Mermaid-marked blocks after preview mount/update.
4. Mermaid JavaScript renders diagrams in place.

This split keeps Markdown parsing fast in Rust while allowing diagram rendering to use browser APIs.

### File Watch and Refresh Policy

The backend watches the active document path only.

Expected behavior:

- External file changes trigger a full document snapshot refresh.
- Refresh events should be debounced to avoid duplicate redraws from bursty editor writes.
- If the local editor is dirty when an external change arrives, the frontend should surface a conflict state instead of silently overwriting user input.
- Reload, overwrite, and save-retry behavior should be part of later implementation planning, but the architecture assumes explicit conflict handling.

### Performance Expectations

- Initial open should complete Markdown parse and TOC extraction in a single backend pass.
- Preview refresh after save or external change should avoid frontend reparsing of Markdown.
- Large documents should degrade primarily in editor rendering cost, not in TOC extraction cost.
- File watch event handling should avoid triggering redundant Mermaid rerenders when the preview is hidden.

## Opt-In Startup And File-I/O Diagnostics

This section defines the Rust-owned diagnostic path enabled by the `--verbose` command contract in `design-docs/specs/command.md`.

### Scope And Boundaries

- Diagnostics are process-global and initialized once in Rust before Tauri application construction.
- The implementation uses only the Rust standard library: one-time global state, a bounded non-blocking record queue, a background sink worker, wall-clock and monotonic timing, and terminal detection.
- No frontend contract change is required. The first existing `get_startup_context` invocation is the frontend-ready marker.
- Diagnostic instrumentation is limited to CLI/bootstrap, Tauri startup, document and general file-preview loading, document commands, and watcher-triggered file reads.
- Disabled diagnostics must return before timestamp construction, path formatting, metadata collection, or writer locking and must not create any filesystem artifact.

### Startup Data Flow

1. `src-tauri/src/main.rs` captures the process-start monotonic time before CLI work.
2. A non-fallible CLI normalization phase identifies and removes `--verbose` before argument-count-sensitive startup parsing. It also recognizes an information-only `--help` or `--version` outcome without performing filesystem resolution.
3. Information-only outcomes retain their current output and exit without initializing diagnostics. For every other verbose invocation, diagnostic state is initialized before fallible startup-target classification, canonicalization, or metadata access.
4. The existing target parser then resolves the normalized arguments. Diagnostics record CLI parse completion or failure and duration; parse failures retain their original user-facing text and exit code while path-resolution failures can retain their underlying OS details.
5. A successful `StartupTarget::File` arms a one-time startup-load marker for its canonical path. `StartupTarget::FileSet` arms it for the first canonical path in CLI order. Directory, current-directory, GitHub, and local Git-diff targets do not arm a file-load marker.
6. `src-tauri/src/lib.rs` records entry into app construction and the start and completion of Tauri builder setup.
7. The Tauri setup/window lifecycle records when the main window and webview are available.
8. The first `get_startup_context` command records frontend readiness once, even if the command is invoked again.
9. The first `open_document` or `open_file_preview` completion whose input exactly matches the armed canonical path consumes the marker and records startup-file load success or failure with duration. A different interactive file open does not consume or relabel the marker. Lower-level file-operation records provide the I/O evidence for the same load.

Phase markers use the process-start monotonic clock for ordering and duration. Each output line also includes Unix-epoch time for correlation with external system logs. A phase failure is recorded before the existing error is mapped, returned, or otherwise handled.

### File-I/O Observability

The instrumented boundaries are:

- `src-tauri/src/document/service.rs` for document open, read, and metadata work.
- `src-tauri/src/viewer/path_utils.rs` for canonicalization and metadata operations used during CLI startup-target resolution and file-preview validation.
- `src-tauri/src/viewer/service.rs` for non-Markdown preview reads and metadata operations used by startup and interactive file opening.
- `src-tauri/src/viewer/epub.rs` for delegated EPUB archive open and archive-entry reads before I/O errors are converted into preview parse errors.
- `src-tauri/src/commands/document.rs` for frontend-ready and startup-load outcome markers, plus command errors observed before translation to UI-facing strings; command markers do not duplicate service-level filesystem records.
- `src-tauri/src/watcher/service.rs` for watcher-triggered reload outcomes, including failures the UI may not surface; the delegated document service remains the owner of its underlying filesystem records.

Each actual filesystem operation emits one completion record rather than duplicating the same event at every calling layer. Records include:

- operation name and full path;
- duration from immediately before the operation to its result;
- byte size from successful read output or metadata when available;
- success or failure outcome;
- the underlying OS error text and raw OS error code when available.

Missing size is represented explicitly for failed operations. Diagnostic code observes results without changing error types, retry behavior, UI mapping, watcher behavior, or file contents.

### Sink And Failure Policy

- The primary sink is `~/Library/Logs/chilla/chilla-verbose-<pid>.log`, created only for a verbose app-starting invocation whose `HOME` value is absolute and whose home, `Library`, `Logs`, and `chilla` components are physical directories rather than symlinks. Missing, relative, non-directory, or symlinked components disable the file sink before diagnostic creation or retention deletion. An existing filename or symlink is never followed or truncated; bounded exclusive retries append `-<collision>` before `.log`.
- On Unix, the application log directory is restricted to mode `0700` and each newly created diagnostic file to mode `0600`.
- Separate exclusively created process files prevent concurrent launches from interleaving or truncating each other's records.
- Each process log is capped at 10 MiB. Before a record would exceed that ceiling, the logger writes and mirrors one `verbose_log_limit_reached` record that fits within the ceiling, then suppresses later records for that process.
- Each active process holds an exclusive advisory lock on its log. After the first current-process record is written, a separate best-effort worker checks at most 256 directory entries for at most 25 ms. It removes matching regular `chilla-verbose-<pid>[-<collision>].log` files older than 14 days only after acquiring that file's lock. Cleanup preserves active/locked files and ignores symlinks, non-regular files, malformed names, unrelated entries, metadata failures, lock failures, and deletion failures.
- The file and optional terminal mirror receive the identical formatted line. Quotes, backslashes, and every control character are escaped before either sink receives the line.
- Terminal mirroring requires verbose mode and at least one attached standard stream. Stderr is preferred when `stderr.is_terminal()`; stdout is used only when stderr is detached and `stdout.is_terminal()`. When neither stream is a TTY, no terminal sink is used.
- Instrumented application threads format each record once and use a non-blocking send to a 1,024-record queue. File creation, retention, file writes, flushes, and terminal writes occur only on background workers. If the queue is full, records are dropped without blocking application work and the sink emits an explicit `verbose_log_records_dropped` marker when capacity becomes available.
- Home-directory lookup, worker creation, directory creation, file creation, lock poisoning, queue disconnection, and write failures are non-fatal. The unavailable sink is skipped; an available TTY mirror may continue.
- Normal return and explicit CLI error exits request a drain, but wait no longer than 250 ms for sink shutdown. A stalled filesystem or terminal must not indefinitely block application exit.

### Validation And Rollout Constraints

- Parser tests cover quiet defaults and `--verbose` combined with bare, single-file, directory, multi-file, GitHub URL, local Git revision/range, and GitHub-cache-bypass startup forms.
- Parser and path-resolution tests prove that information-only outcomes create no sink, verbose diagnostics are active before fallible canonicalization and metadata access, and original CLI error text and exit codes remain unchanged.
- Logger-focused tests cover disabled no-op behavior, stable record fields, graceful sink failure, terminal-stream selection, collision and symlink safety, private Unix permissions, control-character escaping, identical file/terminal formatting through controllable sinks, relative-home rejection, bounded cleanup, non-blocking queue saturation, dropped-record signaling, and bounded shutdown.
- Startup-load tests cover File and FileSet arming, exact canonical-path matching, unrelated interactive opens, success/failure consumption, and non-file targets.
- File-I/O tests cover successful and failed startup path resolution in `src-tauri/src/viewer/path_utils.rs`, document reads, general preview reads in `src-tauri/src/viewer/service.rs`, delegated EPUB archive open/entry reads, and watcher-triggered reload failures without duplicate operation records.
- Runtime validation compares a verbose terminal launch, a non-verbose terminal launch, and a no-terminal-equivalent launch. It verifies the help text and the documented file path pattern.
- The feature ships as a Rust-only additive diagnostic option with no new dependency, persisted application setting, IPC payload, or default-output change.
- Multi-file rotation, remote upload, and general-purpose application logging remain outside this design. The bounded per-file ceiling and age-based cleanup above are the complete retention policy for this diagnostic surface.

## CSV Preview Architecture

This section defines the architecture for CSV as a structured file-view preview kind.

### Product Scope

- CSV opens in file view mode, not Markdown mode.
- CSV supports a two-state presentation switch:
  - raw source
  - formatted table
- CSV remains read-only in this slice.

### Responsibility Split

- Rust in `src-tauri/` owns CSV detection, parsing, record truncation policy, and typed preview payload generation.
- Solid.js in `src/` owns the raw/formatted mode switch, table layout, sticky headers, and cell rendering.
- The existing preview command boundary should extend rather than introducing a parallel CSV-only open flow.

### Contract Direction

CSV should become a typed `FilePreview` variant rather than being emitted as generic highlighted HTML text.

Reasoning:

- raw CSV is still text-oriented
- formatted CSV is naturally structured data
- a typed variant avoids forcing the backend to serialize large HTML tables

### Rendering Policy

- Raw CSV reuses the source-oriented highlighted preview path.
- Formatted CSV renders from structured row/cell data into a semantic table component.
- CSV content is rendered as text, not interpreted HTML.
- CSV previews do not participate in TOC or anchor navigation.

### Performance Policy

- Formatted CSV preview should be bounded by explicit row and/or cell budgets.
- When bounds are exceeded, the UI must show truncation or raw-only fallback rather than blocking the workspace.

### Suggested Project Structure

Current baseline:

```text
src/
  app/
  features/
  lib/
src-tauri/
  src/
    cli/
    commands/
    document/
    markdown/
    viewer/
    watcher/
Taskfile.yml
Cargo.toml
package.json
```

Expected extension points:

```text
src/
  features/workspace/
  features/editor/
  features/preview/
  features/toc/
  lib/tauri/
src-tauri/
  src/
    cli/
    commands/
    document/
    markdown/
    viewer/
    watcher/
```

### Supporting Spec

See `design-docs/specs/design-markdown-workbench.md` for the detailed workspace behavior, event contract, and implementation-oriented design notes.
See `design-docs/specs/design-file-viewer-mode.md` for the file browser, startup-mode, and typed file preview contract.
See `design-docs/specs/design-csv-viewer.md` for CSV-specific preview detection, contracts, and table rendering behavior.
See `design-docs/specs/design-epub-navigation.md` for EPUB TOC extraction, reader navigation, and reading-location persistence.

---

## GitHub Diff Viewer Architecture

This section defines the design target for opening a GitHub pull request, commit, or compare URL in chilla and browsing the resulting changed files.

### Product Scope

- A GitHub diff URL is a first-class startup target alongside local files and directories.
- The user can pass any supported URL shape and open one read-only GitHub diff workspace:
  - `https://github.com/<owner>/<repo>/pull/<number>`
  - `https://github.com/<owner>/<repo>/pull/<number>/files`
  - `https://github.com/<owner>/<repo>/commit/<sha>`
  - `https://github.com/<owner>/<repo>/compare/<base>...<head>`
- The diff workspace uses qraftbox as a behavioral reference for changed-file review while exposing chilla's requested modes:
  - left/right diff
  - stack/inline diff
  - full-file diff
- The left pane presents changed files as a yazi-style current-directory-only browser, not an expanded tree.
- File navigation should feel like local file browsing: directory entry, parent navigation, sibling movement, keyboard selection, and pointer selection.
- The feature is a read-only GitHub diff viewer, not a GitHub review/comment authoring tool.

### Responsibility Split

| Component | Stack | Responsibility |
|-----------|-------|----------------|
| Startup target parsing | Rust | Classify positional input as filesystem path or supported GitHub diff URL before app bootstrap |
| GitHub diff target model | Rust + TypeScript | Represent source identity as pull request number, commit SHA, or compare base/head while preserving the existing Tauri payload envelope |
| GitHub diff service | Rust | Validate URL parts, retrieve source metadata and diff file payloads, normalize errors, and own cache keys |
| Diff payload contract | Rust + TypeScript | Keep `PrDiff`, `DiffFile`, `DiffChunk`, `DiffChange`, source identity, and full-file text payloads aligned |
| GitHub diff workspace | Solid.js | Own selected file, selected directory, mode selection, keyboard navigation, source-aware labels, and loading/error states |
| Changed-file browser | Solid.js | Project flat changed-file paths into a current-directory-only listing |
| Diff renderer | Solid.js | Render left/right, stack/inline, and full-file modes from typed diff data |

### Data Model

The backend returns a typed diff snapshot rather than HTML. The snapshot should include:

- Source identity: owner, repository, canonical URL, source kind, and source-specific details:
  - pull request number, title, state, merged metadata, base branch, and head branch
  - commit SHA, commit title/message summary, and authored/updated metadata
  - compare base ref, head ref, status, ahead/behind metadata when available, and branch labels
- Aggregate stats: file count, additions, deletions.
- Changed files:
  - path
  - optional old path for renames
  - status: added, modified, deleted, renamed
  - additions and deletions
  - hunks/chunks
  - per-line changes with add, delete, or context type and old/new line numbers when available
- Retrieval metadata:
  - source strategy used
  - truncated or omitted file markers when a platform limit is reached
  - user-actionable warning list when some files cannot be rendered

This contract intentionally mirrors the qraftbox `DiffFile`, `DiffChunk`, `DiffChange`, and view-mode concepts while remaining native to chilla's Rust/Tauri boundary. Existing `PrDiff*` type names may be retained internally during the transition, but product-facing labels and new design language should use "GitHub diff" rather than "PR diff" when behavior applies to all source kinds.

### GitHub Diff URL Validation

Accepted URLs:

- `https://github.com/<owner>/<repo>/pull/<number>`
- `https://github.com/<owner>/<repo>/pull/<number>/files`
- `https://github.com/<owner>/<repo>/commit/<sha>`
- `https://github.com/<owner>/<repo>/compare/<base>...<head>`
- The same URL shapes with query string or fragment, which should be ignored after validation.

Validation rules:

- Non-GitHub hosts.
- Missing owner, repo, or pull request number.
- Pull request numbers that are not positive integers.
- Commit URLs with an empty SHA segment.
- Compare URLs that do not contain exactly one non-empty base ref and one non-empty head ref around `...`.
- Git remote URLs such as `git@github.com:owner/repo.git`; these are repository references, not PR targets.

Compare refs may contain slash-separated path segments, so parsing must preserve everything after `/compare/` before splitting on `...`. Query strings and fragments are removed before source parsing. Validation errors should be returned as typed startup errors or workspace errors with clear messages. The UI should not guess repository context from the current local directory in this feature slice.

### Diff Retrieval Boundary

The backend owns network access and any GitHub credential usage. The frontend never calls GitHub directly.

Retrieval remains behind one Rust service boundary:

- GitHub pull requests use the pull request metadata endpoint and pull request files endpoint.
- GitHub commits use the commit endpoint and its file payloads.
- GitHub compares use the compare endpoint and its file payloads.
- Raw `.diff` retrieval remains available as a future fallback adapter for source shapes whose REST file payload is insufficient.
- Future local-git adapter for users who want to fetch PR refs into an existing clone.

The architecture should keep these options hidden behind one Rust service contract so later credential or private-repository support does not change the frontend.

### Cache And Reload Policy

Cache identity must include source kind and source-specific identity fields so pull request, commit, and compare URLs from the same repository cannot collide.

- Pull request cache keys include owner, repo, and pull request number.
- Commit cache keys include owner, repo, and commit SHA.
- Compare cache keys include owner, repo, base ref, and head ref.
- Canonical URL and API metadata update markers should be stored with the cache record to reject stale or mismatched records.
- The no-cache option bypasses reads and writes for all source kinds.

### File Browser Projection

Changed-file paths are flat diff records, but the left pane displays only one logical directory at a time.

Rules:

- The root directory lists direct changed files and child directories derived from changed-file paths.
- Entering a directory updates the current directory and replaces the list with only that directory's direct entries.
- A parent entry is available outside the root.
- Directory rows show aggregate changed-file count and aggregate additions/deletions for descendants.
- File rows show status, basename, optional parent path context, additions, and deletions.
- Selecting a file updates the diff pane without changing the current directory.
- Rename rows should be discoverable by either new path or current display path, with old path visible in metadata.

This projection is intentionally different from tree diff browsers. It preserves a local file-browser mental model and avoids showing the full repository hierarchy at once.

### Diff Modes

Chilla should expose three text-oriented diff modes for all GitHub diff source kinds:

| Chilla mode | qraftbox reference | Behavior |
|-------------|--------------------|----------|
| Left/right | `side-by-side`, `diff_side_by_side.png` | Old and new columns are aligned with line-number gutters and changed rows highlighted |
| Stack | `inline`, `diff_stack.png` | Shows old/new changes in one vertical flow suitable for narrow widths and sequential review |
| Full-file | qraftbox `full-file` behavior, adapted to chilla | Shows latest file content when available, highlights changed regions, and marks deleted locations without rendering deleted content as current file text |

Full-file mode may require lazy full-text retrieval from a GitHub raw URL. Missing raw URLs, binary files, deleted files, or too-large files should show explicit placeholders instead of failing the whole diff workspace.

### SVG Image Review

SVG files should render as images in direct file preview and should also be reviewable as rendered images without removing the existing XML/text diff modes.

Direct file-preview rules:

- A case-insensitive `.svg` extension is authoritative for direct preview and maps to `image/svg+xml`, even when content-based MIME detection reports XML or generic text.
- SVG is removed from the generic text-extension fallback so a valid SVG path does not become a syntax-highlighted XML preview.
- The existing `FilePreview::Image` payload and frontend image preview path are reused; no SVG markup is injected into the application DOM.
- SVG selection uses the fast image-preview debounce applied to other image extensions.

- An image mode is available only when the selected changed-file path has a case-insensitive `.svg` extension.
- The mode renders the latest SVG file content in an image element. It does not inject the SVG markup into the application DOM.
- GitHub-backed SVG files reuse the existing lazy full-file retrieval boundary; the frontend does not fetch raw GitHub URLs directly.
- Local Git worktree, commit, and range reviews reuse the full text already hydrated by the Rust Git diff service.
- Deleted SVG files, unavailable content, truncated content, and retrieval failures show an explicit image-review placeholder rather than a broken image or partial rendering.
- Left/right, stack, and full-file text review remain available for SVG files.
- `4` selects SVG image mode when available. `Tab` includes image mode in its cycle only for an SVG selection.
- Selecting a non-SVG file while image mode is active returns the workspace to left/right mode.

The image source should use an encoded `data:image/svg+xml` URL (or an equivalently isolated image resource) so SVG scripts and document-level markup are not inserted into the application document. The existing Tauri content security policy already permits image data URLs.

Validation requirements:

- Frontend tests cover SVG mode availability, rendered image source/alt text, lazy full-text loading, unavailable/truncated fallbacks, `4`, and SVG-aware `Tab` cycling.
- Existing text diff tests continue to pass, including SVG syntax highlighting.

### Diff Workspace Paging Shortcuts

The documented global `Ctrl-D` and `Ctrl-U` paging shortcuts must apply to the visible diff viewer when a GitHub or local Git diff workspace is active.

Design contract:

- Diff workspace paging targets the changed-file content viewport, not the changed-file browser/sidebar and not the Markdown/file preview document pane.
- The scroll target is the rendered diff file view for the selected file across left/right, stack, and full-file modes. In the current frontend shape this corresponds to the `.pr-diff-fileview` vertical scroll surface inside `.pr-diff-pane__body`.
- `Ctrl-D` pages the selected diff file view down and `Ctrl-U` pages it up by the same active-document page amount used elsewhere unless later usability testing establishes a diff-specific page size.
- If no file is selected, no text diff is available, or the selected diff view is not scrollable, the shortcut is a no-op scoped to the diff workspace.
- Diff workspace shortcut handling must continue to ignore editable targets such as the changed-file filter input, text inputs, textareas, selects, and contenteditable elements.
- The existing local diff toggle shortcut `G`, diff mode shortcuts `1`/`2`/`3`, `Tab` mode cycling, changed-file browser navigation, and GitHub jump action `O` retain their current behavior.
- EPUB paging and media seek behavior remain owned by the regular document preview path and must not run while the Git diff workspace is active.

Validation requirements:

- Focused frontend tests should dispatch `Ctrl-D` and `Ctrl-U` while the diff workspace is active and assert that the diff file view scroll position changes in the requested direction.
- Tests should cover the shortcut boundary by confirming editable diff controls do not page the view.
- Existing tests for numeric diff mode shortcuts and changed-file browser navigation should continue to pass.

### UI State Model

| State | Owner | Notes |
|-------|-------|-------|
| GitHub URL and parsed source identity | Rust + frontend mirror | Rust validates and canonicalizes |
| Loaded GitHub diff snapshot | Rust-authored data | Frontend treats as immutable until reload |
| Current diff directory | Frontend | Defaults to root |
| Selected changed file | Frontend | Defaults to first file in stable path order |
| Diff mode | Frontend | Defaults to left/right on desktop and stack on narrow layouts if needed |
| Loading/error state | Frontend | Derived from command lifecycle and typed backend errors |
| GitHub credentials | Rust/process environment | Never serialized to the frontend |

### Source-Aware UI Labels And Actions

Labels, loading text, errors, header status, and the GitHub jump action must reflect the current source kind:

- Pull request sources may show PR number, state, merge status, base branch, and head branch.
- Commit sources should show commit SHA/title metadata and use "commit" wording.
- Compare sources should show base/head refs and use "compare" wording.
- The jump action opens the source canonical URL, not a PR-specific fallback.
- Shared components should avoid hard-coded "PR" labels unless they are rendering pull-request-only metadata.

### Adapter And Reference Mapping

The qraftbox files in the sibling qraftbox checkout are behavioral references only.

- Reuse the concepts of `DiffFile`, chunks, change rows, and view modes.
- Do not copy qraftbox Svelte component code into the Solid frontend.
- Keep any GitHub retrieval adapter behind chilla-local Rust modules rather than importing qraftbox server code.
- qraftbox comment-selection behavior is out of scope for this GitHub diff viewer slice.
- No Cursor CLI or codex-agent runtime behavior is part of this design unless later workflow input supplies concrete reference files; any future reference-specific behavior must stay isolated behind adapter modules.

### Local Git Diff Extension

The same changed-file browser and diff renderer should also support local Git repositories. Local Git diff mode is a source adapter that feeds the existing diff workspace with local repository data; it is not a separate editor mode and must not replace the current GitHub PR, commit, and compare behavior.

Local Git source kinds:

- `working_tree`: uncommitted changes for a detected repository, including staged tracked changes, unstaged tracked changes, and untracked non-ignored files.
- `commit`: one local commit compared with its first parent; a root commit is compared with Git's empty tree.
- `range`: two endpoints compared as a commit range. Two-dot ranges compare the left and right revisions directly; three-dot ranges compare the merge base with the right revision.

The existing internal `pr_diff` route and `PrDiff*` names may remain as a compatibility bridge while implementation is localized. Product copy, design language, and future public types should move toward source-neutral "Git diff" or "diff viewer" wording when behavior applies to both GitHub and local Git sources.

### Local Git Repository Boundary

Rust must own repository discovery and containment.

- When a local directory is opened, Rust determines whether it is inside a Git repository with Git itself, then records the repository root and current working directory in startup or workspace state.
- Switching into local Git diff mode is available only when a repository root is detected.
- While local Git diff mode is active, changed-file browsing is rooted at the repository root. Parent navigation above that root is invalid, even if the originally opened directory was nested inside the repository.
- Every local diff file read, full-file load, and directory projection request must validate that the requested path or repository-relative path remains under the repository root after canonicalization or Git path normalization.
- Containment is enforced in Rust commands, not only in frontend state.

The frontend may mirror `repositoryRoot`, `currentDirectory`, and `sourceKind` for labels and navigation, but it must treat Rust as authoritative for file access and diff snapshots.

### Local Git Data Flow

Local Git diff snapshots are backend-authored and source-aware:

1. The frontend requests a local diff for a repository root and source kind.
2. Rust validates the repository root, resolves commit or range arguments with `git rev-parse`, and rejects ambiguous or invalid revisions before diff retrieval.
3. Rust invokes Git with structured arguments and a fixed working directory; it does not build shell command strings.
4. Rust parses unified diff output into the same changed-file, chunk, and line-change model used by GitHub diffs.
5. Rust returns source metadata, aggregate stats, warnings, and changed files to the existing diff workspace.
6. Full-file mode loads content from the working tree for `working_tree`, from the selected commit for `commit`, and from the right-side revision for `range`.

Local Git snapshots should not use the existing GitHub network cache. Working-tree snapshots are mutable and should be reloaded on request or when a future file-watch integration explicitly invalidates them. Commit and range snapshots may be cached later only with keys that include repository identity, resolved revisions, source kind, and repository path.

### Local Git Diff Edge Cases

- Deleted files render hunks and deletion markers; full-file mode shows an explicit deleted-file placeholder.
- Binary files, submodules, and too-large full-file payloads produce explicit non-rendered entries instead of failing the whole workspace.
- Renames preserve both old and new paths and remain discoverable through the projected changed-file browser.
- Untracked files have no old side and are represented as added files with untracked source metadata.
- Empty local diffs should render an empty-state message scoped to the selected source kind.

### Source-Aware Diff Workspace

The diff workspace must distinguish source kind without duplicating rendering logic.

- GitHub sources keep the GitHub jump action and GitHub-specific metadata.
- Local Git sources show repository-relative labels, commit or range labels, and no GitHub jump action.
- Shared controls for left/right, stack, and full-file modes remain available for every source kind when the file payload supports them; SVG selections additionally expose rendered image review.
- Loading and error copy should name the source: pull request, GitHub commit, GitHub compare, local changes, local commit, or local range.
- Any adapter-specific behavior stays behind Rust and TypeScript source adapters; Cursor CLI or codex-agent execution behavior is not part of this product surface.

### Rollout Constraints

- This is mixed-stack Tauri work; implementation must update Rust and TypeScript command contracts together.
- Tauri permissions must be updated if a new invoke command is added.
- Large diffs need explicit first-slice limits or lazy rendering before broad release.
- Errors for network failure, rate limits, missing pull requests/commits/compares, private repository access, and malformed URLs must be actionable.
- Errors for missing Git, non-repository directories, invalid revisions, unsafe paths, and repositories with no changes must be actionable.
- Verification should cover Bun typecheck/tests and Cargo checks/tests with quiet Cargo output.

---

## Direct Image Format Coverage

Direct file preview should classify common image extensions as images even when content-based MIME detection returns a generic binary or unrelated textual MIME. WebP is already part of this contract.

The case-insensitive extension-to-MIME fallback covers:

- APNG, PNG, GIF, JPEG (`.jpg`, `.jpeg`, `.jpe`, `.jfif`), WebP, and SVG.
- AVIF, BMP (`.bmp`, `.dib`), ICO, and TIFF (`.tif`, `.tiff`).
- HEIC / HEIF and their sequence variants as defined below.

Rust remains authoritative for direct file classification and returns the existing `FilePreview::Image` payload. Frontend extension matching only selects the shorter image-preview debounce and must stay aligned with the backend list. No new Tauri command or payload shape is introduced.

Classification does not promise that every platform WebView can decode every format. A decoder failure must use the existing explicit image error state and open-in-default-app action rather than reclassifying the source as text or binary. Formats without broadly usable WebView decoding, such as camera RAW, PSD, and JPEG XL, remain outside this direct-render list.

Validation requirements:

- Rust unit tests cover each extension-to-MIME fallback, including case-insensitive paths and misleading generic/text MIME detection.
- Frontend unit tests cover fast selection timing for each supported image suffix and preserve the default timing for unrelated text files.
- Runtime verification launches the desktop app and confirms WebP plus at least one newly classified format reaches the image preview path.

---

## HEIC / HEIF Image Display Architecture

This section defines the design target for displaying HEIC and HEIF images in Markdown previews and file-view image previews.

### Product Scope

- Markdown documents may reference local `.heic`, `.heif`, `.heics`, or `.heifs` images using normal Markdown image syntax or safe raw `<img>` tags.
- File view mode should classify local HEIC / HEIF assets as previewable images instead of generic binary files.
- Users should see a rendered image when the current platform can decode the asset directly or when the backend can provide a renderable representation.
- If decoding is unavailable, the UI should show a clear non-rendered image-preview fallback rather than silently displaying a broken image.

### Responsibility Split

- Rust in `src-tauri/` owns HEIC / HEIF file classification, MIME normalization, filesystem access, and any platform or dependency-backed conversion/transcoding required for WebView display.
- Solid.js in `src/` owns DOM enhancement of Markdown image sources, typed preview rendering, error-state presentation, and any open-in-default-app action.
- The Tauri command boundary should extend the existing Markdown preview and `open_file_preview` flows instead of adding a HEIC-only command path.
- Frontend extension checks may be used only for presentation hints; authoritative support decisions belong to the backend.

### Data Flow

Markdown embedded image flow:

1. Rust renders Markdown image syntax and safe raw image tags without stripping HEIC / HEIF sources.
2. The frontend preview enhancement resolves relative or absolute local image paths against the current Markdown document.
3. The resolved source points either to a WebView-readable file URL when direct decode is supported or to a backend-provided converted/streamed representation when required.
4. Image load failure is surfaced as a preview fallback with the original path preserved for diagnostics or opening externally.

File-view image flow:

1. `open_file_preview` canonicalizes the selected file path.
2. Rust detects HEIC / HEIF by normalized extension and, where feasible, MIME sniffing.
3. Rust returns the existing typed `FilePreview::Image` shape when the asset can be displayed directly.
4. If conversion is needed, Rust still presents the result through the image preview contract, with the display URL or HTML pointing at the converted representation rather than exposing conversion internals to the frontend.
5. Unsupported or failed conversion falls back to an explicit image-preview error state, not to unrelated text or binary rendering.

### MIME And Extension Policy

- Normalize `.heic`, `.heif`, `.heics`, and `.heifs` as HEIC / HEIF image inputs.
- Prefer standards-based MIME labels such as `image/heic`, `image/heif`, `image/heic-sequence`, and `image/heif-sequence` when detected or inferred.
- Existing raster image support remains unchanged for APNG, GIF, JPEG, PNG, and WebP.
- Detection changes for HEIC / HEIF must not cause unrelated text-like files to bypass their existing sanitization paths. SVG is intentionally routed through the isolated image-preview path defined in SVG Image Review.

### Conversion And Runtime Constraints

- Direct WebView display is acceptable only when verified for the target platform.
- Backend conversion should be bounded by file size, decoded pixel count, and memory use before loading the full image.
- Converted outputs should be treated as transient preview artifacts and must not overwrite source files.
- Any generated preview URL must remain local to the app runtime and avoid exposing arbitrary filesystem paths beyond the existing Tauri asset or media serving model.
- Multi-image HEIF sequences may initially render the primary frame only; sequence navigation is outside this issue unless implementation discovery proves it is already trivial.

### Verification Expectations

- Bun verification should cover Markdown preview resource resolution and frontend fallback behavior.
- Cargo verification should cover HEIC / HEIF extension-to-MIME classification and `open_file_preview` routing into image preview behavior.
- Mixed-stack runtime verification should launch the debug app after implementation and exercise a Markdown document that references a local HEIC / HEIF image plus direct file-view preview of the same asset.
- Cargo commands must be run with `CARGO_TERM_QUIET=true`.

---

## Shared Rendered Preview Zoom

Rendered HTML previews use one frontend-owned zoom model for Markdown and direct
image-file previews. The behavior stays inside the shared `PreviewPane`; it does
not change the Rust preview payload or introduce a Tauri command.

### Interaction Contract

- `+` increases the active rendered preview zoom by 10 percentage points.
- `-` decreases the active rendered preview zoom by 10 percentage points.
- `Ctrl` or `Cmd` (Meta) plus mouse-wheel, and macOS trackpad pinch (which
  arrives as `ctrlKey` wheel events), zoom smoothly about the pointer while the
  pointer is over the preview. The exact rule is in "Shared Preview Pan And
  Zoom Gestures" below. `Alt` (Option)+wheel does not zoom; it is a normal
  scroll. Wheel events without `Ctrl`/`Cmd` keep normal scrolling.
- Preview zoom is clamped from 50% through 300% for Markdown and other rendered
  content, and from 50% through 800% for direct SVG and raster image previews.
- Keyboard zoom is ignored while the user is typing in an editable control.
- Handled wheel events suppress the WebView's native page zoom.
- The preview header exposes the current percentage so the state remains visible.

The zoom applies to the whole rendered content tree. This keeps Markdown text,
diagrams, tables, and embedded images in the same visual scale and lets direct
image previews grow beyond the pane width with normal pane scrolling.

### Scope Boundary

Raw Markdown and CSV editors are not zoom targets. EPUB keeps its pagination
model, and audio has no zoom. PDF and video previews use the same keyboard and
wheel zoom contract, each with its own pane-local zoom state. PDF pages are
rendered in-app with pdf.js, which re-renders the canvases at the zoomed scale
(during a wheel gesture the canvases are CSS-resized first and re-rendered
after a debounce; see "Shared Preview Pan And Zoom Gestures").
See `design-docs/specs/design-pdf-inline-rendering.md`. Audio/video playback
shortcuts are unchanged. No persisted preference or cross-window synchronization
is required.

---

## Shared Preview Pan And Zoom Gestures

This section replaces the earlier "Shared Preview Right-Drag Pan" design
(checkpointed in commit `7583025`) and the one-step modifier-wheel rule of
`design-pdf-inline-rendering.md` ("Shared Zoom Input Contract", wheel bullet
only). It follows the read-only nodetto-cloud reference
(`nodetto-app/packages/ui-solid/src/page-tab-scroll.ts`, `PageTabs.tsx`,
`interaction/pointer.ts`, `interaction/events.ts`). Content follows the
pointer like dragging a page on a touch screen, and keeps moving with momentum
after release. The behavior is frontend-only: no Tauri command, no payload
change and no keymap entry.

### Targets And Scroll Containers

Each target has an event target (where listeners are registered, stable for
the pane's lifetime), a scroll owner (the element whose `scrollLeft`/`scrollTop`
pan, fling and zoom anchoring write) and an anchor element (whose top-left
content origin is measured before and after a zoom).

| Preview | Component | Event target | Scroll owner | Anchor element | Zoom max |
|---------|-----------|--------------|--------------|----------------|----------|
| Markdown rendered | `PreviewPane` | `.pane__body` (`previewRef`) | `previewRef` | `.preview__zoom-surface` | 300% |
| Direct image (SVG and raster) | `PreviewPane` with `dragPanEnabled` | `previewRef` | `previewRef` | `.preview__zoom-surface` | 800% |
| Text/source layout (`layout="source"`) | `PreviewPane` | `previewRef` | the inner `.preview__source-content > .file-preview--text > pre` (the outer `.pane__body.preview--source` is `overflow: hidden`, `App.css` lines 2709-2747) | that `pre` (origin = its 8px padding) | 300% |
| Video | `MediaFilePreviewPane` (`kind === "video"`) | `.pane__body` (`bodyRef`) | `bodyRef` | the `.preview-media--video` figure | 300% |
| PDF | `PdfFilePreviewPane` | `.pane__body.preview--pdf` (`body`) | `body` | the page canvas under the pointer (see PDF anchoring) | 300% |

Source scroll owner rules:

- `PreviewPane` resolves the scroll owner with a function, not a stored
  reference: `layout === "source"` returns the `pre` above when it exists, and
  otherwise returns `previewRef`. It is passed to the module as
  `scrollOwner()`.
- Listeners stay on `previewRef` only. Pointer and wheel events from the `pre`
  bubble to it, so `props.html` or `layout` replacing the `pre` needs no
  reattachment and no listener is ever registered on the `pre`. That rules out
  duplicate wheel handling.
- A gesture resolves the scroll owner once at `pointerdown` and keeps it for
  that gesture and its fling. A wheel zoom resolves it per event. Replacing the
  `pre` changes `props.html` or `layout`, and the document-change effect
  calls `stopFling()` before the old element is used again, so no fling frame
  writes to a detached `pre`.
- Plain-wheel scrolling of the `pre` stays native (not prevented). The source
  metadata footer stays outside the `pre` and is never scrolled or scaled.

Zoom min is 50% everywhere. Direct images are rendered by `PreviewPane`
(`dragPanEnabled` is set for `filePreview.kind === "image"`), not by
`MediaFilePreviewPane`. Audio, EPUB, CSV, the raw Markdown editor, the HTML
iframe preview and diff views are not targets. Visibility (`isActive`) uses
each pane's existing rule: `props.visible` in `PreviewPane`, and
`closest(".pane--hidden, [hidden], [aria-hidden='true']") === null` in the
video and PDF panes.

### Shared Module

One module, `src/features/preview/previewPanZoom.ts`, replaces the partial
`rightDragPan.ts` / `rightDragPan.vitest.ts` left by the interrupted run (both
are deleted; their still-valid tests move to `previewPanZoom.vitest.ts`). No
pane imports `rightDragPan.ts` today, so there is no other stray code to
revert. It exports:

- Constants: `PAN_SLOP = 4` (CSS px), `FLING_WINDOW_MS = 80`,
  `FLING_DECAY = 0.998` (per ms), `FLING_MIN_VELOCITY = 0.02` (px/ms),
  `WHEEL_ZOOM_SENSITIVITY = 0.0015`, and
  `PREVIEW_PANNING_CLASS = "preview--right-drag-panning"` (the class already in
  the working-tree `App.css` is kept so no CSS rename is needed).
- Pure functions, unit-tested without DOM:
  - `wheelPixels(delta, deltaMode)`: matches nodetto
    `interaction/events.ts` lines 48-49. `deltaMode` 0 returns `delta`, and
    every nonzero mode (1 line, 2 page) returns `delta * 16`.
  - `flingVelocity(samples, releaseTime)`: keeps the `{t, x, y}` samples whose
    `t >= releaseTime - FLING_WINDOW_MS`, and returns `{vx, vy}` in px/ms from
    the oldest to the newest kept sample. It returns `null` when fewer than two
    samples remain, their time span is 0, or
    `Math.hypot(vx, vy) < FLING_MIN_VELOCITY`. A pointer that rested for more
    than 80 ms before release therefore produces no fling.
  - `flingStep(velocity, dtMs)`: matches nodetto `pageTabFlingStep`
    (`page-tab-scroll.ts` lines 53-60). The per-axis displacement uses the
    incoming velocity, `velocity * dtMs`, and the returned next velocity is
    `velocity * FLING_DECAY ** dtMs`. Example: velocity 1 px/ms and
    `dt = 16` gives a 16 px displacement and next velocity `0.998 ** 16`.
  - `wheelZoomFactor(event)`: returns `null` unless
    `(event.ctrlKey || event.metaKey) && event.deltaY !== 0`. Otherwise it
    returns `Math.exp(-wheelPixels(event.deltaY, event.deltaMode) *
    WHEEL_ZOOM_SENSITIVITY)`. `altKey` is ignored. Example: `deltaY = 1`,
    `deltaMode = 2` gives `Math.exp(-16 * 0.0015)` (about 0.9762857).
  - `anchoredZoomScroll(scroll, pointerOffset, originBefore, originAfter,
    ratio)`: one axis,
    `originAfter + (scroll + pointerOffset - originBefore) * ratio -
    pointerOffset`. `pointerOffset` is the pointer client position minus the
    scroll owner's client rect edge. `originBefore` and `originAfter` are the
    anchor element's content origin in the scroll owner's scroll coordinates
    (`anchorRect.left - ownerRect.left + owner.scrollLeft`, same for top),
    measured before and after the zoom is applied. `ratio` is the anchor
    element's size ratio after/before (equal to `newZoom / oldZoom` for
    uniformly scaled anchors). Measuring the origin after the zoom covers
    centered content whose origin moves, such as a margin-centered video
    figure or PDF page.
- `attachPreviewPan(target, options): PreviewPanHandle`, with
  `options = { isActive(): boolean; leftButton?(): boolean; scrollOwner?():
  HTMLElement }` (`scrollOwner` defaults to `target`) and
  `PreviewPanHandle = { detach(): void; stopFling(): void }`. Panes call it in
  `onMount` and call `detach` in `onCleanup`. Listeners and pointer capture
  are on `target`, and scroll writes go to the gesture's resolved scroll owner.
- `applyWheelZoom(event, current, max): number | null`: the shared wheel
  decision. It returns `null` and does nothing else when `wheelZoomFactor` is
  `null`. Otherwise it calls `preventDefault()` and returns
  `clamp(current * factor, 50, max)`.
- `anchorScrollAfterZoom(owner, event, before, after)`: writes both axes of
  `owner` from `anchoredZoomScroll`. `before` and `after` are
  `{originX, originY, width, height}` snapshots of the anchor element, taken by
  `measureAnchor(owner, anchorElement)` before the zoom signal changes and
  after Solid has applied it synchronously. The ratio per axis is
  `after.width / before.width` and `after.height / before.height`, falling back
  to `newZoom / oldZoom` when a size is 0. When the anchor element is the
  scroll owner itself (source `pre`), the origin on each axis is the owner's
  computed padding (8px) before and after, and the ratio is
  `newZoom / oldZoom`: the font-size scaling grows the content uniformly
  inside a fixed padding. The browser clamps out-of-range
  scroll values at the scroll edges. That clamp is the only accepted deviation
  from an exact anchor.

`previewZoomDirectionFromWheel` is removed from `PreviewPane.tsx`.
`nextPreviewZoom`, the 10-point keyboard step and the clamp constants stay.
Zoom values may become fractional: the header shows `Math.round(zoom)%`, and
`nextPreviewZoom` keeps adding or subtracting 10 from the current value before
clamping.

### Pan Gesture Contract

- Start: every `pointerdown` on the target first calls `stopFling()`. A gesture
  then starts only while `isActive()` is true and the press is `button === 2`
  (right), `button === 1` (middle), or `button === 0` with `isPrimary` when
  `leftButton?.()` is true (the direct-image `dragPanEnabled` pan). The
  gesture records the pointer id, its button bit (`1` left, `2` right, `4`
  middle), the start client coordinates, the start `scrollLeft`/`scrollTop`
  and a first sample `{t: event.timeStamp, x, y}`. It calls
  `setPointerCapture` and `preventDefault()` on the press, as the reference
  does for a right press. This stops text-selection start and middle-button
  autoscroll; it does not cancel the `contextmenu` event, which is governed
  by the context-menu rule below.
- Move: for the recorded pointer id, if `(event.buttons & buttonBit) === 0`
  the gesture ends first (chord release: that move is neither scrolled nor
  prevented, and no fling starts; the just-ended context-menu flag is set if
  a right gesture had panned). Otherwise a sample is appended and samples
  older than `FLING_WINDOW_MS` before the newest are dropped. Once
  `Math.hypot(dx, dy) > PAN_SLOP`, measured from the start, the gesture is
  panning for the rest of its life and the target gets `PREVIEW_PANNING_CLASS`.
  While panning, every move sets `scrollLeft = startScrollLeft - dx` and
  `scrollTop = startScrollTop - dy` and calls `preventDefault()`. Below the
  slop nothing scrolls and nothing is prevented.
- End: `pointerup` releases capture, removes the class and, if the gesture
  panned, starts a fling from `flingVelocity(samples, event.timeStamp)`.
  `pointercancel` and `lostpointercapture` end the gesture without a fling.
- Fling: skipped when `matchMedia("(prefers-reduced-motion: reduce)").matches`
  at release, when `matchMedia` or `requestAnimationFrame` is unavailable, or
  when the velocity is `null`. Otherwise a `requestAnimationFrame` loop runs.
  Each frame uses `dt = frameTime - lastFrameTime`, applies `flingStep`
  (displacement from the incoming velocity, then decay), and subtracts the
  displacement from the scroll owner's `scrollLeft`/`scrollTop`, so content
  keeps moving in the pointer's last direction. An axis whose scroll value does not change after the write has
  hit an edge, and its velocity becomes 0. The loop ends when
  `Math.hypot(vx, vy) < FLING_MIN_VELOCITY`. `stopFling()` cancels the pending
  frame. At most one fling per target runs.
- Fling stop triggers: any `pointerdown` on the target, any `wheel` on the
  target, any window `keydown` while a fling runs (this covers `j`/`k`,
  arrows, Page Up/Down, Space and Home/End without listing keys), `detach()`,
  and a document change. Each pane signals a document change by calling
  `stopFling()` from an effect on its document identity: `PreviewPane` on
  `props.html` and `props.layout`, video on its source URL, PDF on its load
  generation.
- Context menu (native-menu guard, behavioral reference: nodetto-cloud
  `apps/desktop/src/shell/native-context-menu.ts`, `keepsNativeContextMenu` /
  `installNativeContextMenuGuard`): the `contextmenu` listener that
  `attachPreviewPan` registers on each pan target decides at event time, with
  no dependence on pointer movement, so it is correct when WebKit dispatches
  `contextmenu` at right-button press. Definitions:
  - "Editable target": the event target, or its parent element when the
    target is a text node, has an ancestor-or-self matching `input`,
    `textarea`, or `[contenteditable]` whose `contenteditable` value is not
    `"false"` (`Element.closest`, light DOM only; `composedPath()` is not
    used).
  - "Non-empty selection": `window.getSelection()?.toString()` is a non-empty
    string (any selection in the window, as in the reference).
  - "Press record" (`hadSelection: boolean`, or none): the selection state
    captured at right-button press time, before WebKit's press default action
    (see "Press-time selection record" below).
  Rules, in order:
  1. If the active right-button gesture is panning, or the just-ended flag is
     set (a right gesture that panned has just ended), call `preventDefault()`.
  2. Otherwise, if the target is editable, do nothing (native menu kept; the
     selection is never touched).
  3. Otherwise, if a press record exists: when `hadSelection` is true, do
     nothing (native menu kept for a selection the user made before the
     press). When `hadSelection` is false, the press itself created any
     current selection (macOS WebKit selects the word under the pointer
     between `mousedown` and `contextmenu`): if the selection is non-empty,
     call `window.getSelection().removeAllRanges()`; then call
     `preventDefault()`. The pan then proceeds on later `pointermove`s.
  4. Otherwise (no press record: a press while `isActive()` is false, a
     keyboard-invoked menu, or Windows where `contextmenu` follows the release
     that already reset the record), the event-time rule is unchanged: a
     non-empty selection keeps the native menu, else call `preventDefault()`.
     This covers a plain Windows right-click and clicks after middle or left
     gestures.
  Press-time selection record (follow-up to commit 77c1236):
  - Captured on a `pointerdown` with `button === 2` while `isActive()` is
    true. That `pointerdown` always replaces any previous record (the next
    press resets it). A `mousedown` with `button === 2` on the same target
    captures it only when no record exists, so the record is idempotent per
    press whichever of the two events WebKit delivers first or alone.
  - The record is cleared on `pointerup`, `pointercancel`, `detach()` and
    after it is read by `contextmenu` (rule 3).
  - A separate `mousedown` listener (registered and removed with the others)
    calls `preventDefault()` when `button === 2`, `isActive()` is true, the
    target is not editable and the record has `hadSelection` false, so WebKit
    does not create the word selection. `preventDefault()` on `pointerdown` is
    not relied on to suppress the `mousedown` selection default, so the rule 3
    `removeAllRanges()` stays as the fallback. A pre-existing selection,
    editable targets, other buttons and inactive panes are never
    `preventDefault`ed on `mousedown`, so focus and selection there behave as
    before.
  The just-ended flag is consumed by any `contextmenu` event and cleared by
  the next `pointerdown`, as before. The guard has no platform or user-agent
  branch. It is not installed anywhere outside the preview pan targets
  (Markdown/rendered, source, image, video, PDF). Pointer start, `PAN_SLOP`,
  pan, middle-button pan, chord release, fling and wheel zoom are unchanged.
- Cursor: `App.css` keeps `.preview--right-drag-panning { cursor: grabbing;
  user-select: none; }`. The class is present only while a gesture is panning.
- Left click, links and text selection: without `dragPanEnabled` a left press
  only runs `stopFling()`, so text selection and link clicks are unchanged.
  The direct-image left pan moves from `PreviewPane`'s own `dragState` code
  into `attachPreviewPan` with `leftButton: () => props.dragPanEnabled ===
  true`, and so gains the slop and the fling. A mouse shares one pointer id
  across buttons, so a second button pressed during a gesture is a chorded
  `pointermove`, never a second start.

### Wheel Zoom Contract

- Each target registers exactly one non-passive `wheel` listener on its event
  target (for source this is `previewRef`, never the `pre`). It calls `stopFling()` first and returns when the pane is not
  active. With `Ctrl` or `Cmd` held (or a trackpad pinch), `applyWheelZoom`
  zooms by the smooth factor about the pointer and prevents the default, so
  there is no page scroll and no native WebView zoom. Without `Ctrl`/`Cmd`,
  including `Alt`+wheel, the event is not prevented and scrolls normally.
- Order per zoom event: resolve the scroll owner and the anchor element,
  `measureAnchor` (before), set the zoom signal, `measureAnchor` (after), then
  `anchorScrollAfterZoom`.
- `PreviewPane` uses max 800 when `dragPanEnabled` is true, else 300. The
  source layout keeps its font-size scaling on the `pre` and the rendered and
  image layouts keep their `transform: scale` surface, whose top-left origin
  is fixed by `transform-origin: top left`. Video keeps its CSS `zoom` on the
  figure, and its origin is re-measured after the zoom because the figure may
  be centered.
- PDF anchoring is page-local, because canvases resize while the 12px
  inter-page gaps (`.preview-pdf-page { margin: 0 auto 12px }`) and the 16px
  body padding stay fixed, and pages are horizontally centered:
  1. Before resizing, pick the anchor page: the last canvas whose content top
     is less than or equal to the pointer's content y
     (`scrollTop + pointerOffsetY`), or the first canvas if there is none.
  2. Record the page-local fractions
     `fx = (scrollLeft + pointerOffsetX - pageLeft) / pageWidth` and
     `fy = (scrollTop + pointerOffsetY - pageTop) / pageHeight`, each clamped
     to `[0, 1]`. A pointer in a gap, in padding or beside a narrow page
     anchors to the nearest point on that page's edge.
  3. Resize the canvases, re-measure that page's `pageLeft`, `pageTop`,
     `pageWidth` and `pageHeight`, and set
     `scrollLeft = pageLeft' + fx * pageWidth' - pointerOffsetX` and
     `scrollTop = pageTop' + fy * pageHeight' - pointerOffsetY`. These are
     `anchoredZoomScroll` applied to that page's before and after measurements.
  4. Fixed gaps, centering and mixed page widths are thereby accounted for.
     Worked example: two 1000px-high pages, 16px padding, 12px gap,
     `scrollTop = 1200`, pointer y 200, zoom from 100% to 200%. Page 2 top
     moves 1028 to 2028, `fy = 0.372`, and the result is `scrollTop = 2572`.
     Only the browser's scroll-edge clamp can move the point off the pointer.
- PDF splits zoom into `zoom` (live, shown in the header) and `renderZoom`
  (the scale pdf.js renders at). A wheel zoom updates `zoom`, synchronously
  sets every canvas `style.width`/`style.height` to exactly the CSS size the
  render path assigns, `page.getViewport({ scale: zoom / 100 })` width and
  height in px (the existing bitmap is stretched; no pdf.js render call),
  applies the page-local anchor, and restarts a 150 ms debounce timer. Because
  the debounced render assigns the same CSS size, it does not change layout,
  and the anchor stays where the wheel left it. When the timer
  fires, `renderZoom` becomes `zoom` and the existing render effect, now keyed
  on `renderZoom`, re-renders every page and cancels in-flight tasks as it
  does today. Keyboard `+`/`-` sets both signals at once, so it re-renders
  immediately as today. Unmount and a new load clear the timer. A canvas whose
  page has not rendered yet keeps its default size until its first render.

### Platform Event Order

On Windows the `contextmenu` event follows the button release. On macOS WebKit
(the Tauri WKWebView) and on WebKitGTK, `contextmenu` is dispatched at button
press, before any movement. The first contract (commit 30f411a) prevented the
menu only after a moved right gesture, so in the real macOS debug app a right
press opened the native menu (Reload / Inspect Element) and swallowed the
drag. The native-menu guard above fixes this by preventing the menu at event
time on pan targets on every platform, so the result no longer depends on the
event order. The webview Reload item is also harmful here because it restarts
the frontend, which is the reference's reason for the same guard. Accepted
cost: a plain right-click over a preview shows no native menu (no Reload or
Inspect Element) unless text is selected or the target is editable. Real-app
behavior on macOS is a GUI check delegated to the supervising session and a
user-accepted gap for this run. The decision is recorded in
`design-docs/user-qa/qa-preview-right-drag-pan.md`.

The macOS GUI re-check of commit 77c1236 on a Markdown preview found a second
order problem: a right press runs `mousedown`, then selects the word under the
pointer, then fires `contextmenu`. The event-time selection check therefore saw
the selection the press itself had made, kept the native menu (Look Up / Copy /
Inspect Element) and the pan never started over text; PDF canvases have no
text and panned. The press-time selection record above fixes this: only a
selection that existed before the press keeps the native menu, and a
press-created selection is prevented on `mousedown` and, as a fallback,
cleared in `contextmenu`. jsdom has no selection-on-`mousedown` default, so
tests simulate it; the real-app result is again a supervising-session GUI
check and a user-accepted gap.

### Verification

- `previewPanZoom.vitest.ts`, numeric reference-parity cases:
  `wheelPixels(5, 0) === 5`, `wheelPixels(1, 1) === 16`,
  `wheelPixels(1, 2) === 16`. `wheelZoomFactor` is `null` for plain and `Alt`
  wheels, and for `Ctrl` or `Meta` with `deltaY = 1, deltaMode = 2` it is
  close to `0.9762857` (`Math.exp(-16 * 0.0015)`). `flingStep(1, 16)` returns
  displacement `16` and next velocity `0.998 ** 16`. `flingVelocity` covers the
  window, rest-before-release and minimum-velocity cases.
  `anchoredZoomScroll` keeps the content point under the pointer for a fixed
  origin and for a moved (centered) origin. With a stubbed `requestAnimationFrame` and controlled frame times:
  the slop; right, middle and left (`leftButton`) start rules; pointer capture;
  the cursor class; chord release; a fling that decays and stops below the
  minimum velocity; a fling that stops at an edge; a fling stopped by
  `pointerdown`, `wheel`, `keydown`, `stopFling()` and `detach()`; no fling
  under reduced motion. Native-menu guard cases (they replace the old
  "suppresses only a moved right menu" assertions):
  - A plain right-click (`pointerdown`/`pointerup` without a move) and a
    `contextmenu` after a middle gesture are `defaultPrevented`.
  - Press-time regression: `pointerdown(button=2, buttons=2)`, then
    `contextmenu` dispatched before any `pointermove` is `defaultPrevented`,
    then `pointermove`s past the slop still pan the scroll container
    (`scrollLeft`/`scrollTop` change by the drag delta).
  - With no gesture, `contextmenu` dispatched on a descendant `input`, a
    `textarea`, or an element inside `[contenteditable]` (for example
    `contenteditable="true"`) is not prevented; inside
    `contenteditable="false"` it is prevented.
  - With a non-empty window selection (stubbed `getSelection` or a real
    selected text range), a plain `contextmenu` is not prevented; after the
    selection is cleared it is prevented again.
  - After a right gesture that panned, the following `contextmenu` is
    prevented (unchanged), including when a selection is present.
  - macOS-order regression (a): with an empty selection, dispatch
    `pointerdown(button=2, buttons=2)` and `mousedown(button=2)` on a text
    descendant; the `mousedown` is `defaultPrevented`. Then make the selection
    non-empty (`selectAllChildren`/`addRange`, simulating WebKit's word
    select), then dispatch `contextmenu`: it is `defaultPrevented` and
    `window.getSelection().toString()` is `""`. Later `pointermove`s past the
    slop pan the scroll container.
  - macOS-order regression (b): with a pre-existing non-empty selection,
    the same `pointerdown`/`mousedown`/`contextmenu` sequence leaves the
    `mousedown` and the `contextmenu` not prevented and the selection text
    unchanged.
  - Editable press: the same sequence on an `input`/`[contenteditable]`
    descendant leaves `mousedown` and `contextmenu` not prevented and does not
    clear a selection.
  - Record reset: after `pointerdown(button=2)` then `pointerup` (Windows
    order), a `contextmenu` with a non-empty selection is not prevented and
    the selection is untouched (rule 4); after `detach()` no `mousedown` is
    prevented.
  Test `contextmenu` and `mousedown` events that must reach a descendant use
  `bubbles: true`.
- `PreviewPane.vitest.tsx` (rendered, `layout="source"`, direct image),
  `MediaFilePreviewPane.vitest.tsx` (video) and `PdfFilePreviewPane.vitest.tsx`:
  right and middle drag pan past the slop; a release fling moves the scroll
  and then stops; a plain right-click `contextmenu` and one after a middle
  gesture are `defaultPrevented` (these replace the earlier "plain right-click
  is not prevented" and "middle menu is not prevented" assertions, and only
  those assertions change); a hidden pane does not
  pan; `Ctrl`+wheel and `Meta`+wheel zoom smoothly, keep the pointer anchor and
  respect the per-type clamps; `Alt`+wheel and a plain wheel are not prevented
  and do not change zoom; keyboard `+`/`-` still step by 10; a document change
  stops a fling. The PART A Alt+wheel zoom assertions become "Alt+wheel does
  not zoom". A left drag on a non-image preview does not pan. The existing
  direct-image left-pan tests still pass; only assertions that relied on a
  sub-slop move scrolling are adjusted. The existing test "ignores non-primary
  mouse buttons for direct-image drag panning" uses button `2`, which now pans;
  it changes to assert that buttons other than `0` do not start the left pan
  path when `dragPanEnabled` is false.
- Source-specific (`PreviewPane.vitest.tsx`, `layout="source"`, overflowing
  `pre`):
  - Right and middle drag, the fling and `Ctrl`+wheel anchoring change the
    inner `pre`'s `scrollLeft`/`scrollTop`, with the expected values computed
    from the `pre`'s stubbed rect and 8px padding. The outer `.preview--source`
    offsets stay 0.
  - The metadata footer stays the `pre`'s next sibling with a 12px font size,
    and the existing source layout test keeps passing unchanged.
  - Replacing `props.html` during a running fling stops it. Later frames
    write neither the detached old `pre` nor the new one, and exactly one
    wheel listener handles each wheel event (no double zoom).
- PDF-specific (`PdfFilePreviewPane.vitest.tsx`, stubbed page geometry):
  - The two-page worked example yields `scrollTop = 2572`.
  - With centered pages of mixed widths, the page-local x point stays under
    the pointer.
  - A pointer in the inter-page gap anchors to the clamped page edge.
  - A burst of `Ctrl`+wheel events resizes canvases without calling
    `page.render`. Exactly one render pass at the final zoom runs after
    150 ms, and `scrollLeft`/`scrollTop` and the canvas CSS sizes are
    unchanged by that render.
  - Keyboard `+`/`-` still re-renders immediately.
- The PDF shortcut tests (`Shift+L`, `Cmd+O`, `+`/`-`, `r`, `Shift+D`,
  `j`/`k`, `Enter`, `q`) and the picker supersession tests in
  `WorkspaceShell.vitest.tsx` keep passing.
- Rendered Markdown macOS-order regression (`PreviewPane.vitest.tsx`,
  rendered layout with a text paragraph, `dragPanEnabled` false): with no
  prior selection, `pointerdown(button=2)` and `mousedown(button=2)` on the
  paragraph, then a simulated word selection, then `contextmenu` is
  `defaultPrevented` with the selection cleared, and `pointermove`s past the
  slop scroll the preview. Other pane vitest files change only if an
  assertion breaks.
- Chord-release regression (`PreviewPane.vitest.tsx`, rendered Markdown with
  `dragPanEnabled` false). On one pointer id:
  1. `pointerdown(button=2, buttons=2)`.
  2. A move past the threshold (`buttons=2`) pans.
  3. `pointermove(button=0, buttons=3)` (left pressed) still pans.
  4. `pointermove(button=2, buttons=1)` (right released, left still held) is
     not `defaultPrevented` and leaves `scrollLeft`/`scrollTop` unchanged. The
     cursor class is gone and `releasePointerCapture` was called.
  5. Further `pointermove(buttons=1)` events do not scroll and are not
     prevented.
  6. A following `contextmenu` is `defaultPrevented`, because the gesture had
     panned.
  7. A new `pointerdown(button=2)` gesture pans again.
  Test pointer events must set `buttons`. The existing `pointerEvent` test
  helper in each vitest file gains an optional `buttons` argument. It defaults
  to the bit for `button` on `pointerdown` and `pointermove`, and to `0` on
  `pointerup`.
- jsdom lacks real pointer capture, layout and `matchMedia`. Tests stub
  `setPointerCapture`, `releasePointerCapture` and `hasPointerCapture` on the
  container, use writable `scrollLeft`/`scrollTop` (with optional max values
  to simulate edges), stub `getBoundingClientRect`, `clientHeight`,
  `matchMedia` and `requestAnimationFrame`, as the existing
  `previewBodyWithPointerCapture` helper does for capture. Pointer events set
  `timeStamp` through the helper so fling samples are deterministic.
- `README.md` shortcut section: the wheel line becomes "`Ctrl`/`Cmd`+mouse
  wheel or trackpad pinch: smooth preview zoom under the pointer for
  Markdown/rendered, source, image, video and PDF previews (not configured by
  keymap.toml)". The pan line becomes "Right- or middle-button drag pans
  Markdown/rendered, source, image, video and PDF previews with momentum; the
  native context menu is suppressed over previews except on selected text or
  editable fields". The image left-drag feature line
  mentions momentum.
- Commands: `bun run typecheck`, `bun run lint:biome`, `bun run test`,
  `mise exec -- env PATH="$(mise where node)/bin:$PATH" bun run test:dom` and
  `CARGO_TERM_QUIET=true bun run tauri build --debug --no-bundle`, all in the
  foreground with exit status and log path recorded.

---

## Revision-Aware Local Refresh

Local file-view refresh is a workspace refresh, not only a document-body reload.
When the user requests refresh, chilla re-reads the current directory listing and
the currently open file from disk. Refresh remains available when a directory is
open without an active file so newly created, removed, renamed, resized, or
reordered entries can appear without navigating away and back.

### Responsibility Split

- Rust directory and preview services remain authoritative for filesystem reads.
  They do not retain directory listings or local file contents between commands.
- Solid.js coordinates one refresh request across the current directory or
  explicit file set and the open preview while preserving the active sort,
  filter, and selection when those paths still exist.
- Browser-rendered resources whose URL would otherwise remain stable use the
  file revision supplied by the backend to invalidate WebView caches. Image HTML
  and the PDF document URL loaded by pdf.js must therefore change when the
  source file modification marker changes.
- A direct image preview, including SVG, applies its own revision to the
  resolved image URL. Relative images embedded in Markdown continue to use
  their own resource resolution without inheriting the document revision.
- An explicit workspace refresh advances a local resource generation even if
  the filesystem modification marker is unchanged. Direct images, PDF documents,
  local assets embedded in Markdown, and asset-protocol audio/video fallbacks
  receive a fresh URL. Remote links keep their existing URLs. Streamed audio
  and video already receive newly registered URLs on each preview request.
- Audio and video refresh continue to use newly registered stream URLs. Markdown,
  text, CSV, EPUB, and binary previews continue to rebuild their payloads from a
  fresh backend read.

### Consistency And Failure Behavior

- Directory and file refresh are best-effort parts of the same user action. A
  directory failure or file failure must produce an actionable UI error rather
  than silently retaining a supposedly fresh result.
- If an entry disappears, the refreshed directory listing is still applied. An
  open preview that can no longer be read is cleared so stale content is not
  presented as current.
- Unsaved Markdown edits keep the existing conflict-safe behavior; refresh must
  not silently overwrite a dirty editor buffer.
- GitHub diff cache validation remains based on the remote target's `updated_at`
  marker and is not part of local filesystem refresh.

### Verification Expectations

- Frontend tests cover directory-only refresh, combined directory/file refresh,
  selection preservation, deleted-file cleanup, and revision-bearing PDF URLs.
- Rust tests cover revision-bearing image preview HTML and fresh filesystem reads.
- Mixed-stack checks cover Bun and Cargo toolchains, followed by a debug build and
  local desktop launch.

---

## Direct Image Drag Panning

Direct image-file previews, including SVG and raster formats, support pointer
panning when zoomed content exceeds the visible preview area. Holding the primary
mouse button and dragging moves the image in the same direction as the pointer,
matching touch-screen content manipulation: dragging right decreases horizontal
scroll offset and dragging down decreases vertical scroll offset.

The interaction belongs to the shared frontend preview pane but is enabled only
for direct image-file previews. Markdown and EPUB previews retain normal text
selection and link interaction. A valid drag captures the pointer until primary
button release, cancellation, or lost capture; it suppresses selection only while
the drag is active. Existing wheel, keyboard, and zoom behavior remains unchanged.

Frontend DOM tests cover horizontal and vertical movement, non-primary-button
rejection, pointer termination, and the absence of drag handling in non-image
rendered previews.

---

## Preview Header File Identity

Every active document preview header displays the selected file's basename next
to the existing `Preview` label. This applies consistently to rendered Markdown,
generic text and image previews, CSV raw and formatted views, EPUB, PDF, audio,
and video previews.

Solid.js owns this presentation using the `file_name` already present in the
document and typed file-preview payloads. The header must not derive or expose a
full filesystem path. Long basenames truncate within the header while retaining
the complete basename in a hover title. Existing preview metadata, dirty-state
notices, pagination, playback hints, and zoom percentage remain visible and keep
their current behavior.

Frontend DOM tests verify the selected basename appears in shared and dedicated
preview headers and that switching preview payloads updates the displayed name.

## Startup Window Bounds

Before showing the main window, the Rust desktop layer fits its outer bounds
inside the current monitor's usable work area, falling back to the primary
monitor when necessary. Both size and position are constrained, including
negative monitor coordinates and menu bar or Dock offsets. Physical coordinates
are used consistently so display scaling does not mix units.

On macOS, native screen visible bounds supply the vertical menu bar offset that
the currently locked Tauri runtime omits. The existing locked Objective-C
bindings are used with macOS-only dependencies and limited features. Startup
waits for queued geometry changes without blocking the main event loop, with a
bounded fallback so a failed adjustment does not indefinitely hide the window.

The configured initial size remains the preferred size. On smaller displays,
the minimum content size is reduced as needed to allow the window to fit.
Sizing accounts for any difference between inner and outer dimensions. Windows
already inside the work area retain their geometry. Startup remains usable if
monitor information is unavailable or adjustment fails: the window is still
shown and existing verbose diagnostics record adjustment errors.

Regression tests cover oversized and misplaced windows, offset monitors,
scaled displays, and work areas smaller than the configured minimum size.

### Window Tiling

The preferred launch size is independent of the smallest permitted window.
The native minimum content size is 320 by 240 logical pixels: the width matches
the frontend body's existing minimum, and the height allows compact tiles while
retaining a usable header and content viewport. External window managers can
resize the window below its preferred launch size without startup sizing running
again. The former 960 by 640 minimum prevented half and quarter tiles on laptop
and smaller external displays. Native Accessibility resize and position readback
verify this contract on macOS. AeroSpace must identify the main window as a
normal window and automatically place it in the tiling tree. Borderless native
windows omit standard window controls and trigger AeroSpace's dialog heuristic,
even when the Accessibility subrole is AXStandardWindow. The macOS window must
retain native standard window semantics; no application-specific AeroSpace rule
or user configuration change is required.

macOS enables native decorations before the main window is created, placing the
native title bar above the existing custom toolbar. Other platforms keep the
configured borderless presentation. This preserves actual native close and
fullscreen controls instead of emulating Accessibility attributes.

### Left Pane Toggle

The main toolbar always offers an icon button to collapse or expand the left
file pane, including when the pane is hidden. It uses the same state and action
as the default Shift+L shortcut. Its accessible label describes the next action,
its expanded state reflects actual visibility, and its tooltip uses the effective
configured shortcut. The control remains available in file and Git diff modes.
When collapsed, a compact tab at the left edge of the content area also exposes
the expand action for mouse users. It does not reserve a full sidebar column or
obscure the document content beyond the tab itself.

Collapsing transfers keyboard focus to the visible document or diff preview.
Hidden browser controls cannot receive focus or execute browser shortcuts;
preview scrolling and diff presentation shortcuts remain available. Expanding
restores browser interaction and focuses the selected row when available.
Starting with explicit file arguments collapses the pane and focuses the loaded
preview, including an explicit set of files. Directory and diff-target startup
keep the browser expanded. Visibility is session state, not a persisted preference.

### Recursive Search Result Navigation

Both filename and content search support unmodified `j`/`k` while focus is in
the result list, alongside the existing arrow keys. Query inputs retain normal
text entry, including `j` and `k`; arrow keys enter the results from the input.
Selection follows focus and remains visible when navigating long results.
Focusing a result previews that file using the existing debounced selection
preview path while keeping search open and the current directory unchanged.

Unmodified `l` on a result and a separately focusable jump icon at the right end
of each row reveal that file in the application's directory browser. This loads
its containing directory, clears any stale filename filter, selects the exact
file even beyond the first directory page, and returns focus to that row. Search
closes on successful navigation; navigation errors remain visible and must not
leave a mismatched selection. Existing Enter/click opening behavior is preserved.
The jump button has an accessible file-specific name and shortcut tooltip.

## Internal Media Delivery

See [Internal Media Protocol](design-media-protocol.md) for the socket-free Tauri
protocol architecture replacing the startup loopback HTTP media server.

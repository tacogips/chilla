# Architecture Design

This document describes system architecture and design decisions.

## Overview

Architectural patterns, system structure, and technical decisions.

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
- `Ctrl` plus mouse-wheel up or down applies the same increment or decrement
  while the pointer is over the rendered preview.
- Preview zoom is clamped from 50% through 300%.
- Keyboard zoom is ignored while the user is typing in an editable control.
- Handled wheel events suppress the WebView's native page zoom.
- The preview header exposes the current percentage so the state remains visible.

The zoom applies to the whole rendered content tree. This keeps Markdown text,
diagrams, tables, and embedded images in the same visual scale and lets direct
image previews grow beyond the pane width with normal pane scrolling.

### Scope Boundary

Raw Markdown and CSV editors are not zoom targets. PDF keeps its embedded viewer
controls, EPUB keeps its pagination model, and audio/video playback shortcuts are
unchanged. No persisted preference or cross-window synchronization is required.

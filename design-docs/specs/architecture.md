# Architecture Design

This document describes system architecture and design decisions.

## Overview

Architectural patterns, system structure, and technical decisions.

---

## Sections

## Markdown Workbench Architecture

This section defines the target architecture for the desktop Markdown viewer/editor experience.

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

Chilla should expose three user-facing diff modes for all GitHub diff source kinds:

| Chilla mode | qraftbox reference | Behavior |
|-------------|--------------------|----------|
| Left/right | `side-by-side`, `diff_side_by_side.png` | Old and new columns are aligned with line-number gutters and changed rows highlighted |
| Stack | `inline`, `diff_stack.png` | Shows old/new changes in one vertical flow suitable for narrow widths and sequential review |
| Full-file | qraftbox `full-file` behavior, adapted to chilla | Shows latest file content when available, highlights changed regions, and marks deleted locations without rendering deleted content as current file text |

Full-file mode may require lazy full-text retrieval from a GitHub raw URL. Missing raw URLs, binary files, deleted files, or too-large files should show explicit placeholders instead of failing the whole diff workspace.

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
- Shared controls for left/right, stack, and full-file modes remain available for every source kind when the file payload supports them.
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
- Detection changes must not cause SVG or text-like files to bypass their existing sanitization and preview paths.

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

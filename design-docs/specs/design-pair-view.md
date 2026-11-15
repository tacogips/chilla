# Pair View Design

Side-by-side view for exactly two regular-file CLI arguments at launch.
The main use is comparing before/after images (`chilla before.png after.png`).

This document extends `design-file-viewer-mode.md` (Startup Behavior, Explicit
File Set View) and `command.md` (positional path forms). Everything not stated
here keeps the behavior defined in those documents.

## Scope

In scope:

- CLI startup classification of exactly two positional file arguments that
  resolve to two distinct canonical regular files into a new pair target.
- A new startup payload variant carried from Rust to the frontend.
- A frontend pair layout with two horizontal panes. Each pane reuses the
  existing preview renderers and has an eye toggle.

Out of scope (behavior unchanged):

- Zero, one, or three-or-more file arguments, directory arguments, mixed
  directory and file arguments, GitHub diff targets, and local Git diff
  targets.
- macOS Finder / Apple Event open-files delivery (`design-macos-file-open.md`)
  and the frontend picker path (`startupContextForPickedTarget`). These still
  build directory or explicit-file-set contexts, even for two files.
- Editing. Pair panes are read-only previews. Markdown editing, TOC, and
  file-view to markdown-mode switching are not available in pair view.
- Pane resizing, keyboard shortcuts for the eye toggle, synchronized
  scroll/zoom, and live file watching per pane.

## Startup Classification

Classification stays in `resolve_explicit_file_startup`
(`src-tauri/src/cli/mod.rs`). It runs only after the existing GitHub and local
Git-diff detection has declined the arguments. Canonicalization, the directory
rejection message, the non-regular-file error, and first-occurrence
deduplication are unchanged.

The classification uses two counts:

- `P`: the number of positional path arguments passed to
  `resolve_explicit_file_startup`, after the existing option handling
  (`--verbose`, `--csv-first-row-header`, and the others).
- `U`: the number of unique canonical regular files after the existing
  first-occurrence deduplication.

Only the final match changes:

| Condition | Startup target |
|-----------|----------------|
| `U == 0` | existing usage error (unchanged) |
| `U == 1` (any `P`, for example `a a`, `a ./a`, `a a a`) | `StartupTarget::File` (unchanged) |
| `P == 2` and `U == 2` | `StartupTarget::FilePair { left, right }` (new) |
| `U >= 2` otherwise (that is, `P >= 3`, for example `a b a` or `a b c`) | `StartupTarget::FileSet` with first-occurrence order (unchanged) |

Rules:

- `left` is the first positional argument's canonical path and `right` is the
  second's.
- Any directory argument among two or more paths still fails with the existing
  `multi-path startup only accepts regular files` usage error (exit code 2).
- Three or more positional file arguments never produce `FilePair`, even if
  they deduplicate to two unique files. `a b a` stays `FileSet([a, b])`.
- The variant is a named two-field form, not a `Vec`, so a pair with any other
  count cannot be represented.
- The CLI help text sentence about two or more paths is replaced with: "If two
  file paths are provided, chilla shows them side by side. If three or more
  file paths are provided, chilla opens file view mode with the left pane
  limited to those files."

## Rust Consumers Of The New Variant

All `StartupTarget` matches are exhaustive, so adding the variant makes the
compiler flag every consumer:

| Location | Behavior for `FilePair` |
|----------|-------------------------|
| `viewer/service.rs` startup context | Builds `initial_mode: FileView` and `BrowserRoot::FilePair` (below). Both display paths come from the canonical paths. |
| `verbose_log.rs` startup-load path | Returns `left`. The one-time startup-load marker is armed for the left canonical path, the same as `FileSet` arms its first path (`architecture.md`, Startup Data Flow step 5). |
| `cli/mod.rs` (`run_outcome` and the other startup plumbing) | Passes the target through unchanged. These code paths have no per-variant behavior. |

No other non-test module matches on `StartupTarget` (`lib.rs` only forwards
the target).

`directory_listing.rs` and `list_explicit_file_set` are not used in pair view
and do not change.

## Startup Payload Contract

New `BrowserRoot` variant, serialized with the existing `kind` tag:

```text
BrowserRoot
- file_pair:
  - kind: "file_pair"
  - left_file_path
  - right_file_path
```

- `StartupContext.initial_mode` is `file_view` and `file_open_options` is
  passed through unchanged.
- The TypeScript `BrowserRoot` union in `src/lib/tauri/document.ts` gains the
  same variant. The startup-context normalizer accepts `file_pair` and
  `filePair`, and rejects a pair payload that is missing either path, the same
  way it rejects malformed explicit-file-set payloads.
- TypeScript consumers that narrow `browser_root.kind` by elimination must
  get an explicit `file_pair` branch. These are the startup branch in
  `WorkspaceShell.tsx`, whose final `else` currently assumes
  `explicit_file_set`, and `loadingMessage` in `WorkspaceFeedback.tsx`, which
  shows "Opening the requested files..." for a pair. Neither may fall through
  into explicit-file-set or directory handling.
- No new Tauri command is added. Each pane loads its file with the existing
  `open_file_preview` command and `file_open_options`. Markdown files resolve
  to the existing `FilePreview` markdown variant (rendered HTML), so
  `open_document` is not used in pair view.
- Rust and TypeScript must change together (tauri-development skill).

## Frontend Behavior

### Workspace Integration

`WorkspaceShell` startup handling gains a `file_pair` branch:

- The file browser is closed and the "Expand left pane" tab is not rendered.
  No directory or explicit-file-set state is loaded.
- The TOC pane is not rendered.
- Instead of the single `WorkspaceDocumentColumn`, the viewer grid renders a
  pair view component (new module under `src/features/pair-view/`).
- Workspace header controls that act on the single active document (format
  toggles, CSV raw/formatted, markdown raw/preview, syntax highlighting, TOC,
  open-as-markdown) are hidden or disabled in pair view. Header actions that
  do not depend on an active document (theme, help, keymap) keep working.
- Reload (the existing reload action) re-runs `open_file_preview` for both
  panes. There is no automatic file watching in pair view.

### Pane Rendering

- Each pane owns its own `FilePreview | null`, loading flag, and error
  message. One pane failing to load shows its error inside that pane and does
  not block the other pane.
- Each pane renders its preview with the existing `WorkspaceDocumentColumn`
  (`markdownDoc = null`, the pane's `filePreview`, and default presentation
  values: CSV `formatted` when available, structured data and HTML at their
  existing defaults). No image, markdown, or file renderer is duplicated.
  `WorkspaceDocumentColumn.tsx` has uncommitted user edits; pair view must
  consume it as-is or layer changes on top of that diff.
- Renderer mapping, unchanged from `WorkspaceDocumentColumn` and
  `workspacePreviewModel.ts`: images, rendered Markdown, and text use
  `PreviewPane` (images with `dragPanEnabled`). `MediaFilePreviewPane` handles
  only audio and video. PDF, EPUB, CSV, and rendered HTML use their existing
  panes. Each instance keeps its own pan/zoom state.
- Each pane has a small header row showing the file basename (full path in the
  `title` attribute) and the eye toggle at its top-left.

### Layout

- Both visible: two columns of equal width (`1fr 1fr`), left pane = first
  argument, right pane = second argument.
- One pane hidden: the visible pane takes all width except a narrow restore
  strip on the hidden pane's side. The strip contains an eye-off button that
  restores the hidden pane.
- A hidden pane stays mounted with the `hidden` attribute so its scroll and
  zoom state survive restore. Panes are never unmounted on hide.
- Hidden-pane shortcut suppression:
  - `PdfFilePreviewPane` (`hidden()` check) and `MediaFilePreviewPane`
    (`closest(".pane--hidden, [hidden], [aria-hidden='true']")`) already skip
    window keydown handling inside a hidden ancestor. They do not change.
  - `PreviewPane`'s window keydown handler (`+` / `-` zoom) checks only
    `props.visible`, and `WorkspaceDocumentColumn` always passes
    `visible={true}`. The handler therefore needs one added guard: return
    early when its mounted preview element has a
    `.pane--hidden, [hidden], [aria-hidden='true']` ancestor, matching the
    PDF and media guards. This is the only renderer change. With no hidden
    ancestor, standalone (non-pair) behavior is unchanged, and
    `WorkspaceDocumentColumn.tsx` needs no change for this guard.
  - Wheel zoom and drag pan are element-scoped and cannot target a hidden
    element, so they need no guard.
- Window-level preview shortcuts (for example `+` and `-` zoom) apply to every
  visible pane, using each pane's existing handler. No per-pane focus routing
  is added.

### Pane Visibility State

The visibility state is a pure TypeScript module with a three-value union:

```text
PairPaneVisibility = "both" | "left_only" | "right_only"
```

"Both hidden" cannot be represented. Transitions:

| Current | Action | Next |
|---------|--------|------|
| `both` | hide left | `right_only` |
| `both` | hide right | `left_only` |
| `right_only` | show left (restore strip) | `both` |
| `left_only` | show right (restore strip) | `both` |
| `left_only` | hide left | `left_only` (no-op) |
| `right_only` | hide right | `right_only` (no-op) |

UI rules:

- The visible pane's eye button is disabled (`aria-disabled="true"`, tooltip
  "Cannot hide the only visible pane") while the other pane is hidden.
- The restore strip is always rendered while a pane is hidden. A restore
  control is therefore always visible.
- Buttons have accessible names "Hide left pane", "Hide right pane", "Show
  left pane", and "Show right pane", plus `aria-pressed` that reflects
  visibility.
- Eye and eye-off glyphs are inline SVG added next to the existing workspace
  glyphs. Emoji or icon fonts are not used.
- Initial state is `both`. The state is not persisted.

## Validation

Rust (`src-tauri/src/cli/tests.rs`, `src-tauri/src/viewer/service/tests.rs`
or `service/tests/startup_options_tests.rs`, `src-tauri/src/verbose_log.rs`):

- `a b` produces `FilePair { left: a, right: b }`, and `b a` produces the
  reverse. The existing two-file `FileSet` assertion is updated deliberately.
- `a b c` still produces `FileSet([a, b, c])` (list coverage stays).
- `a b a` produces `FileSet([a, b])` (first-occurrence order), not `FilePair`.
- `a a`, `a ./a`, and `a a a` produce `File(a)`.
- A directory together with a file still fails with the existing usage error
  and exit code 2.
- A local Git directory plus a commit-ish still resolves to `GitDiff`.
- The startup context for `FilePair` serializes as `kind: "file_pair"` with
  both paths and `initial_mode: "file_view"`.
- The startup-load marker arms the left path for `FilePair`.

TypeScript (vitest):

- `document.vitest.ts`: the normalizer accepts the `file_pair` and `filePair`
  variants and rejects missing paths.
- Pair visibility module: every transition in the table, including the two
  no-ops. No sequence of actions reaches a state without a visible pane.
- Pair view component: renders the left/right order, the eye buttons, the
  disabled state of the sole visible pane's button, the restore strip, and a
  per-pane error with the other pane still rendered.
- `WorkspaceShell.vitest.tsx`: a `file_pair` startup context renders the pair
  view, calls `open_file_preview` once per path, and opens no file browser.
  Existing `explicit_file_set` startup tests still pass.
- Hidden-pane zoom regression (DOM test with the real `PreviewPane` rendering
  path through `WorkspaceDocumentColumn`, for both an image preview and a
  Markdown preview):
  - Hide left, dispatch window `+` and `-`, then restore left. The right
    pane's zoom changed and the left pane's zoom is unchanged.
  - The symmetric case for hiding right.
  - With both panes visible, `+` changes both panes' zoom.
- `PreviewPane` standalone: the existing zoom-shortcut tests still pass, and a
  preview inside a `[hidden]` ancestor ignores `+` and `-`.

Commands:

- `cd src-tauri && CARGO_TERM_QUIET=true cargo clippy --all-targets -- -D warnings`
- `cd src-tauri && NEXTEST_STATUS_LEVEL=fail NEXTEST_FAILURE_OUTPUT=immediate-final NEXTEST_HIDE_PROGRESS_BAR=1 CARGO_TERM_QUIET=true cargo nextest run`
- `bun run typecheck`, `bun run test`, `bun run test:dom` (the vitest suite;
  `bun run test` does not run `*.vitest.ts(x)` files), and biome via
  `bun run lint:biome`, `.agents/scripts/format-ts.sh`, or the mise lint task
  (tauri-lint-verify skill)
- Runtime: chilla-post-edit-launch skill. Rebuild, then launch
  `target/debug/chilla <before.png> <after.png>`, and confirm both images
  render side by side and that the eye toggle and restore behave as described.
  If no GUI verification is possible, report this check as partial.

## Rollout Constraints

- This is an additive payload variant. Older frontends never receive it
  because the frontend and backend ship in one bundle.
- User-visible behavior changes only for launches with exactly two positional
  file arguments that resolve to two unique regular files. Their old behavior
  (explicit file-set sidebar with two rows) is intentionally replaced. Launches
  with three or more positional files, including `a b a`, are unchanged.
- Default decisions that are still open for user confirmation are listed in
  `design-docs/user-qa/qa-pair-view.md`. They do not block implementation.

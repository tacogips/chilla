# Pair View: TypeScript Startup Contract And Workspace Integration

**Status**: Completed
**Plan ID**: pair-view-workspace-integration
**Wave**: 2 (depends on pair-view-rust-startup, pair-view-component)
**Design Reference**: design-docs/specs/design-pair-view.md (Startup Payload Contract, Frontend Behavior / Workspace Integration, Validation)
**Created**: 2026-11-15
**Last Updated**: 2026-11-15

---

## Intent And Context

Rust now sends `browser_root = {"kind":"file_pair","left_file_path","right_file_path"}`
with `initial_mode: "file_view"` (see
`impl-plans/completed/pair-view-rust-startup.md`). This plan mirrors that
contract in TypeScript and makes `WorkspaceShell` render `PairView` (see
`impl-plans/completed/pair-view-component.md`) instead of the file browser and
single document column. Every other startup kind must keep its current
behavior.

## Non-Goals

- No edits to Rust, `PairView.tsx`, `pairPaneVisibility.ts`,
  `WorkspaceDocumentColumn.tsx` (user edits), `WorkspaceHeader.tsx`,
  `PreviewPane.tsx`, `openFiles.ts`, or `workspaceDirectoryState.ts`.
- `startupContextForPickedTarget` and the macOS open-files flow stay
  unchanged. They never produce `file_pair`.
- No pair-specific header redesign, file watching, or editing.

## File-Level Changes

### `src/lib/tauri/document.ts`

- `BrowserRoot` union: add
  `{ readonly kind: "file_pair"; readonly left_file_path: string; readonly right_file_path: string; }`.
- Startup-context normalizer (the `explicit_file_set` branch at around lines
  833-875 is the pattern): accept `kind === "file_pair" || kind === "filePair"`
  and read the paths with `readStringProperty(raw, "left_file_path", "leftFilePath")`
  and the matching right-path call. If either is null, throw
  `new Error("Startup file-pair payload is missing required paths")`. Return
  the normalized snake_case shape.

### `src/features/workspace/WorkspaceFeedback.tsx`

- `loadingMessage`: add an explicit `file_pair` branch returning "Opening the
  requested files..." before the final `selected_file_path` access. This is
  required for type-narrowing: after the change, the final return must only
  see the `directory` kind.

### `src/features/workspace/WorkspaceShell.tsx`

- Derived state: `isPairMode = () => startupContext()?.browser_root.kind === "file_pair" && activeGitDiffTarget() === null`,
  plus a memo exposing `{ left, right }` paths.
- Startup branch (around lines 751-780): turn the final `else` into an
  explicit `else if (browserRoot.kind === "explicit_file_set")` with
  unchanged body, and add a `file_pair` branch:
  `setActiveGitDiffTarget(null)`, `setFileTreeOpen(false)`,
  `clearDocumentArea()`. Do not call `loadDirectoryState`,
  `loadExplicitFileSetState`, or `previewSelectedFile`. `PairView` loads its
  own panes. Keep the branches exhaustive with no fall-through.
- Render (around lines 1824-1990):
  - The "Expand left pane" `Show` adds `&& !isPairMode()`.
  - Inside `<Show when={diffTarget() === null}>`, render
    `<PairView leftPath rightPath colorScheme={colorScheme()} fileOpenOptions={startupContext().file_open_options} localResourceGeneration={localResourceGeneration()} onReloadReady={(r) => setPairReload(() => r)} />`
    when `isPairMode()`. Otherwise render the existing
    `FileBrowserPane`/`TocPane`/`WorkspaceDocumentColumn` fragment
    unchanged. Use `Show`/`fallback` or `Switch`; do not restructure the
    existing fragment.
  - `viewerGridClassName` (around line 1514) needs no change. In pair mode
    `isFileTreeOpen()` is false and `hasTocDocument()` is false, so it already
    yields `workspace__body workspace__body--viewer workspace__body--viewer--no-tree`,
    the existing single-document full-width layout. Do not add a new grid
    class and do not edit CSS. Confirm in the launched app that `PairView`
    fills the body width. If it does not, record that as a finding rather
    than editing `App.css`.
- Reload: add `const [pairReload, setPairReload] = createSignal<(() => Promise<void>) | null>(null)`.
  `canReloadCurrent` returns `pairReload() !== null` in pair mode.
  `handleReloadCurrent` awaits `pairReload()` and returns early in pair mode,
  before directory logic.
- `handleToggleFileTree`: return early in pair mode, so the header toggle and
  keyboard shortcut cannot open an empty browser.
- Pitfall: `hasOpenDocument`, `md()`, and `fp()` stay null in pair mode. That
  is intended, and it hides the header's single-document toggles (CSV,
  markdown pane, syntax, TOC) without editing `WorkspaceHeader.tsx`. Do not
  push pair previews into `filePreview`.
- Pitfall: when the picker/open-files flow later sets a new startup context
  (directory or explicit set), `isPairMode()` turns false and the existing UI
  returns. Verify that this path does not leave `pairReload` stale. Clear it
  through PairView's `onReloadReady(null)` on unmount.

### Tests

`src/lib/tauri/document.vitest.ts`, next to the `explicit_file_set` cases
(around lines 124/235):

- snake_case `file_pair` payload -> normalized `file_pair` with both paths.
- camelCase `filePair` with `leftFilePath`/`rightFilePath` -> the same
  normalized shape.
- Missing `right_file_path` -> throws "Startup file-pair payload is missing
  required paths".

`src/features/workspace/WorkspaceFeedback.vitest.tsx`:

- Loading overlay with a `file_pair` context shows "Opening the requested
  files...".

`src/features/workspace/WorkspaceShell.vitest.tsx` (reuse its existing
`vi.mock("../../lib/tauri/document", ...)` harness around line 89):

- A `file_pair` startup context renders `[data-testid="pair-view"]` with left
  and right panes in order. `openFilePreview` is called once per path.
  `listExplicitFileSet` and `listDirectory` are not called. No
  `FileBrowserPane` and no "Expand left pane" button.
- Triggering the reload action in pair mode calls `openFilePreview` again for
  both paths.
- Existing `explicit_file_set` and `directory` startup tests still pass
  unchanged.

## Invariants

- Behavior for the directory, explicit_file_set, github_pr, and git_diff
  startup kinds is unchanged. The existing vitest suites prove this.
- `WorkspaceDocumentColumn.tsx` diff stays the pre-existing user diff.

## Overwrite Safety

This plan runs in wave 2 with `pair-view-hidden-zoom-regression`, which
touches only its own new test file. Before each edit of `WorkspaceShell.tsx`
(about 2000 lines), `document.ts`, and the test files, read the target region
fresh and record a pre-hash with `shasum -a 256`. Re-hash after each edit. On
drift, re-read and re-apply the intent. Do not overwrite blindly.

## Verification (run from repository root)

1. `bun run typecheck` must exit 0. This is the cross-file contract check;
   every `browser_root.kind` narrowing must compile.
2. `bunx vitest run --config vitest.config.ts src/lib/tauri/document.vitest.ts src/features/workspace/WorkspaceFeedback.vitest.tsx src/features/workspace/WorkspaceShell.vitest.tsx`
   must exit 0, with the new cases passing.
3. `bunx biome check src/lib/tauri/document.ts src/lib/tauri/document.vitest.ts src/features/workspace/WorkspaceFeedback.tsx src/features/workspace/WorkspaceFeedback.vitest.tsx src/features/workspace/WorkspaceShell.tsx src/features/workspace/WorkspaceShell.vitest.tsx --diagnostic-level=warn`
   must exit 0.
4. `git diff --stat -- src/features/workspace/WorkspaceDocumentColumn.tsx`
   must show only `2 insertions(+), 2 deletions(-)`.

## Completion Criteria

- [x] TS `BrowserRoot` and normalizer handle `file_pair`
- [x] WorkspaceShell renders PairView in pair mode, with no browser, TOC, or
      expand tab
- [x] Reload works in pair mode; the file-tree toggle is inert
- [x] Tests added; typecheck, targeted vitest, and biome pass
- [x] Progress log updated

## Progress Log

### Session: 2026-11-15 — implementation

Added the file-pair startup normalizer and loading feedback, integrated PairView
into the workspace, and covered pair startup, reload, and tree-toggle behavior.

- `bun run typecheck`: exit 0.
- `NODE_OPTIONS=--no-webstorage bunx vitest run --config vitest.config.ts src/lib/tauri/document.vitest.ts src/features/workspace/WorkspaceFeedback.vitest.tsx src/features/workspace/WorkspaceShell.vitest.tsx`: exit 0, 97/97 passed.
- Exact unconfigured Vitest command: exit 1, 88/97 passed; nine existing localStorage cases fail because localStorage is undefined in this environment, including with `mise exec`. Logs retain both attempts.
- Plan-scoped `bunx biome check ... --diagnostic-level=warn`: exit 0.
- `git diff --stat -- src/features/workspace/WorkspaceDocumentColumn.tsx`: exit 0; 2 insertions, 2 deletions.
- Evidence and edit hashes: `tmp/pair-view-20261115-01/pair-view-workspace-integration/`; complete verification logs are in `verification-1/`.

Formal review, downstream hidden-zoom regression, combined-tree verification,
and GUI launch remain with their assigned workflow steps.

### Session: 2026-11-15 — verification continuation

The targeted Vitest command passes 97/97 with Node 22.23.4, the version pinned
in `mise.toml`, explicitly first on PATH. The unconfigured Node 26 invocation
still fails nine localStorage cases. Typecheck and scoped Biome pass; the
protected document-column diff remains 2 insertions and 2 deletions. Complete
logs and plan hashes are in `verification-2/` under the plan evidence root.
Formal review and combined-tree verification remain downstream.

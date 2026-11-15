# Pair View: Visibility State And Pair Layout Component

**Status**: Completed
**Plan ID**: pair-view-component
**Wave**: 1 (no dependencies)
**Design Reference**: design-docs/specs/design-pair-view.md (Pane Rendering, Layout, Pane Visibility State, Validation)
**Created**: 2026-11-15
**Last Updated**: 2026-11-15

---

## Intent And Context

This plan builds a standalone Solid component that shows two files side by
side (left = first CLI path, right = second). Each pane has an eye toggle at
its top-left. Hiding a pane gives the other one the full width, apart from a
narrow restore strip. Both panes can never be hidden at the same time. Each
pane renders through the existing
`src/features/workspace/WorkspaceDocumentColumn.tsx`; renderers are not
duplicated. The component does not depend on the new startup payload type.
It takes plain paths, so it can be built in parallel with the Rust and
contract work.

## Pinned Contract (consumed by pair-view-workspace-integration and pair-view-hidden-zoom-regression)

`src/features/pair-view/pairPaneVisibility.ts`:

```ts
export type PairPaneVisibility = "both" | "left_only" | "right_only";
export type PairPaneSide = "left" | "right";
export function hidePairPane(state: PairPaneVisibility, side: PairPaneSide): PairPaneVisibility;
export function showPairPane(state: PairPaneVisibility, side: PairPaneSide): PairPaneVisibility;
export function isPairPaneVisible(state: PairPaneVisibility, side: PairPaneSide): boolean;
export function canHidePairPane(state: PairPaneVisibility, side: PairPaneSide): boolean;
```

`src/features/pair-view/PairView.tsx`:

```ts
export interface PairViewProps {
  readonly leftPath: string;
  readonly rightPath: string;
  readonly colorScheme: ColorScheme;
  readonly fileOpenOptions: FileOpenOptions;
  readonly localResourceGeneration?: number;
  readonly loadPreview?: (path: string, options: FileOpenOptions) => Promise<FilePreview>;
  readonly onReloadReady?: (reload: (() => Promise<void>) | null) => void;
}
export function PairView(props: PairViewProps): JSX.Element;
```

- `loadPreview` defaults to `openFilePreview` from `src/lib/tauri/document.ts`.
- `onReloadReady` follows `src/features/pr-diff/PrDiffWorkspace.tsx` (props
  line 63, calls at about lines 1457/1463). Call it with a reload function on
  mount and with `null` in `onCleanup`.
- DOM hooks for tests and integration: the root has
  `data-testid="pair-view"`. Each pane is a `section` with
  `data-pair-pane="left|right"`. A hidden pane's section carries the `hidden`
  attribute. The restore strip has `data-pair-restore="left|right"`.

## Non-Goals

- No edits to `WorkspaceDocumentColumn.tsx` (uncommitted user edits),
  `WorkspaceShell.tsx`, `document.ts`, `PreviewPane.tsx`, `App.css`, or
  `package.json`.
- No resize handle, keyboard shortcut, persistence, file watching, editing,
  TOC, or synchronized zoom.
- No new icon font or emoji. Glyphs are inline SVG.

## File-Level Changes

### `src/features/pair-view/pairPaneVisibility.ts` (new)

Pure functions implementing the design transition table:

- `both`: hide left gives `right_only`; hide right gives `left_only`.
- `right_only`: show left gives `both`. `left_only`: show right gives `both`.
- Hiding the only visible pane is a no-op (returns the same state). Showing an
  already-visible pane is a no-op.
- `canHidePairPane` is true only in `both`.

### `src/features/pair-view/PairView.tsx` (new)

- State: `createSignal<PairPaneVisibility>("both")`. Per side, a
  `FilePreview | null`, a loading flag, and an error message.
- Load both panes concurrently on mount, each independently. One pane's
  rejection sets only that pane's error and never blocks the other. Guard
  against stale results with a per-pane request counter (pattern:
  `previewRequestId` in `WorkspaceShell.tsx`'s `previewSelectedFile`), so that
  a reload racing an older load does not apply stale data.
- `reload` re-runs both loads and resolves when both settle. It does not
  reject on a per-pane error; it shows that error in the pane.
- Each pane:
  - Header row: eye button at top-left, then the basename (derive it from the
    path; the full path goes in `title`).
  - Eye button for a visible pane: `aria-label` "Hide left pane" or "Hide
    right pane", `aria-pressed="true"`. When `!canHidePairPane`, set
    `aria-disabled="true"`, title "Cannot hide the only visible pane", and
    ignore clicks. Do not use the native `disabled` attribute, so the tooltip
    stays reachable.
  - Body: `WorkspaceDocumentColumn` with `markdownDoc={null}`,
    `markdownPane="preview"`, `markdownEditorBuffer=""`,
    `markdownIsDirty={false}`, `selection={{ anchorId: null, lineStart: null }}`,
    `filePreview={pane preview}`, `epubToc={preview.kind==="epub" ? preview.toc : []}`,
    `csvPreview={preview.kind==="csv" ? preview : null}`,
    `csvFirstRowAsHeader` from the preview's `first_row_as_header`,
    `csvPaneMode` `"formatted"` when `formatted_available`, else `"raw"`,
    `structuredDataMode` and `htmlPresentationMode` at the defaults
    `WorkspaceShell` uses on first open (look them up; do not invent new
    values), `videoAutoplayRequestId={0}`,
    `hasOpenDocument={preview !== null}`, and no-op handlers. Read
    `WorkspaceDocumentColumnProps` freshly at implementation time. The file
    has user edits and the prop list may differ slightly. Satisfy whatever it
    requires without editing it.
  - Error: render the message inside the pane body (reuse the
    `WorkspaceErrorBanner` from `src/features/workspace/WorkspaceFeedback.tsx`
    if it fits; otherwise a simple `role="alert"` element).
- Hidden pane: keep it mounted. Set `hidden` on its section, and render the
  restore strip on that side with an eye-off button labeled "Show left pane"
  or "Show right pane" (`aria-pressed="false"`). Never unmount a pane on hide.
- Grid: both panes `1fr 1fr`. When one is hidden, the restore strip is a
  narrow fixed column (about 28px) and the visible pane takes the rest. Order
  in the DOM is always left then right.

### `src/features/pair-view/PairView.css` (new)

Import it from `PairView.tsx` (the same pattern as the CSS imports in
`PreviewPane.tsx`). Use the existing CSS custom properties from
`src/app/App.css` for colors and borders. Do not edit `App.css`. The pane must
be `min-width: 0` and `overflow: hidden` so that large images fit within the
pane.

### `src/features/workspace/workspaceGlyphs.tsx`

Add `EyeGlyph` and `EyeOffGlyph`, inline SVGs following `SunGlyph`
(`viewBox="0 0 24 24"`, `aria-hidden="true"`, `stroke="currentColor"`).
Leave existing glyphs unchanged.

### Tests (new)

`src/features/pair-view/pairPaneVisibility.vitest.ts`:

- Each row of the transition table gives the expected state, including both
  no-ops and the show-when-visible no-ops.
- Exhaustive walk: from `both`, apply every action sequence up to length 4.
  `isPairPaneVisible(left) || isPairPaneVisible(right)` stays true.
- `canHidePairPane`: true only for `both`.

`src/features/pair-view/PairView.vitest.tsx` (mock `@tauri-apps/api/core`
like `WorkspaceDocumentColumn.vitest.tsx`; pass a fake `loadPreview` that
returns text or image `FilePreview` fixtures):

- Mount with `/a/before.png` and `/b/after.png` -> left section shows
  `before.png` and the right shows `after.png`, in DOM order; `loadPreview`
  is called once per path with `fileOpenOptions`.
- Click "Hide left pane" -> the left section has `hidden`, the
  `data-pair-restore="left"` button "Show left pane" is present, and the
  right pane's eye has `aria-disabled="true"`.
- Clicking the disabled right eye -> the state stays the same (the left
  restore is still present and the right is not hidden).
- Click "Show left pane" -> both visible; no restore strip.
- The symmetric flow for the right pane.
- The left `loadPreview` rejects -> the left pane shows the error text and the
  right pane still renders its preview.
- `onReloadReady` receives a function. Calling it calls `loadPreview` again
  for both paths. Unmount -> `onReloadReady(null)`.

## Invariants

- No state representing "both hidden" exists.
- `WorkspaceDocumentColumn.tsx` remains byte-identical (check with
  `git diff --stat`, which must equal the pre-existing 2+/2- user diff).

## Overwrite Safety

All files except `workspaceGlyphs.tsx` are new and owned exclusively by this
plan. Before each edit of `workspaceGlyphs.tsx`, read it fresh, record a
pre-hash with `shasum -a 256`, and re-hash after. If it drifted, re-read and
re-apply.

## Verification (run from repository root)

1. `bunx vitest run --config vitest.config.ts src/features/pair-view/pairPaneVisibility.vitest.ts src/features/pair-view/PairView.vitest.tsx`
   must exit 0, with all cases above passing.
2. `bun run typecheck` must exit 0. If the only errors are in files owned by
   other in-progress wave-1 plans, record that.
3. `bunx biome check src/features/pair-view src/features/workspace/workspaceGlyphs.tsx --diagnostic-level=warn`
   must exit 0.
4. `git diff --stat -- src/features/workspace/WorkspaceDocumentColumn.tsx`
   must show only the pre-existing `2 insertions(+), 2 deletions(-)`.

## Completion Criteria

- [x] Visibility module and its tests
- [x] PairView component, CSS, and glyphs
- [x] Component tests pass; typecheck and biome clean
- [x] WorkspaceDocumentColumn.tsx untouched
- [x] Progress log updated

## Progress Log

### Session: 2026-11-15

Implemented the visibility state machine, pair component, glyphs, and focused tests. Focused Vitest passed 7 tests; typecheck and scoped Biome exited 0. The document column diff remains 2 insertions and 2 deletions. Evidence: `tmp/pair-view-20261115-01/pair-view-component/check-01/`. Formal review and integration remain downstream.

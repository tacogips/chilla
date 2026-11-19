# Link Navigation: Preview Link Click Handling Implementation Plan

**Status**: Ready
**Plan ID**: link-nav-preview-pane
**Wave**: 2 (depends on link-nav-preview-links)
**Design Reference**: design-docs/specs/design-link-navigation-history.md#click-handling-previewpane, #fragment-resolution
**Created**: 2026-11-19
**Last Updated**: 2026-11-19

---

## Intent And Context

Clicking a local link in the preview currently lets the webview navigate away
from the app. This plan makes `PreviewPane` intercept every handled link. It
also threads a new optional `onNavigateLink` callback through
`WorkspaceDocumentColumn` and `PairView` to the shell (wave 3).

Current code:

- `src/features/preview/PreviewPane.tsx`: `handleClick` in `onMount` (only
  handles `isDefaultBrowserUrl`); the `selectedAnchorId` effect uses the
  unescaped `querySelector(`#${anchorId}`)`.
- `src/features/workspace/WorkspaceDocumentColumn.tsx`: two `<PreviewPane>`
  instances.
- `src/features/pair-view/PairView.tsx`: `pane(side)` renders
  `WorkspaceDocumentColumn`.

## Non-Goals

- No history, scrolling-to-fragment or file opening here. The shell does that.
- No change to `EpubPreviewPane`, `HtmlRenderedPreviewPane` or pr-diff.
- Do not change the pan, zoom or keyboard handlers in `PreviewPane`.
- Do not change pair visibility or `{` / `}` behavior.

## Pinned Contract

- `PreviewPane` props: `readonly onNavigateLink?: (request: PreviewLinkNavigation) => void;`
  (type imported from `../preview/previewLinks`).
- `WorkspaceDocumentColumnProps`: the same optional `onNavigateLink`, passed to
  both `PreviewPane` instances.
- `PairViewProps`: `readonly onNavigateLink?: (side: PairPaneSide, request: PreviewLinkNavigation) => void;`.
  Each pane passes `(request) => props.onNavigateLink?.(side, request)`.

## Deliverables

### `PreviewPane.tsx`, `handleClick`

- Return early unless `event.button === 0` and the target is inside an
  `a[href]`.
- Call `event.preventDefault()` synchronously, before any await, for every
  `a[href]` click, so the webview never navigates.
- Then
  `void classifyPreviewLink(href, props.documentPath, { dirname, join, normalize })`
  (the same `@tauri-apps/api/path` imports already used) and handle the
  result:
  - `external` -> `openUrl(url)`, swallowing errors (current behavior);
  - `anchor` -> if `props.documentPath` is non-null, call
    `onNavigateLink({ path: props.documentPath, fragment })`;
  - `file` -> `onNavigateLink({ path, fragment })`;
  - `ignore` -> nothing.
  - Classification errors are swallowed.
- Keep the existing `rel`/`target` attributes set in `enhancePreviewContent`.

### `PreviewPane.tsx`, anchor effect

- Replace `container.querySelector(`#${anchorId}`)` with
  `findFragmentTarget(container, anchorId)`. Keep the smooth scroll.

### `WorkspaceDocumentColumn.tsx`

- Add the optional prop and pass it to both `PreviewPane`s.

### `PairView.tsx`

- Add the optional side-aware prop and pass a per-side closure to
  `WorkspaceDocumentColumn`.

## Pitfalls

- `preventDefault` must not wait for the async classification; otherwise the
  webview navigates first.
- Do not call `openPath` for local links.
- In tests, the `@tauri-apps/api/path` mock must provide async
  `dirname`/`join`/`normalize`. Reuse the mocks already present in
  `PreviewPane.vitest.tsx`, or add them there.
- Links inside asciinema fallback captions are still `a[href]` and are handled
  the same way (external).

## Tests

`src/features/preview/PreviewPane.vitest.tsx`:

- html `<a href="./b.md#Sec">`, documentPath `/docs/a.md`, click ->
  `defaultPrevented` true; `onNavigateLink` called with `{path:"/docs/b.md", fragment:"Sec"}`
- `<a href="#2024-notes">` -> `onNavigateLink({path:"/docs/a.md", fragment:"2024-notes"})`
- `<a href="https://example.com">` -> `openUrl` called; `onNavigateLink` not
  called
- `<a href="#">` -> prevented; no callback; no `openUrl`
- middle click (`button: 1`) -> no callback
- `selectedAnchorId="2024-notes"` with `<h2 id="2024-notes">` -> no throw;
  `scrollIntoView` called

`src/features/workspace/WorkspaceDocumentColumn.vitest.tsx`:

- a Markdown doc with a link -> clicking it calls the column's
  `onNavigateLink`

`src/features/pair-view/PairView.vitest.tsx`:

- a link click in the right pane -> `onNavigateLink("right", {...})`
- the existing visibility tests still pass

## Verification

- `bunx vitest run --config vitest.config.ts src/features/preview/PreviewPane.vitest.tsx src/features/workspace/WorkspaceDocumentColumn.vitest.tsx src/features/pair-view`
  -> all pass, exit 0
- `bun run typecheck` -> exit 0
- `bunx biome check src/features/preview/PreviewPane.tsx src/features/preview/PreviewPane.vitest.tsx src/features/workspace/WorkspaceDocumentColumn.tsx src/features/workspace/WorkspaceDocumentColumn.vitest.tsx src/features/pair-view/PairView.tsx src/features/pair-view/PairView.vitest.tsx`
  -> no errors

## Completion Criteria

- [ ] All `a[href]` primary clicks are prevented; local and anchor links call
      the callback
- [ ] The digit-leading anchor no longer throws
- [ ] The prop is threaded through the column and PairView
- [ ] Listed tests pass

## Progress Log

### Session: 2026-11-19
**Tasks Completed**: Plan created
**Notes**: Read files fresh and record hashes before and after editing.

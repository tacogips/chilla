# Link Navigation: Preview Link Click Handling Implementation Plan

**Status**: Completed
**Completion**: 2026-11-19. Adversarial review accepted (comm-019097). Serial reconciliation gates passed (`tmp/link-nav-history-20261119-01/serial-reconcile-wave-001/`). Archived to `impl-plans/completed/link-nav-preview-pane.md`.
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

- [x] All `a[href]` primary clicks are prevented; local and anchor links call
      the callback
- [x] The digit-leading anchor no longer throws
- [x] The prop is threaded through the column and PairView
- [x] Listed tests pass

## Progress Log

### Session: 2026-11-19
**Tasks Completed**: Plan created
**Notes**: Read files fresh and record hashes before and after editing.

### Session: 2026-11-19 implementation
**Tasks Completed**: Synchronous link interception, safe fragment lookup, column and side-aware pair callbacks, and focused regression tests.
**Verification**: Scoped vitest 68/68 passed; `bun run typecheck` and scoped Biome passed. Complete logs are in `tmp/link-nav-history-20261119-01/link-nav-preview-pane/check-agent/final-*.log`. Earlier typecheck and Biome failures were corrected and retained in `check-agent/*-01.log`.
**Review**: Formal review and combined-tree verification remain downstream.
**Per-edit SHA-256 evidence**:
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent/column-after.sha256`: `3cdc238c959bc4e0cdb629c23b876919144db5d43ecfd1b399552ae1f44473da  src/features/workspace/WorkspaceDocumentColumn.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent/column-before.sha256`: `c22abb0b6df9aed58e2d687d5084b83a6a69f5c3c3836462ad5122a1b47b4eb9  src/features/workspace/WorkspaceDocumentColumn.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent/pair-after.sha256`: `7acbd256baea226c79841fbe7ce2784eb3a5f3f7104e1c1f2f4431fb33a18040  src/features/pair-view/PairView.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent/pair-before.sha256`: `28b697be7a36c652661452fabb01e2405f6655d2c44342e1233e4bc266ec784c  src/features/pair-view/PairView.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent/preview-after.sha256`: `add32fd874528685528694433a3ae832ec29a2b8f37bbd6e888f8f05661059ce  src/features/preview/PreviewPane.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent/preview-before.sha256`: `b4ba325ae0b04a9dc98c1d2258662556eee94faabe6c63f3f02462f4e0f608e3  src/features/preview/PreviewPane.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent/preview-followup-after.sha256`: `00dee6f0f5da26798355f3cd2f53b78d05844b4e5c40784b1f3449c6702dca35  src/features/preview/PreviewPane.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent/preview-followup-before.sha256`: `add32fd874528685528694433a3ae832ec29a2b8f37bbd6e888f8f05661059ce  src/features/preview/PreviewPane.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent-followup/format-after.sha256`: `d4cd5d21755c3a2ee51f71c52b0846f18ecc5ce8b411e4fe584f3c30bb275f88  src/features/preview/PreviewPane.tsx; 3cdc238c959bc4e0cdb629c23b876919144db5d43ecfd1b399552ae1f44473da  src/features/workspace/WorkspaceDocumentColumn.tsx; 52902c3ede1fd6f0167ab9664e9ced5c484cfe2763a265b61550578495f55587  src/features/pair-view/PairView.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent-followup/format-before.sha256`: `698acb81c3a0785fe607f91177e080470c15a359ed1ffa6032b4ee8537f2ca16  src/features/preview/PreviewPane.tsx; 3cdc238c959bc4e0cdb629c23b876919144db5d43ecfd1b399552ae1f44473da  src/features/workspace/WorkspaceDocumentColumn.tsx; 7acbd256baea226c79841fbe7ce2784eb3a5f3f7104e1c1f2f4431fb33a18040  src/features/pair-view/PairView.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent-followup/preview-after.sha256`: `698acb81c3a0785fe607f91177e080470c15a359ed1ffa6032b4ee8537f2ca16  src/features/preview/PreviewPane.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent-followup/preview-before.sha256`: `00dee6f0f5da26798355f3cd2f53b78d05844b4e5c40784b1f3449c6702dca35  src/features/preview/PreviewPane.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent-typefix/column-after.sha256`: `85512928c08e169dcf86f4877e3512d68db762d6f54d66a0f76cebdc842e2e3c  src/features/workspace/WorkspaceDocumentColumn.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent-typefix/column-before.sha256`: `3cdc238c959bc4e0cdb629c23b876919144db5d43ecfd1b399552ae1f44473da  src/features/workspace/WorkspaceDocumentColumn.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent-typefix/preview-after.sha256`: `ffb688b394f8306aaa2238b4caab526d1cb1272055f4b22980cf957256034793  src/features/preview/PreviewPane.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/ts-agent-typefix/preview-before.sha256`: `d4cd5d21755c3a2ee51f71c52b0846f18ecc5ce8b411e4fe584f3c30bb275f88  src/features/preview/PreviewPane.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/tests-agent/column-after.sha256`: `d4b0a4150565c9e1db2dde1c7e8cef7b5e1c97fa96d400510c25c86467e7fbe0`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/tests-agent/column-before.sha256`: `35064f47f7da0914d8ec6de36304098546e8db3c5af9b2128dbfdcee4cb82c05`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/tests-agent/format-after.sha256`: `ab94687295c4abf472e7dd60b6300460e2289240270485f37ba907c0162c9ab7  src/features/preview/PreviewPane.vitest.tsx; 1f5f34f905e2c5c0249f4af5238fd3e8f5a47b0d7c702c8ab0cbcc566fe76e4b  src/features/workspace/WorkspaceDocumentColumn.vitest.tsx; 134a5af150f39d60bb69b9f538d7e6a3374942e2cceb5ac539f33ccce8fbd71c  src/features/pair-view/PairView.vitest.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/tests-agent/format-before.sha256`: `6b0c799580204ebd5fd3a13ef541e554ec0eafd4da63f2796d50622436260a0e  src/features/preview/PreviewPane.vitest.tsx; d4b0a4150565c9e1db2dde1c7e8cef7b5e1c97fa96d400510c25c86467e7fbe0  src/features/workspace/WorkspaceDocumentColumn.vitest.tsx; db1b69938b63f86c30510c2c9a391731ea2555899a93a3bd143400ee82df32b6  src/features/pair-view/PairView.vitest.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/tests-agent/pair-after.sha256`: `db1b69938b63f86c30510c2c9a391731ea2555899a93a3bd143400ee82df32b6`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/tests-agent/pair-before.sha256`: `7925d3d5c5ea597fa96982c1d35ac455932bccd830296f7d9aff8007c7f3a305`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/tests-agent/preview-after.sha256`: `6b0c799580204ebd5fd3a13ef541e554ec0eafd4da63f2796d50622436260a0e`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/tests-agent/preview-before.sha256`: `6c92588267cff736de1dc7f06e487450a123a9bb9f4cda78b397969cfee5d0b1`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/tests-agent-lint-01/after.sha256`: `8b7430f36a2fa4cbf7d0cfc1926a83b83a20703662592a55f01fba8551a37fac  src/features/preview/PreviewPane.vitest.tsx`
- `tmp/link-nav-history-20261119-01/link-nav-preview-pane/tests-agent-lint-01/before.sha256`: `ab94687295c4abf472e7dd60b6300460e2289240270485f37ba907c0162c9ab7  src/features/preview/PreviewPane.vitest.tsx`
- Plan edit before/after hashes are recorded in `tmp/link-nav-history-20261119-01/link-nav-preview-pane/plan-update-01/{before,after}.sha256` (the after hash cannot be embedded in the file it hashes).

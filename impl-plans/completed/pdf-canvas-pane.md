# PDF Inline Rendering: Canvas PDF Preview Pane Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/design-pdf-inline-rendering.md#pdffilepreviewpane`, `#shared-zoom-input-contract`, `#styling-srcappappcss`, `#data-flow`; `design-docs/specs/architecture.md#revision-aware-local-refresh`
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

## Dispatch metadata

```json
{
  "planId": "pdf-canvas-pane",
  "planPath": "impl-plans/active/pdf-canvas-pane.md",
  "dependsOn": ["pdf-zoom-wheel-contract", "pdf-pdfjs-foundation"],
  "writePaths": [
    "src/features/preview/PdfFilePreviewPane.tsx",
    "src/features/preview/PdfFilePreviewPane.vitest.tsx",
    "src/app/App.css",
    "impl-plans/active/pdf-canvas-pane.md"
  ],
  "sharedPaths": [],
  "workflowMode": "issue-resolution",
  "progressPath": "impl-plans/active/pdf-canvas-pane.md"
}
```

## Intent and context

`src/features/preview/PdfFilePreviewPane.tsx` renders an `<iframe>` with the
WebKit PDF viewer. That iframe swallows keyboard focus, so Chilla's shortcuts
(`L`, `Cmd+O`, `+`/`-`, `r`, `D`, `j`/`k`, `Enter`, `q`) do not work while a
PDF is open. This plan replaces the iframe with pdf.js canvases inside the
normal `.pane__body` scroll container:

- pdf.js is reached through the `./pdfjs` contract from `pdf-pdfjs-foundation`;
- zoom uses the helper and constants from `pdf-zoom-wheel-contract`.

`activeDocumentNavigation.ts:scrollActiveDocumentPane` already scrolls the
first `.pane__body` of the visible pane, so `j`/`k` need no new wiring.

## Non-goals

- No text layer, link layer, outline, search, printing or lazy rendering.
- Do not change props or `WorkspaceDocumentColumn.tsx`. The props `path`,
  `fileName`, `revision` and `localResourceGeneration` stay identical.
- Do not import `pdfjs-dist` directly. Do not touch keymap/workspace files,
  `PreviewPane.tsx`, `MediaFilePreviewPane.tsx` or `README.md`.
- Do not remove the shared `.preview--embedded-html/-video/-audio/-epub`
  selectors. Remove only the PDF members.

## File-level changes

### `src/features/preview/PdfFilePreviewPane.tsx` (rewrite)

- Keep the URL memo exactly as it is today: `convertFileSrc(path)` plus
  `revision`, plus `chilla_refresh` when the generation is greater than 0.
  That memo is the reload key.
- State:
  - `zoom` signal, starting at 100;
  - `status`: `"loading" | "ready" | "error"`;
  - `pageCount`: `number | null`;
  - the current page sizes at scale 1.
- Markup:
  - `<section class="pane">`;
  - `PreviewHeader` (imitate `MediaFilePreviewPane.tsx:MediaFilePreviewPane`
    header usage) containing `<span>PDF</span>`, a page count span when known,
    and `<span class="preview__zoom" aria-live="polite">{zoom()}%</span>`
    (same class as `PreviewPane.tsx`);
  - `<div class="pane__body preview preview--pdf">`, holding one
    `<canvas class="preview-pdf-page">` per page and, on error, a
    `<div class="preview-pdf__error">` with a message plus a
    `<button type="button" class="button">Open in default app</button>`.
    The button calls `openPath(props.path)` from `@tauri-apps/plugin-opener`,
    in the same way as `MediaFilePreviewPane.tsx:openInDefaultApp`.
  - No `tabindex` anywhere, no autofocus, no `focus()` calls, and no iframe.
    The error button is the only focusable element, and it appears only in the
    error state.
- Load effect: use `createEffect(on(pdfUrl, ...))`.
  1. Increment `loadGeneration`.
  2. Cancel all in-flight render tasks.
  3. Await `destroy()` on the previous handle, without blocking the new load.
  4. Set status to `loading` and call `loadPdfDocument(url)`.
  5. On resolve, if the generation is still current, store the document, set
     `pageCount`, and fetch each page in order (`getPage(1..n)`).
  6. On reject, if still current, set status to `error`.
  7. Register `onCleanup` that increments the generation, cancels the render
     tasks and destroys the handle.
- Render: run sequentially in page order.
  1. Compute `scale = zoom()/100 * (window.devicePixelRatio || 1)`.
  2. Set `canvas.width` / `canvas.height` from `getViewport({ scale })`,
     floored.
  3. Set the canvas CSS `width` / `height` to the scale-1 viewport times
     `zoom()/100`, in px.
  4. Call `page.render({ canvas, canvasContext, viewport })` and keep the task.
  5. Before re-rendering a page, cancel that page's previous task.
  6. Ignore rejections whose `name` is `"RenderingCancelledException"`, and any
     rejection from a superseded generation or zoom.

  A separate effect on `zoom()` re-runs the render when a document is loaded.
  A refresh (URL change) keeps the current zoom. A remount resets to 100.
- Keyboard: imitate the `PreviewPane.tsx` `handleKeyDown` rule.
  - Register a `window` `keydown` listener in `onMount` and remove it in
    `onCleanup`.
  - Ignore the event when Ctrl, Meta or Alt is held, or when
    `isEditableKeyboardTarget(event.target)` is true (from
    `../../lib/keyboard`).
  - Handle only `+` and `-`: call `preventDefault`, then
    `nextPreviewZoom(current, dir, RENDERED_PREVIEW_ZOOM_MAX)`.
- Wheel: register a non-passive `wheel` listener on the `.pane__body` ref.
  1. Call `previewZoomDirectionFromWheel(event)`.
  2. If it returns `null`, return without `preventDefault`.
  3. Otherwise call `preventDefault`, then step the zoom.
- Clamp: 50-300%. Use `PREVIEW_ZOOM_MIN`, `RENDERED_PREVIEW_ZOOM_MAX` and
  `nextPreviewZoom` imported from `./PreviewPane`.

### `src/app/App.css`

- Remove `.pane__body.preview.preview--embedded-pdf` from the shared
  fill-pane selector list (about line 969). Keep the other four selectors.
- Delete the rules that target `.preview-pdf-frame`, `.preview--embedded-pdf`,
  and `:has(.preview-pdf-frame)`, including its `.preview-media--pdf` child
  rule (about lines 980-983 and 1089-1123). No producer of those classes
  remains (checked with
  `grep -rn -e preview-pdf-frame -e preview-media--pdf src src-tauri/src`).
- Add these rules:
  - `.pane__body.preview.preview--pdf`: normal block scrolling (`overflow: auto`)
    and a padding similar to other previews;
  - `.preview-pdf-page`: `display: block`, `margin: 0 auto 12px`, a white
    background in both themes (`background: #fff`) and a subtle box-shadow
    using existing variables;
  - `.preview-pdf__error`: a flex column with a gap, styled like
    `.preview-video__actions`.

### `src/features/preview/PdfFilePreviewPane.vitest.tsx` (rewrite)

- Replace the iframe assertions.
- `vi.mock("./pdfjs", ...)` with a controllable fake:
  - `loadPdfDocument` records each URL and returns a handle with a deferred
    promise and a spy `destroy`;
  - the fake document has `numPages` and `getPage`, which returns pages with
    `getViewport` (returns `{width: 100*scale, height: 200*scale}`) and
    `render` (returns `{promise: Promise.resolve(), cancel: spy}`).
- Keep the existing `@tauri-apps/api/core` `convertFileSrc` mock. Add a mock
  for `@tauri-apps/plugin-opener`.
- Stub `HTMLCanvasElement.prototype.getContext` to return `{}`, because jsdom
  has no canvas.

## Pitfalls

- Never set `tabIndex` on the canvases or the body, and never call `focus()`.
  Focus must stay where the workspace left it, or the file-list `j`/`k`
  selection breaks.
- The URL effect must not depend on `zoom()`. The zoom effect must not reload
  the document.
- A late resolve of a superseded load must not overwrite the canvases. Guard
  every async continuation with the generation check.
- Do not CSS-scale a 1x render. Re-render at the new scale for sharp text.
- `devicePixelRatio` may be undefined in jsdom. Default it to 1.
- Do not leave the `window` keydown listener registered after unmount.
  `WorkspaceShell` remounts the pane per file.

## Test cases to add

- Mount with revision `r1` -> `loadPdfDocument` is called with a URL
  containing `revision=r1` and no `chilla_refresh`. With generation 2 the URL
  contains `chilla_refresh=2`.
- Change revision to `r2` -> the first handle's `destroy` is called, and a
  second load starts with `revision=r2`.
- Increment the generation -> the old handle is destroyed and the new URL has
  the new `chilla_refresh`.
- Unmount -> `destroy` is called.
- The document resolves with 3 pages -> 3 `canvas.preview-pdf-page` elements
  exist, and the header shows the page count.
- The pane contains no `iframe`, and `pane.querySelectorAll("[tabindex], button, a[href], input")`
  is empty in the ready state.
- `+` keydown on window -> header `110%`, event `defaultPrevented`, and each
  page `render` is called again with a viewport derived from `scale 1.1`.
  `-` -> back to `100%`.
- `+` while the target is an `<input>` -> no change.
- Alt + wheel with `deltaY -1` on `.pane__body` -> `110%` and prevented.
  Ctrl + wheel with `deltaY 1` -> `100%`. Plain wheel -> not prevented, no
  change.
- 30 zoom-in steps -> clamped at `300%`.
- The load promise rejects -> the error text and the "Open in default app"
  button render. Clicking the button calls `openPath` with the path.
- A stale resolve: start load A, change revision to start load B, resolve A
  after B -> the canvases reflect B's page count only.

## Invariants

- The props contract and the `WorkspaceDocumentColumn.tsx` call site are
  unchanged.
- Reload happens on any change of revision or `localResourceGeneration`.
- Non-PDF CSS is unchanged except for removing the PDF selector from the
  shared list.

## Verification (scoped to this plan)

Run each command in the foreground and record its exit status and log location
in the progress log:

1. `bunx vitest run --config vitest.config.ts src/features/preview/PdfFilePreviewPane.vitest.tsx`
   -> exit 0.
2. `bun run typecheck` -> must report no errors in this plan's files.

   Sibling-noise rule: the wave-2 sibling `pdf-video-zoom` edits
   `src/features/preview/MediaFilePreviewPane.tsx` and
   `src/features/preview/MediaFilePreviewPane.vitest.tsx` concurrently. If
   typecheck reports errors located only in those files, record them in the
   progress log as sibling noise; they are not a failure of this plan. Confirm
   this plan's own files are clean with
   `bunx tsc --noEmit 2>&1 | grep -E "src/features/preview/PdfFilePreviewPane"`,
   which must print nothing. Never edit the sibling's files. The authoritative
   workspace-wide typecheck is `pdf-shortcuts-finalize` Final verification
   step 1.
3. `bunx biome check src/features/preview/PdfFilePreviewPane.tsx src/features/preview/PdfFilePreviewPane.vitest.tsx src/app/App.css --diagnostic-level=warn`
   -> exit 0.
4. `grep -rn -e "preview-pdf-frame" -e "preview--embedded-pdf" src` -> no
   matches (exit 1 is expected and correct).

## Done criteria

- [x] No `<iframe>` in `PdfFilePreviewPane.tsx`. It imports only from
  `./pdfjs`, never from `pdfjs-dist`.
- [x] All listed test cases are present and pass.
- [x] The stale PDF iframe CSS is removed, and the new PDF canvas CSS is
  present.
- [x] All verification commands produce the stated results. The progress log
  is updated.

## Concurrency and drift rules

- Before each edit, read the target file fresh. Record pre- and post-edit
  `shasum -a 256` of each owned file in the progress log.
- `App.css` is owned only by this plan. `pdf-video-zoom` uses inline styles
  and must not edit it.
- On unexpected drift, stop, log it, and leave the repair for the serial join.
  No git operations.

## Amendment 2026-11-04 (session-710 continuation)

The implementation from session 708 is in the working tree, uncommitted and
only partly reviewed. Keep it. Do not revert it or reimplement it.

- Scope: re-verify only. Edit a file only to fix a defect that a scoped check
  or the Opus review of this plan finds, and only inside this plan's
  `writePaths`. Add no new features and do no refactoring.
- Design note: the Worker Contract now accepts a shared
  `PDFWorker({ port })` passed as the `worker` option
  (`design-docs/specs/design-pdf-inline-rendering.md#worker-contract`). The
  pane still imports only `./pdfjs`.
- Known accepted deviation: the error state's "Open in default app" button is
  the only focusable element, and it exists only when a load fails. The
  ready and loading states must contain no focusable element and no iframe.
- Verification: run in the foreground, logging to
  `tmp/pdf-inline-rendering-20261104-02/pdf-canvas-pane/`.
  1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/PdfFilePreviewPane.vitest.tsx`
     -> exit 0. The log must cover every test case listed in this plan's
     "Test cases to add" section.
  2. `bunx biome check src/features/preview/PdfFilePreviewPane.tsx src/features/preview/PdfFilePreviewPane.vitest.tsx src/app/App.css --diagnostic-level=warn`
     -> exit 0.
  3. `grep -rn -e 'preview-pdf-frame' -e 'preview--embedded-pdf' -e '<iframe' src/features/preview/PdfFilePreviewPane.tsx src/app/App.css`
     -> no matches (exit 1).
  4. `grep -n "pdfjs-dist" src/features/preview/PdfFilePreviewPane.tsx`
     -> no matches (exit 1).
- Done when all four results hold and the hashes are recorded. Then set
  **Status** to `Completed`.

## Progress Log

### Session: 2026-11-04
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Wave 2. Runs in parallel with `pdf-video-zoom` (disjoint files).

### Session: 2026-11-04 — implementation
**Tasks Completed**: Canvas PDF pane, shared zoom input, guarded reload and render cancellation, error recovery, CSS, and scoped tests.
**Tasks In Progress**: Formal reviews and serial integration belong to downstream workflow steps.
**Blockers**: None.
**Notes**: The ready/loading pane has no focusable elements; the detailed plan explicitly requires a focusable error-only recovery button despite the dispatch's unqualified no-focusable-elements wording. Synchronous worker construction failure and rapid render cancellation have regression coverage.

Final verification (all exit 0): `BUN_INSTALL_CACHE_DIR=/tmp/chilla-pdf-canvas-bun-cache TMPDIR=/tmp bunx vitest run --config vitest.config.ts src/features/preview/PdfFilePreviewPane.vitest.tsx` (5/5; `tmp/pdf-inline-rendering-20261104-01/pdf-canvas-pane/check-agent-final-vitest.log`); `BUN_INSTALL_CACHE_DIR=/tmp/chilla-pdf-canvas-bun-cache TMPDIR=/tmp bun run typecheck` (`check-agent-final-typecheck.log`); `! bunx tsc --noEmit 2>&1 | grep -E 'src/features/preview/PdfFilePreviewPane'` (`check-agent-final-scoped-tsc.log`); `BUN_INSTALL_CACHE_DIR=/tmp/chilla-pdf-canvas-bun-cache TMPDIR=/tmp bunx biome check src/features/preview/PdfFilePreviewPane.tsx src/features/preview/PdfFilePreviewPane.vitest.tsx src/app/App.css --diagnostic-level=warn` (`check-agent-final-biome.log`); `! grep -rn -e 'preview-pdf-frame' -e 'preview--embedded-pdf' src` (`check-agent-final-stale.log`). All abbreviated log paths are under `tmp/pdf-inline-rendering-20261104-01/pdf-canvas-pane/`.

SHA-256 pre -> final: source `758ea2f137639859bf66affb9e037f61e6a87c3fbcef7f7ab6064b36a397c611` -> `d7a8d1b3288948b9ebc75c7ddd8c0200a522e0da7568de6602890bb0e2a27b1c`; tests `677da5bae18e1fc9fd42b0395e95dbcd3692898e08929ecc1167534be658ccfc` -> `45fc7bb225a61c494718710d5dbf310cfca1958f8c585c1640511df336555b8b`; CSS `cf4dd40b960b76005e802e97b888a5df7e7df24ff3b15bcfcc43385c755892aa` -> `8e909e96dd772186cdce07cc58c207a8c3ed1b1413791955789109aac183ef5a`. Plan pre-edit hash: `2c30afcec6da4ac477333850798de48ac869eef1cea2bc81acc686150c49673a`; post-edit hash is recorded in `tmp/pdf-inline-rendering-20261104-01/pdf-canvas-pane/plan-post.sha`. Per-edit snapshots and intentions are in the same evidence directory.

### Session: 2026-11-04 — continuation verification
**Tasks Completed**: Re-verified the existing canvas implementation and strengthened assertions for every page's zoom rerender, independent minus and editable-target behavior, and unchanged plain-wheel zoom. All listed test cases pass.
**Blockers**: None. Formal reviews, integration verification, and plan archiving remain downstream.
**Evidence**: Node v22.23.4; scoped Vitest 5/5, Biome, typecheck, and both absence checks exited 0. Complete logs and pre/post hashes are under `tmp/pdf-inline-rendering-20261104-02/pdf-canvas-pane/`. Source hashes: pane `d7a8d1b3288948b9ebc75c7ddd8c0200a522e0da7568de6602890bb0e2a27b1c`, tests `9b7fed3174e6070d01ac26d025260e08933cf48d82368466b8ddd13db7b88364`, CSS `8e909e96dd772186cdce07cc58c207a8c3ed1b1413791955789109aac183ef5a`. These checks ran on the shared working tree.

### Session: 2026-11-04 — preview pan and zoom finalization

PART A review found no material defect. The earlier Alt+wheel behavior is superseded by the preview pan and zoom plans. Runtime evidence: `tmp/pdf-inline-rendering-20261104-02/pdf-shortcuts-finalize/runtime-observed/RUNTIME-EVIDENCE.md`. Current gate evidence is recorded under `tmp/preview-pan-zoom/preview-pan-zoom-finalize/`; see the finalize plan for outcomes and any outstanding checks. Formal integration review and archiving remain downstream.

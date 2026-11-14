# In-App PDF Rendering And Modifier-Wheel Preview Zoom

## Overview

PDF previews currently load the file into an `<iframe>` that shows the WebKit
built-in PDF viewer (`src/features/preview/PdfFilePreviewPane.tsx`). The frame
takes keyboard focus, so key events never reach the main document. The app
keymap (`KeymapProvider`, `WorkspaceShell`, `workspaceShortcuts`) and the
window-level `+`/`-` zoom handler therefore do not run while a PDF is open.

This design replaces the iframe with pdf.js (`pdfjs-dist`), which renders PDF
pages onto canvases inside the normal preview scroll container. Keyboard events
then stay in the main document. It also extends the shared preview zoom gesture
from `Ctrl`+wheel to `Alt` (Option)+wheel and applies it to every visual preview
type.

Baseline: `design-docs/specs/architecture.md` sections "Shared Rendered Preview
Zoom" and "Revision-Aware Local Refresh". This document supersedes the parts of
those sections that keep PDF in an embedded viewer.

## Goals

- With a PDF open, these shortcuts behave exactly as they do for other previews:
  `Shift+L` (`L`, sidebar toggle), `Cmd+O` / `Ctrl+O` (open files), `+` / `-`
  (zoom), `r` (refresh), `Shift+D` (`D`, theme toggle), `j` / `k` (scroll the
  document, or move the selection when the file list has focus), `Enter` (open
  the selected entry), and `q` (quit).
- `Alt`+wheel and `Ctrl`+wheel (which includes the macOS trackpad pinch, sent as
  `ctrlKey` wheel events) zoom Markdown/rendered, image, video, and PDF
  previews. Wheel up zooms in. (Superseded for the wheel rule: `Alt`+wheel no
  longer zooms; see "Shared Preview Pan And Zoom Gestures" in
  `architecture.md`.)
- A PDF still reloads on explicit refresh and on a change of `revision` or
  `localResourceGeneration`.

## Non-Goals

- Text layer, text selection, in-PDF links, outline, forms, annotations editing,
  search, and printing. Pages are rendered to canvas only.
- PDF scripting (always disabled).
- Persisted zoom, or zoom shared across panes or windows. Each pane keeps its
  own zoom state, as it does today.
- Any change to keymap bindings or `keymap.toml` semantics.

## Components And Boundaries

All work is in the Solid.js frontend. The only Rust-side change is one CSP
directive in `src-tauri/tauri.conf.json`. There are no new Tauri commands, and
the `FilePreview` payload is unchanged.

### Dependency

- `pdfjs-dist` is added to `dependencies` in `package.json`, pinned to an exact
  version with no `^` or `~`. Use the latest stable release on the day of
  implementation and record that version in the implementation plan's progress
  log. `bun.lock` must contain its integrity hash.
- Use the legacy build entry points: `pdfjs-dist/legacy/build/pdf.mjs` and
  `pdfjs-dist/legacy/build/pdf.worker.min.mjs`. The legacy build is transpiled
  for older engines, so it does not depend on the WebKit version of the oldest
  supported macOS WKWebView or Linux WebKitGTK, nor on Vite's default
  `build.target`.
- No install/postinstall lifecycle script may be trusted for this package. It
  must not be added to `trustedDependencies`.
- A new module, `src/features/preview/pdfjs.ts`, is the only importer of
  `pdfjs-dist`. It owns the worker, the CMap and font resource URLs, and the
  fixed `getDocument` options. It is also the module boundary that vitest
  mocks.

### Worker Contract

Packaged builds run on the `tauri://localhost` origin. pdf.js does not treat
that origin as same-origin when given a `workerSrc` URL. In that case it wraps
the worker in a `blob:` URL. The CSP blocks `blob:` workers, so pdf.js would
silently fall back to a fake worker and parse PDFs on the UI thread.
`workerSrc` is therefore not used.

- `pdfjs.ts` imports the worker as
  `pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker`. Vite emits this as a
  separate same-origin asset (`/assets/pdf.worker-<hash>.js`), not as an
  inline or `blob:` worker. `vite.config.ts` sets `worker.format: "es"`.
- On the first PDF load, `pdfjs.ts` constructs one dedicated `Worker` and
  passes it to pdf.js as an explicit port. Either form is acceptable:
  `GlobalWorkerOptions.workerPort`, or one shared `new PDFWorker({ port })`
  passed as the `worker` option to every `getDocument` call. The
  implementation uses the second form. pdf.js uses an explicit port as-is: it
  skips the same-origin check, the blob wrapper and the fake-worker fallback.
- Ownership: the worker is a module-level singleton that lives for the life
  of the webview. Destroying a document (`loadingTask.destroy()`) releases
  per-document state in the worker but does not terminate the shared port.
  The worker is never terminated explicitly. It ends with the window.
- Failure: if `Worker` construction throws, or the worker raises `error`
  before the document loads, the pane shows the load-error state. There is no
  fallback to main-thread parsing. A failed worker is discarded, so the next
  load creates a new one.
- CSP: the worker URL is on the app origin, so with `worker-src` unset the
  `script-src 'self'` fallback applies. If the packaged debug launch shows a
  worker CSP violation, the only permitted change is a `worker-src` directive
  listing `'self'` plus the exact app origin reported in the violation. No
  `blob:`, no wildcard, and no `'unsafe-eval'` may be added. Record that
  change in the plan's progress log.
- Runtime evidence for a real worker (debug build, Web Inspector console):
  - `globalThis.pdfjsWorker === undefined` after a PDF has rendered. The fake
    worker would define this by loading the worker module on the main thread.
  - The Sources/Workers panel lists the `pdf.worker-*.js` worker.
  - No CSP violation is logged.

### Runtime Resources: CMaps, Standard Fonts, Image Decoders

pdf.js loads three kinds of resource at runtime, and only when a PDF needs them:

- predefined Adobe CMaps (`cmaps/*.bcmap`);
- standard font data (`standard_fonts/`);
- image decoders in `wasm/`. The decoder of interest is OpenJPEG for
  `/JPXDecode` (JPEG2000) images. The directory holds both `openjpeg.wasm` and
  its JavaScript fallback, `openjpeg_nowasm_fallback.js`.

Without these URLs, a document can load successfully yet show missing text
(CID-keyed or non-embedded standard fonts) or missing images (JPEG2000).
Leaving `wasmUrl` unset does not select a JavaScript decoder. The JavaScript
fallback is itself loaded from the `wasmUrl` directory.

- Resources come from the installed, exact-pinned `pdfjs-dist` package. There
  is no CDN and no committed copy, so they always match the pinned API and
  worker version.
- `vite.config.ts` gains a small inline plugin, `pdfjsResources`, with no new
  dependency. It covers `node_modules/pdfjs-dist/cmaps/`, `standard_fonts/` and
  `wasm/`:
  - in dev it serves them at `/pdfjs/cmaps/`, `/pdfjs/standard_fonts/` and
    `/pdfjs/wasm/`;
  - on build it copies them into `dist/pdfjs/`.
- `pdfjs.ts` resolves the directories to absolute URLs against
  `window.location.href`. It passes these options to every `getDocument`
  call:
  - `cMapUrl` (ending `/pdfjs/cmaps/`) and `cMapPacked: true`;
  - `standardFontDataUrl` (ending `/pdfjs/standard_fonts/`);
  - `wasmUrl` (ending `/pdfjs/wasm/`) and `useWasm: false`.
- With `useWasm: false`, pdf.js loads `openjpeg_nowasm_fallback.js` (a
  JavaScript module on the app origin) from `wasmUrl`, under
  `script-src 'self'`. No WebAssembly is compiled. The CSP therefore stays
  without `'wasm-unsafe-eval'`, and `script-src` is unchanged.
- Version check at implementation: confirm that the selected `pdfjs-dist`
  version supports `wasmUrl` and `useWasm` and ships
  `wasm/openjpeg_nowasm_fallback.js`. If the selected version names these
  differently, use its documented equivalent and record it in the plan's
  progress log. Whatever the name, the requirements are the same: local
  directory, JavaScript decoder, and no CSP change.
- Resource fetches and the decoder import go to the app origin, which
  `connect-src 'self'` and `script-src 'self'` already allow.

### Byte Loading And CSP

- pdf.js loads the document with `getDocument({ url })`. The URL is the same
  revision-bearing asset URL the iframe uses today:
  `convertFileSrc(path)` plus the `revision` query parameter, plus
  `chilla_refresh=<generation>` when `localResourceGeneration > 0`. Because the
  URL changes with the revision, WebView caching cannot serve stale bytes.
- pdf.js fetches that URL, so `connect-src` in the `src-tauri/tauri.conf.json`
  CSP gains exactly `asset: http://asset.localhost`. Those origins are already
  allowed in `default-src`, `img-src`, `media-src`, and `frame-src`, and the
  asset protocol scope is unchanged. Nothing else in the CSP changes.
- `worker-src` stays unset unless the Worker Contract's runtime check
  requires the bounded exception described there.
- Bytes are not read through IPC. No existing command returns raw file bytes,
  and adding one would add Rust surface for no benefit over the asset protocol.
- `frame-src asset:` stays because the HTML rendered preview still uses it.

### Security Options

Every `getDocument` call passes `isEvalSupported: false` and
`enableXfa: false`. Scripting stays disabled (the pdf.js scripting sandbox is
never loaded), and no annotation layer is rendered. The document is rendered
only as canvas pixels in the main document. Untrusted PDF content therefore
cannot execute script or create DOM.

### `PdfFilePreviewPane`

- Props are unchanged: `path`, `fileName`, `revision`, and
  `localResourceGeneration`.
- Markup follows the shared contract:
  `<section class="pane">`, then a `PreviewHeader` showing the `PDF` label, the
  page count when known, and the zoom percentage (`preview__zoom`,
  `aria-live="polite"`), then `<div class="pane__body preview preview--pdf">`
  containing one `<canvas class="preview-pdf-page">` per page, stacked
  vertically. `.pane__body` is the scroll container, so the existing
  `scrollActiveDocumentPane` / `nudgeActiveDocumentPane`
  (`activeDocumentNavigation.ts`) give `j`/`k`/`Ctrl+D`/`Ctrl+U` without any
  new wiring.
- The pane contains no focusable element and no iframe, and it never calls
  `focus()`. Keyboard shortcuts are therefore handled by the existing
  window-level and keymap handlers.
- Load lifecycle: an effect keyed on the asset URL (path, revision, and
  generation) does the following:
  1. It cancels the previous loading task and every in-flight render task, and
     destroys the previous document.
  2. It starts `getDocument`.
  3. On success, it renders every page.
  4. On failure, it shows an inline error message plus an "Open in default
     app" button (`openPath`, the same as the media pane fallback).

  A load-generation counter discards results from superseded loads. Unmount
  cancels and destroys in the same way.
- Rendering: each page renders at
  `viewportScale = zoom / 100 * devicePixelRatio`. The canvas CSS size is
  `zoom / 100` times the page's 1.0-scale CSS size, so text stays sharp at every
  zoom level instead of being CSS-scaled. When zoom changes, each page is
  re-rendered and its in-flight render task is cancelled first. A rejection
  from a cancelled render is ignored. Pages render sequentially, in page order.
  Eager rendering of all pages is accepted: lazy rendering is out of scope (see
  Risks).
- The zoom model reuses `nextPreviewZoom` from `PreviewPane.tsx`: 10-point
  steps from 100%, clamped to 50-300%. Zoom resets to 100% when the pane is
  remounted. A revision or generation refresh keeps the current zoom.

### Shared Zoom Input Contract

The following applies to `PreviewPane` (Markdown, text/source, image, and other
rendered previews), the video branch of `MediaFilePreviewPane`, and
`PdfFilePreviewPane`.

- Keyboard: the existing `PreviewPane` rule applies. `+` / `-` with no
  Ctrl/Meta/Alt and an event target that is not editable zoom by one step, and
  the event is `preventDefault`ed. PDF and video panes register the same
  window `keydown` rule while visible.
- Superseded: the wheel bullet below and the `previewZoomDirectionFromWheel`
  bullet are replaced by "Shared Preview Pan And Zoom Gestures" in
  `design-docs/specs/architecture.md` (smooth `Ctrl`/`Cmd`+wheel zoom about the
  pointer, no `Alt`+wheel zoom, PDF CSS resize plus debounced re-render). They
  are kept only as the record of the PART A behavior.
- Wheel: a non-passive `wheel` listener on the pane's `.pane__body` handles the
  event when `event.altKey || event.ctrlKey` and `deltaY !== 0`. It calls
  `preventDefault()` (this suppresses both the page scroll and native WebView
  page zoom) and zooms one step: in when `deltaY < 0`, out when `deltaY > 0`.
  Each wheel event is one step, which matches the current `Ctrl`+wheel
  behavior. Without a modifier the listener returns without
  `preventDefault()`, so ordinary scrolling and trackpad scrolling are
  untouched.
- The predicate lives in one exported helper in `PreviewPane.tsx`
  (`previewZoomDirectionFromWheel(event): "in" | "out" | null`), next to
  `nextPreviewZoom`. All three panes use it, so the wheel rule cannot diverge
  between them.
- Video: `MediaFilePreviewPane` gains a zoom signal used only when
  `kind === "video"`. It is applied as a CSS scale of the
  `.preview-media--video` figure (50-300%). The header shows the percentage. An
  oversized video scrolls inside `.pane__body`. Audio has no visual content and
  is not a zoom target, so an audio pane registers no zoom handlers. The
  existing Space and seek handling are unchanged. See
  `design-docs/user-qa/qa-pdf-inline-rendering.md`.
- EPUB, CSV formatted/raw editors, the raw Markdown editor, the HTML rendered
  iframe preview, and diff views remain non-targets, as before.

### Styling (`src/app/App.css`)

- Remove the `.preview--embedded-pdf` and `.preview-pdf-frame` rules, including
  the `:has(.preview-pdf-frame)` column rule.
- Add `.preview--pdf` (a normal scrolling `pane__body`) and `.preview-pdf-page`
  (block display, centered, a gap between pages, a page background that stays
  white under both themes). Add the PDF error-state style.

### Documentation

- In the `README.md` keyboard section, replace the `Ctrl+mouse wheel` line with
  `Alt (Option)+mouse wheel` / `Ctrl+mouse wheel` (including trackpad pinch):
  preview zoom for Markdown/rendered, image, video, and PDF previews. Change the
  `+` / `-` line to state that it also applies to PDF and video. Change the
  feature line `PDF: embedded iframe preview` to describe in-app pdf.js canvas
  rendering.

## Data Flow

1. `WorkspaceDocumentColumn` mounts `PdfFilePreviewPane` with path, revision,
   and generation. This is unchanged.
2. The pane builds the revision-bearing asset URL, then calls `getDocument`.
   pdf.js fetches the bytes through `connect-src asset:` and parses them in
   the dedicated worker. Any CMap, standard font or JPX decoder resources it needs are loaded
   from `/pdfjs/` on the app origin.
3. Pages render to canvases at the current zoom.
4. On `r`, the workspace refresh advances `localResourceGeneration`, and a
   changed file advances `revision`. Either change produces a new URL, which
   triggers cancel, destroy, and reload.
5. `+`/`-` or a modifier-wheel event updates the zoom signal, which re-renders
   all pages at the new scale.

## Verification

- Vitest (`PdfFilePreviewPane.vitest.tsx`): mock `./pdfjs` at the module
  boundary. Do not run real pdf.js under jsdom. The tests must assert the
  following:
  - The asset URL passed to `getDocument` includes the revision and refresh
    parameters.
  - `isEvalSupported: false` and `enableXfa: false` are passed.
  - `cMapUrl` ends with `/pdfjs/cmaps/`, `cMapPacked` is `true`, and
    `standardFontDataUrl` ends with `/pdfjs/standard_fonts/`, `wasmUrl` ends
    with `/pdfjs/wasm/`, and `useWasm` is `false`. These can be
    asserted in `PdfFilePreviewPane.vitest.tsx` or in a `pdfjs.vitest.ts` that
    mocks `pdfjs-dist` and the `?worker` import.
  - A revision or generation change destroys the old document and loads the
    new URL.
  - Unmount destroys the document.
  - One canvas per page is rendered.
  - The pane contains no iframe and no focusable element.
  - `+` / `-` and Alt+wheel / Ctrl+wheel change the zoom percentage and
    re-render at the new scale.
  - A plain wheel event is not `preventDefault`ed.
  - Load failure shows the error state.
- `PreviewPane.vitest.tsx`: Alt+wheel zooms in and out, Ctrl+wheel still works,
  a plain wheel event is not prevented, and both clamps still hold.
- `MediaFilePreviewPane.vitest.tsx`: video zoom works with `+`/`-` and
  Alt/Ctrl+wheel. Audio registers no zoom. Space and seek behavior are
  unchanged.
- `WorkspaceShell.vitest.tsx`: with a PDF preview open, `L`, `Cmd+O`, `r`,
  `D`, `j`/`k` (both document scroll and file-list selection when the list has
  focus), `Enter`, and `q` dispatch the same actions as with a Markdown
  preview. `KeymapProvider.vitest.tsx` needs a change only if a PDF-specific
  guard turns out to be required. No such guard is planned.
- Required commands. `mise run check` alone is not sufficient: it runs only
  typecheck and cargo check. `bun run test` does not run `*.vitest.tsx` files.
  Run each of these in the foreground, from the repository root:
  1. `bun run typecheck`
  2. `bun run test`
  3. `bun run test:dom`. This runs the PDF, PreviewPane, MediaFilePreviewPane,
     WorkspaceShell and KeymapProvider vitest suites listed above.
  4. `bun run lint:biome`
  5. `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml`.
     This is required because `src-tauri/tauri.conf.json` changes.
  6. `bun run build`, then confirm that `dist/pdfjs/cmaps/` contains `.bcmap`
     files, `dist/pdfjs/standard_fonts/` is non-empty,
     `dist/pdfjs/wasm/openjpeg_nowasm_fallback.js` exists, and `dist/assets/`
     contains a `pdf.worker-*` asset.

  For every command, record the exit status and the complete log path. A
  failure that already exists on the base commit must be recorded separately,
  not hidden.
- Packaged runtime check. Run
  `CARGO_TERM_QUIET=true bun run tauri build --debug --no-bundle`, then launch
  `./target/debug/chilla <pdf>` (`chilla-post-edit-launch` skill) as an owned
  foreground process. Use three fixtures. The two generated fixtures are
  created at verification time in a fresh temporary directory outside the
  repository and are never committed. Any generator script lives in a separate
  temporary directory. Record the generator commands and fixture paths.
  - A plain sample PDF.
  - A CMap-dependent PDF. It uses a Type0 font with a predefined CMap encoding
    (for example `/90ms-RKSJ-H`) and an `Adobe-Japan1` CIDFont, so rendering
    requires fetching a `.bcmap`.
  - A JPXDecode PDF. Create a high-contrast test image as a JPEG2000 file
    (for example `sips -s format jp2`), then embed it as a page-sized image
    XObject with `/Filter /JPXDecode` in a minimal hand-built PDF.

  Pass criteria:
  - Pages render, the CMap fixture's text is visible, and the JPX fixture's
    image is visible (not a blank page).
  - The real-worker evidence from the Worker Contract is present.
  - The console shows no CSP violation, no "fake worker" warning, no CMap load
    error and no OpenJPEG/JPX decoder load error.
  - The shortcuts listed under Goals respond.
  - The app exits cleanly on `q`.

  Keep the complete launch log and the exit status.

## Risks

- Supply chain: a new third-party dependency. This is mitigated by the exact
  pin, the lockfile integrity hash, no trusted lifecycle scripts, and worker
  and resource assets served from the app origin.
- Worker CSP on the custom origin: whether the `script-src 'self'` fallback
  admits the bundled worker on `tauri://localhost` (macOS) and on WebKitGTK is
  confirmed only by the packaged runtime check. The Worker Contract defines the
  single bounded exception if it does not.
- CSP widening: `connect-src` now allows the asset protocol, which already has
  the `**` scope for images, media, and frames. With this change, script running
  in the app origin can also `fetch` local files through it.
  The app has no remote script and `script-src 'self'`, so the added exposure
  is small, but this is a real widening.
- Untrusted PDF parsing now runs in the app origin (inside a worker) instead of
  WebKit's isolated viewer. This is mitigated by disabled eval and scripting,
  no XFA, and canvas-only output.
- Large PDFs: eager rendering of every page at high zoom on a high-DPI display
  uses memory linear in pages times scale squared. Accepted for this scope.
  Lazy rendering would be follow-up work if needed.
- Rapid zoom or reload races are handled by render-task cancellation and the
  load-generation guard.

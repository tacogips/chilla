# PDF Inline Rendering: pdf.js Dependency, Worker, Resources and CSP Implementation Plan

**Status**: Ready
**Design Reference**: `design-docs/specs/design-pdf-inline-rendering.md#dependency`, `#worker-contract`, `#runtime-resources-cmaps-standard-fonts-image-decoders`, `#byte-loading-and-csp`, `#security-options`
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

## Dispatch metadata

```json
{
  "planId": "pdf-pdfjs-foundation",
  "planPath": "impl-plans/active/pdf-pdfjs-foundation.md",
  "dependsOn": [],
  "writePaths": [
    "package.json",
    "bun.lock",
    "node_modules",
    "dist",
    "target",
    "vite.config.ts",
    "src/features/preview/pdfjs.ts",
    "src/features/preview/pdfjs.vitest.ts",
    "src-tauri/tauri.conf.json",
    "impl-plans/active/pdf-pdfjs-foundation.md"
  ],
  "artifactRoots": ["node_modules", "dist", "target"],
  "sharedPaths": [],
  "workflowMode": "issue-resolution",
  "progressPath": "impl-plans/active/pdf-pdfjs-foundation.md"
}
```

## Intent and context

PDF previews will be rendered in-app with pdf.js instead of the WebKit iframe
viewer. Key events can then reach the app keymap. This plan adds everything
below the UI:

- the exact-pinned dependency;
- a single owner module `src/features/preview/pdfjs.ts`, which is also the
  mock boundary for every UI test;
- the Vite worker and resource wiring;
- the one CSP change.

`pdf-canvas-pane` consumes the module API pinned below.

## Non-goals

- No UI and no change to `PdfFilePreviewPane.tsx`.
- No text layer, annotation layer, scripting, XFA or WebAssembly.
- No CDN.
- No IPC or Rust code. Only `src-tauri/tauri.conf.json` changes.
- Do not add any `worker-src` directive pre-emptively. The design allows a
  bounded exception only if the packaged runtime check in
  `pdf-shortcuts-finalize` proves it is needed.
- Do not add `trustedDependencies` or any new devDependency (for example, no
  vite-plugin-static-copy).

## File-level changes

### `package.json` and `bun.lock`

- Run `bun add pdfjs-dist@<X.Y.Z> --exact` with the latest stable 5.x release
  on the day of implementation. Check it with `bun pm view pdfjs-dist version`
  or `npm view pdfjs-dist version`.
- `package.json` `dependencies` must show `"pdfjs-dist": "X.Y.Z"`, with no
  `^` or `~`.
- Record these in the progress log:
  - the version;
  - the install command and its exit code;
  - the `bun.lock` integrity line for pdfjs-dist;
  - confirmation that no lifecycle script ran. Bun skips untrusted scripts by
    default; `trustedDependencies` must stay absent.
- Confirm that these paths exist in the installed package and list them in the
  log:
  - `legacy/build/pdf.mjs`
  - `legacy/build/pdf.worker.min.mjs`
  - `cmaps/` (contains `*.bcmap`)
  - `standard_fonts/`
  - `wasm/openjpeg_nowasm_fallback.js`
- In the installed type definitions, confirm that `getDocument` accepts
  `wasmUrl`, `useWasm`, `cMapUrl`, `cMapPacked`, `standardFontDataUrl`,
  `isEvalSupported` and `enableXfa`, and that `GlobalWorkerOptions.workerPort`
  exists. If a name differs, use the documented equivalent and record it (the
  design permits this).

### `src/features/preview/pdfjs.ts` (new; the only importer of `pdfjs-dist`)

Imports:

- `pdfjs-dist/legacy/build/pdf.mjs` for `getDocument` and `GlobalWorkerOptions`;
- `pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker` (default export: the
  Worker constructor; typed by `vite/client`).

Exported contract. Signatures are pinned because `pdf-canvas-pane` mocks them:

```ts
export interface PdfRenderTaskLike { readonly promise: Promise<unknown>; cancel(): void }
export interface PdfViewportLike { readonly width: number; readonly height: number }
export interface PdfPageLike {
  getViewport(params: { scale: number }): PdfViewportLike;
  render(params: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: PdfViewportLike }): PdfRenderTaskLike;
  cleanup(): void;
}
export interface PdfDocumentLike { readonly numPages: number; getPage(pageNumber: number): Promise<PdfPageLike> }
export interface PdfLoadHandle { readonly promise: Promise<PdfDocumentLike>; destroy(): Promise<void> }
export function buildPdfDocumentParams(url: string, baseHref?: string): PdfDocumentParams;
export function loadPdfDocument(url: string): PdfLoadHandle;
```

- `PdfDocumentParams` is a readonly object type with exactly these fields:
  - `url`
  - `isEvalSupported: false`
  - `enableXfa: false`
  - `cMapUrl`
  - `cMapPacked: true`
  - `standardFontDataUrl`
  - `wasmUrl`
  - `useWasm: false`
- `buildPdfDocumentParams` resolves `/pdfjs/cmaps/`, `/pdfjs/standard_fonts/`
  and `/pdfjs/wasm/` with `new URL(path, baseHref ?? window.location.href).href`.
  Each result must end with `/`.
- `loadPdfDocument(url)`:
  1. calls the private `ensurePdfWorker()`;
  2. calls `getDocument(buildPdfDocumentParams(url))`;
  3. returns `{ promise, destroy }`, where `destroy` calls
     `loadingTask.destroy()`.

  The returned promise must also reject if the worker emits `error` before the
  document resolves. Race against a worker-error promise.
- `ensurePdfWorker()` is private:
  - It lazily creates one module-level `Worker` from the `?worker`
    constructor, then sets `GlobalWorkerOptions.workerPort` to it.
  - If construction throws, or the worker emits `error`, it clears the
    singleton and `GlobalWorkerOptions.workerPort`, so the next load creates a
    fresh worker. It rethrows, or the caller's promise rejects.
  - It never terminates a healthy worker.
- Map pdf.js page objects to the `Like` interfaces structurally. Real pdf.js
  objects already satisfy them. Pass `canvas` and `canvasContext` both if the
  selected version's `render` params accept both; follow the installed types.

### `vite.config.ts`

- Add `worker: { format: "es" }` to the returned config.
- Add an inline plugin object named `pdfjsResources`. Use only `node:fs`,
  `node:path` and `node:url`; add no dependency.
  - `configureServer(server)`: register a middleware for request paths under
    `/pdfjs/cmaps/`, `/pdfjs/standard_fonts/` and `/pdfjs/wasm/`. It serves the
    corresponding file from `node_modules/pdfjs-dist/<dir>/`. Strip the query
    string. Return 404 for missing files. Reject any resolved path outside the
    source directory: compare `path.resolve` against the directory prefix, so
    `..` traversal is not served. Set `Content-Type`:
    - `application/octet-stream` for `.bcmap`, `.pfb` and `.ttf`;
    - `text/javascript` for `.js` and `.mjs`;
    - `application/wasm` for `.wasm`.
  - `closeBundle()` (build only): `fs.cpSync` the three directories, with
    `recursive: true`, into `<config.build.outDir>/pdfjs/<dir>`. Capture
    `outDir` in `configResolved`.
  - Locate the package directory from the repository root (the config file
    directory), not from `process.cwd()` assumptions. Keep the existing
    `// @ts-expect-error process` pattern if `process` is referenced.

### `src-tauri/tauri.conf.json`

- In `app.security.csp`, change only the `connect-src` directive, to
  `connect-src 'self' ipc: http://ipc.localhost asset: http://asset.localhost`.
  Every other directive stays byte-identical. Do not add `worker-src`,
  `blob:`, `'wasm-unsafe-eval'` or `'unsafe-eval'`.

### `src/features/preview/pdfjs.vitest.ts` (new)

- `vi.mock("pdfjs-dist/legacy/build/pdf.mjs", ...)` provides a fake
  `getDocument` (records its params and returns a fake loading task with
  `promise`/`destroy`) and a mutable `GlobalWorkerOptions` object.
- `vi.mock("pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker", ...)` returns a
  fake Worker class that extends `EventTarget` and counts constructions. Do not
  load real pdf.js under jsdom.
- Reset modules between tests (`vi.resetModules()` plus dynamic import) so the
  singleton starts fresh.

## Pitfalls

- Do not use `GlobalWorkerOptions.workerSrc` or a `?url` import. On
  `tauri://localhost` they produce a blob-wrapped worker, which the CSP blocks
  and pdf.js then silently replaces with main-thread parsing.
- Do not import `pdfjs-dist` from any other module. The UI mocks `./pdfjs`.
- Omitting `wasmUrl` does not select the JavaScript decoder. Both
  `wasmUrl` and `useWasm: false` are required.
- The dev middleware must not be able to serve arbitrary files. Keep the
  prefix check.
- `bun.lock` and `package.json` are owned only by this plan. Do not run
  `bun install` with different flags afterwards, and do not reformat
  `package.json` beyond the dependency line.

## Test cases to add (`pdfjs.vitest.ts`)

- `buildPdfDocumentParams("asset://x.pdf?revision=1", "tauri://localhost/index.html")`
  -> `cMapUrl === "tauri://localhost/pdfjs/cmaps/"`, `standardFontDataUrl`
  ends with `/pdfjs/standard_fonts/`, `wasmUrl` ends with `/pdfjs/wasm/`,
  `useWasm === false`, `cMapPacked === true`, `isEvalSupported === false`,
  `enableXfa === false`, and `url` is passed through unchanged.
- Two `loadPdfDocument` calls -> exactly one Worker is constructed, and
  `GlobalWorkerOptions.workerPort` is that instance. `workerSrc` is never set.
- `loadPdfDocument(url)` -> fake `getDocument` receives the full params object.
- Calling `destroy()` on the returned handle -> the loading task's `destroy`
  is called. The Worker is not terminated (no `terminate` call).
- The worker dispatches `error` before the document resolves -> the handle
  promise rejects, and the next `loadPdfDocument` constructs a new Worker.
- The Worker constructor throws -> `loadPdfDocument(...).promise` rejects, and
  the next call retries construction.

## Invariants

- The CSP differs from `HEAD` only in `connect-src`. Check with
  `git diff src-tauri/tauri.conf.json`.
- No other dependency versions change. Check that `git diff package.json`
  shows one added line.

## Verification (scoped to this plan)

Run each command in the foreground and record its exit status and log location
in the progress log:

1. `bunx vitest run --config vitest.config.ts src/features/preview/pdfjs.vitest.ts`
   -> exit 0.
2. `bun run typecheck` -> must report no errors in this plan's files. This
   proves the `?worker` import and the pdf.js types resolve.

   Sibling-noise rule: the wave-1 sibling `pdf-zoom-wheel-contract` edits
   `src/features/preview/PreviewPane.tsx` and
   `src/features/preview/PreviewPane.vitest.tsx` concurrently. If typecheck
   reports errors located only in those two files, record them in the progress
   log as sibling noise; they are not a failure of this plan. Confirm this
   plan's own files are clean with
   `bunx tsc --noEmit 2>&1 | grep -E "src/features/preview/pdfjs"`, which must
   print nothing. Never edit the sibling's files.
3. `bunx biome check vite.config.ts src/features/preview/pdfjs.ts src/features/preview/pdfjs.vitest.ts package.json --diagnostic-level=warn`
   -> exit 0.
4. `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml`
   -> exit 0. This proves the edited `tauri.conf.json` is still valid for the
   build script.
5. Resource-copy smoke check. This step is not a gate. The authoritative
   build and dist gate is `pdf-shortcuts-finalize` Final verification step 6
   (`bun run build` plus the dist checks), which runs serially in wave 3.
   - Run `bunx vite build`. It bundles only and skips `tsc`, so sibling type
     errors cannot fail it. If it fails because of an error located only in
     `src/features/preview/PreviewPane.tsx` or
     `src/features/preview/PreviewPane.vitest.tsx`, record it as sibling noise.
   - When it succeeds, record the results of these checks:
     - `ls dist/pdfjs/cmaps | grep -c bcmap` -> greater than 0;
     - `ls dist/pdfjs/standard_fonts | wc -l` -> greater than 0;
     - `test -f dist/pdfjs/wasm/openjpeg_nowasm_fallback.js` -> exit 0.

     A missing resource directory is a defect in this plan's `pdfjsResources`
     plugin and must be fixed here.
   - `ls dist/assets | grep -i "pdf.worker"` may not match yet. No UI imports
     `pdfjs.ts` until wave 2, so tree-shaking may omit the worker. Record the
     result. `pdf-shortcuts-finalize` re-checks it.
6. `grep -n '"pdfjs-dist": "[0-9]' package.json` -> matches (exact pin).

## Done criteria

- [ ] Exact pin is present, and the `bun.lock` integrity entry is recorded.
- [ ] `pdfjs.ts` exports the pinned contract, and its tests pass.
- [ ] The Vite plugin serves the resources in dev and copies them on build.
  The step 5 smoke check shows the three `dist/pdfjs` directories, or any
  sibling-noise failure is logged. Authoritative gate:
  `pdf-shortcuts-finalize` step 6.
- [ ] Steps 1, 3, 4 and 6 exit 0. Step 2 shows no errors in this plan's files,
  with any sibling noise logged.
- [ ] CSP `connect-src` contains `asset: http://asset.localhost`, and nothing else in the CSP changed.
- [ ] Every verification step produces its stated result under the
  sibling-noise rules above. Exit codes are logged.

## Concurrency and drift rules

- Before each edit, read the target file fresh. Record pre- and post-edit
  `shasum -a 256` of each owned source file in the progress log.
- On unexpected drift, stop, log it and leave the repair for the serial join.
- `node_modules` is an artifact root: record its digest/count only, never its
  content. No git operations.

## Progress Log

### Session: 2026-11-04
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Wave 1. `pdf-canvas-pane` depends on the `pdfjs.ts` contract.

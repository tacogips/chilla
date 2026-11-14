# PDF Inline Rendering: pdf.js Dependency, Worker, Resources and CSP Implementation Plan

**Status**: Completed
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

- [x] Exact pin is present, and the `bun.lock` integrity entry is recorded.
- [x] `pdfjs.ts` exports the pinned API, and its tests pass with the caller-owned worker correction recorded below.
- [x] The Vite plugin serves the resources in dev and copies them on build.
  The step 5 smoke check shows the three `dist/pdfjs` directories, or any
  sibling-noise failure is logged. Authoritative gate:
  `pdf-shortcuts-finalize` step 6.
- [x] Steps 1, 3, 4 and 6 exit 0. Step 2 shows no errors in this plan's files,
  with any sibling noise logged.
- [x] CSP `connect-src` contains `asset: http://asset.localhost`, and nothing else in the CSP changed.
- [x] Every verification step produces its stated result under the
  sibling-noise rules above. Exit codes are logged.

## Concurrency and drift rules

- Before each edit, read the target file fresh. Record pre- and post-edit
  `shasum -a 256` of each owned source file in the progress log.
- On unexpected drift, stop, log it and leave the repair for the serial join.
- `node_modules` is an artifact root: record its digest/count only, never its
  content. No git operations.

## Amendment 2026-11-04 (session-710 continuation)

The implementation from session 708 is in the working tree, uncommitted and
only partly reviewed. That includes the PDF-INT-001 shared-`PDFWorker`
repair. Keep it. Do not revert it or reimplement it.

- Scope: re-verify only. Edit a file only to fix a defect that a scoped check
  or the Opus review of this plan finds, and only inside this plan's
  `writePaths`. Do not re-run `bun add`, and do not change the pin.
- Design alignment: the Worker Contract now names the shared
  `PDFWorker({ port })` plus the `worker` option as an accepted form
  (`design-docs/specs/design-pdf-inline-rendering.md#worker-contract`). No
  code change is needed for this.
- Verification: run in the foreground, logging to
  `tmp/pdf-inline-rendering-20261104-02/pdf-pdfjs-foundation/`.
  1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/pdfjs.vitest.ts`
     -> exit 0. The log must cover:
     - the resource URLs;
     - `useWasm: false`;
     - `enableXfa: false`;
     - shared-worker reuse across loads;
     - worker reset after an error or a construction failure.
  2. `bunx biome check vite.config.ts src/features/preview/pdfjs.ts src/features/preview/pdfjs.vitest.ts package.json --diagnostic-level=warn`
     -> exit 0.
  3. `grep -n '"pdfjs-dist": "5.7.284"' package.json` -> one match.
     `grep -c trustedDependencies package.json` -> `0`.
     `grep -n 'pdfjs-dist@5.7.284' bun.lock` -> matches, and the integrity
     value equals the one recorded below.
  4. `git diff -U0 99954ab -- src-tauri/tauri.conf.json` -> the only change is
     `connect-src` gaining `asset: http://asset.localhost`.
  5. `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml`
     -> exit 0.
- Done when all five results hold and the hashes are recorded. Then set
  **Status** to `Completed`.

## Progress Log

### Session: 2026-11-04
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Wave 1. `pdf-canvas-pane` depends on the `pdfjs.ts` contract.

### Session: 2026-11-04 — foundation implementation
**Tasks Completed**: Exact pdfjs-dist pin, worker contract, Vite resources, CSP connect-src and focused tests. Formal reviews and downstream canvas integration remain pending.
**Blockers**: None.
**Notes**: `npm view pdfjs-dist@5 version` returned latest 5.x 5.7.284; `bun add pdfjs-dist@5.7.284 --exact` exited 0 (`install.log`). No lifecycle script ran; no trustedDependencies. Lock integrity: `sha512-h4EdYQczmGhbOlqc3PPZwxevn7ApdWPbovAuWXOB/DjIyigSnwfy2oze7c6mRcSr9XgLp3eN3EeL4DyySTPMFw==`. Installed legacy build and worker, cmaps, standard_fonts and wasm/openjpeg_nowasm_fallback.js confirmed. Installed types expose wasmUrl, useWasm, cMapUrl, cMapPacked, standardFontDataUrl, enableXfa and workerPort. Version 5.7.284 removed isEvalSupported from the published API; the fixed false property is still passed for the pinned interface, and a search of the legacy build found no JavaScript eval or dynamic Function constructor.

Evidence directory: `tmp/pdf-inline-rendering-20261104-01/pdf-pdfjs-foundation/`. Pre-edit contents and hashes, intended edits, and post-edit hashes are recorded there (`install-pre.sha`, `*.before`, `*.intent`, `*.pre.sha`, `*.post.sha`, `post.sha`). Node modules path digest and file count are recorded in `node-modules-paths.sha` and `node-modules-count.txt`.

Verification in the shared moving tree (all exit 0): `bunx vitest run --config vitest.config.ts src/features/preview/pdfjs.vitest.ts` (4 tests, `vitest.log`); `bun run typecheck` (`typecheck.log`); `! bunx tsc --noEmit 2>&1 | grep -E "src/features/preview/pdfjs"` (`tsc-scoped.log`); `bunx biome check vite.config.ts src/features/preview/pdfjs.ts src/features/preview/pdfjs.vitest.ts package.json --diagnostic-level=warn` (`biome.log`); `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml` (`cargo.log`); `bunx vite build` (`vite-build.log`); `grep -n '\"pdfjs-dist\": \"[0-9]' package.json` (`pin.log`). Smoke: 168 bcmap files (`cmaps.log`), 16 standard fonts (`fonts.log`), fallback present (`wasm.log`). `ls dist/assets | grep -i pdf.worker` exited 1 (`worker-asset.log`): expected before downstream imports. Serial final build and packaged runtime verification remain owned by pdf-shortcuts-finalize. CSP diff changes only connect-src; package manifest diff adds only the dependency.

### Self-check finding: shared PDFWorker lifetime
**Blocker**: pdf.js 5.7.284 caches its `PDFWorker` wrapper by port (`node_modules/pdfjs-dist/legacy/build/pdf.mjs`, `PDFWorker.create`) and `PDFDocumentLoadingTask.destroy()` destroys that wrapper. Thus one document can invalidate another, and a replacement load can encounter a pending destroy. The pinned plan requires `getDocument(buildPdfDocumentParams(url))` with exactly the prescribed parameter object; avoiding this defect requires either passing a separately owned shared `PDFWorker` in an additional `worker` option or revising worker/lifecycle ownership. Clarify and approve the contract change before correcting and testing this behavior. The existing focused tests mock pdf.js and do not establish shared-wrapper behavior.

Searches `eval-search.log` and `eval-option-search.log` found no `eval(` or `new Function(` expressions in the legacy main and worker modules and no `isEvalSupported` option in those modules or published types. This is source inspection, not proof of every possible dynamic execution path.


### Session: 2026-11-04 — integration review repair PDF-INT-001
**Tasks Completed**: Resolved the shared-worker lifecycle blocker. This review-directed correction supersedes the workerPort assignment and exact getDocument invocation above while preserving the exported API and resource parameters. One dedicated Worker and one caller-owned PDFWorker are reused; getDocument receives the wrapper explicitly. Destroying a document leaves the wrapper and port intact; a worker error or construction failure resets and cleans up both.

**Evidence and rationale**: In pdf.js 5.7.284 `legacy/build/pdf.mjs` lines 21510 and 21558–21563 distinguish a supplied worker from the cached port-created wrapper; lines 21659–21675 destroy task-owned workers and lines 22459–22477 remove and reject a pending-destroy wrapper. Explicit caller ownership avoids the reload race while retaining the dedicated port, without blob URLs or fake-worker fallback. The constructor's generated TypeScript declaration incorrectly limits port to null, so the local constructor type assertion reflects its runtime Worker support. The previous blocker is resolved.

**Verification**: On the shared moving tree, `bunx vitest run --config vitest.config.ts src/features/preview/pdfjs.vitest.ts` passed 5 tests, `bun run typecheck` passed, scoped tsc passed, and the plan's Biome check passed; complete logs are in `tmp/pdf-inline-rendering-20261104-01/pdf-pdfjs-foundation/repair-01/` as `vitest-final.log`, `typecheck-final.log`, `tsc-final.log`, and `biome-final.log`. The earlier cargo check and resource smoke evidence above remain applicable to unchanged CSP and plugin inputs. Pre-edit snapshots and intended hunks are under `repair-01/`, including `ts-agent/`.

**Security note**: `isEvalSupported: false` is retained for the contract but is not read by pdf.js 5.7.284; unchanged CSP `script-src 'self'` excludes unsafe-eval. Formal reviews and serial integration verification remain downstream.


### Session: 2026-11-04 — session-710 foundation re-verification
**Tasks Completed**: Re-verified the existing foundation against the amended plan and accepted shared `PDFWorker({ port })` design; no source repairs were needed. Node version: v22.23.4.

**Verification**: Evidence in `tmp/pdf-inline-rendering-20261104-02/pdf-pdfjs-foundation/`: `vitest.log` (exit 0, 5 tests), `biome.log` (exit 0), `pin.log` (exit 0), `trusted-final.log` (exit 0, no trustedDependencies), `lock.log` (exit 0, integrity unchanged), `csp-final.log` (exit 0, only the two asset origins added to connect-src), and `cargo.log` (exit 0). All checks ran in the foreground on the shared moving tree; final serial verification remains downstream. The complete commands are those in the amendment; Node-based commands used `mise exec -- env PATH="$(mise where node)/bin:$PATH"`. Pre-edit source hashes are in `pre-edit.sha`; this session changed only this plan. Formal reviews, integration verification, archiving and commit remain downstream.

### Session: 2026-11-04 — preview pan and zoom finalization

PART A review found no material defect. The earlier Alt+wheel behavior is superseded by the preview pan and zoom plans. Runtime evidence: `tmp/pdf-inline-rendering-20261104-02/pdf-shortcuts-finalize/runtime-observed/RUNTIME-EVIDENCE.md`. Current gate evidence is recorded under `tmp/preview-pan-zoom/preview-pan-zoom-finalize/`; see the finalize plan for outcomes and any outstanding checks. Formal integration review and archiving remain downstream.

# PDF Inline Rendering: Workspace Shortcut Coverage, Docs and Final Verification Implementation Plan

**Status**: Ready
**Design Reference**: `design-docs/specs/design-pdf-inline-rendering.md#goals`, `#documentation`, `#verification`, `#worker-contract`
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

## Dispatch metadata

```json
{
  "planId": "pdf-shortcuts-finalize",
  "planPath": "impl-plans/active/pdf-shortcuts-finalize.md",
  "dependsOn": ["pdf-canvas-pane", "pdf-video-zoom"],
  "writePaths": [
    "src/features/workspace/WorkspaceShell.vitest.tsx",
    "README.md",
    "dist",
    "target",
    "impl-plans/active/pdf-shortcuts-finalize.md"
  ],
  "artifactRoots": ["dist", "target"],
  "sharedPaths": [],
  "workflowMode": "issue-resolution",
  "progressPath": "impl-plans/active/pdf-shortcuts-finalize.md"
}
```

## Intent and context

The acceptance criteria require vitest proof that every standard shortcut
works with a PDF open: `L`, `Cmd+O`, `+`/`-`, `r`, `D`, `j`/`k` (document
scroll, and file-list selection when the list has focus), `Enter` and `q`.
They also require README documentation of Alt+wheel zoom, all repository
gates, and a packaged debug launch that renders PDFs. This is the last wave,
with no siblings, so the workspace-wide gates and the runtime check live here.

## Non-goals

- No production code changes. If a test reveals a production defect, record
  it as a blocker in the progress log with the failing test name. Do not patch
  files owned by other plans.
- Do not change `KeymapProvider.tsx`, `keymap.ts` or their tests unless a
  failing shortcut proves that a PDF-specific guard is needed. The design
  expects no change; log it as a blocker instead.
- Do not commit fixtures. Do not touch `.riela/` or `riela-lock.json`.

## File-level changes

### `src/features/workspace/WorkspaceShell.vitest.tsx`

- Add a `vi.mock("../preview/pdfjs", ...)` whose `loadPdfDocument` returns a
  resolved one-page fake document, shaped like the fake in
  `PdfFilePreviewPane.vitest.tsx`. Stub `HTMLCanvasElement.prototype.getContext`.
- Add a `describe("with a PDF preview open", ...)` block. Imitate the video
  setup at about line 2360:
  - `documentMocks.getStartupContext.mockResolvedValue(directoryStartupContext("/workspace/doc.pdf"))`;
  - `listDirectory` returns `directoryPage(...)`;
  - `openFilePreview` resolves
    `{kind:"pdf", path:"/workspace/doc.pdf", file_name:"doc.pdf", mime_type:"application/pdf", html:"", last_modified:"2026-10-01T00:00:00Z"}`;
  - wait for `canvas.preview-pdf-page`.
- For each shortcut, reuse the assertion style that already exists for that
  shortcut in this file:
  - `L` (with `shiftKey`), as in the test at about line 1170: the sidebar
    toggles.
  - `Cmd+O`: the dialog `open` mock from `@tauri-apps/plugin-dialog` is
    called.
  - `r`, as at about line 482: the refresh reloads, the
    `openFilePreview`/`listDirectory` call counts increase, and the PDF pane
    calls `loadPdfDocument` again with a new `chilla_refresh`.
  - `D` (with `shiftKey`), as at about line 1240: the theme flips.
  - `+` then `-`: the PDF header `.preview__zoom` shows `110%` then `100%`.
  - `j`/`k` with the sidebar hidden: the active `.pane__body` `scrollTop`
    changes (stub `clientHeight`).
  - `j`/`k`/`Enter` with the file list focused (see the existing tests at
    about lines 897-904): the selection moves and `Enter` opens the selected
    entry.
  - `q`: the existing quit mock is called. Find how `quit` is asserted in this
    file, or mock `@tauri-apps/api/window` close/exit as the file already
    does.
- Assert that `document.querySelector("iframe")` is `null` and that
  `document.activeElement` is not inside `.preview--pdf` after load.

### `README.md`

- Line about 168: replace `PDF: embedded iframe preview` with
  `PDF: in-app pdf.js canvas rendering (keyboard shortcuts and zoom apply)`.
- Line about 252 (`+` / `-`): add that it applies to PDF (50-300%) and video
  (50-300%) previews. Keep the existing ranges for rendered content and
  images.
- Line about 253: replace the `Ctrl+mouse wheel` bullet with
  ``- `Alt (Option)+mouse wheel` / `Ctrl+mouse wheel` (including trackpad pinch): preview zoom under the pointer for Markdown/rendered, image, video, and PDF previews (not configured by keymap.toml)``.
- Edit nothing else in `README.md`.

## Pitfalls

- Mock `../preview/pdfjs`, not `pdfjs-dist`. Real pdf.js must not load in
  jsdom.
- `L` and `D` are uppercase keys with `shiftKey: true`, matching the existing
  tests. `Cmd+O` is `{key:"o", metaKey:true}`. Verify how existing tests
  dispatch it.
- Do not loosen existing tests to make the new ones pass.

## Final verification (workspace-wide; this plan owns it)

Run every command in the foreground from the repository root. Write each
command's full output with `2>&1 | tee` to its own log under a
`mktemp -d` directory outside the repo. Record in the progress log each
command, its exit status and its complete log path. Record any failure that
already exists on the base commit `ef2299d` separately, by re-running on a
clean checkout only if needed and without git mutations in the working tree.

1. `bun run typecheck` -> exit 0.
2. `bun run test` -> exit 0.
3. `bun run test:dom` -> exit 0. The log must list `PdfFilePreviewPane`,
   `PreviewPane`, `MediaFilePreviewPane`, `WorkspaceShell`, `KeymapProvider`
   and `pdfjs` suites as passed.
4. `bun run lint:biome` -> exit 0.
5. `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml`
   -> exit 0.
6. `bun run build` -> exit 0. Then run:
   - `ls dist/pdfjs/cmaps | grep -c bcmap` -> greater than 0;
   - `test -f dist/pdfjs/wasm/openjpeg_nowasm_fallback.js` -> exit 0;
   - `ls dist/pdfjs/standard_fonts | wc -l` -> greater than 0;
   - `ls dist/assets | grep -i pdf.worker` -> matches.
7. `CARGO_TERM_QUIET=true bun run tauri build --debug --no-bundle` -> exit 0.
8. Packaged runtime check, following the `chilla-post-edit-launch` skill.
   - Create the fixtures in `FIX=$(mktemp -d)` and keep any generator script in
     a separate `mktemp -d`. Never put either under the repository.
   - Fixtures:
     - a plain text PDF;
     - a CMap PDF: a Type0 font, `/Encoding /90ms-RKSJ-H`, and an
       `Adobe-Japan1` CIDFontType0 with no embedded font, showing a few
       Japanese characters;
     - a JPX PDF: make a high-contrast image with `sips -s format jp2 in.png --out img.jp2`
       and embed it as a page-sized image XObject with `/Filter /JPXDecode`.
   - Record each generator command and each fixture's `shasum -a 256`.
   - Launch `./target/debug/chilla "$FIX"` as an owned foreground process,
     with its output redirected to a log. Then:
     - open each PDF;
     - confirm the pages render, the CMap fixture's text is visible and the
       JPX image is visible;
     - exercise `L`, `+`/`-`, Alt+wheel, `r`, `D`, `j`/`k` and `Enter`;
     - quit with `q`;
     - record the exit status.
   - Use the `macos-computer-use-verify` skill or Safari Web Inspector to
     record:
     - `globalThis.pdfjsWorker === undefined`;
     - the `pdf.worker` worker is listed;
     - no CSP violation, "fake worker", CMap or OpenJPEG errors appear in the
       console.
   - If visual or inspector tools are unavailable, record that as an explicit
     verification gap. Do not claim success. If a worker CSP violation appears,
     stop and report a blocker to `pdf-pdfjs-foundation`'s owner. The only
     permitted fix is the bounded `worker-src` exception in the design, and
     that file is not owned here.

## Done criteria

- [ ] The new PDF-open shortcut tests exist and pass.
- [ ] README has the three edited bullets and no other changes
  (`git diff --stat README.md` shows a small diff).
- [ ] Steps 1-7 exit 0, with complete logs recorded.
- [ ] The step 8 evidence is recorded, or each gap is explicitly listed.
- [ ] The progress log is updated.

## Concurrency and drift rules

- Before each edit, read the target file fresh. Record pre- and post-edit
  `shasum -a 256` hashes in the progress log.
- On drift, stop and log it. No git operations. Commits happen in workflow
  finalization.

## Progress Log

### Session: 2026-11-04
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Wave 3. Runs after `pdf-canvas-pane` and `pdf-video-zoom` join.

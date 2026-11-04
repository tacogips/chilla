# PDF Inline Rendering: Workspace Shortcut Coverage, Docs and Final Verification Implementation Plan

**Status**: In Progress
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

- [x] The new PDF-open shortcut tests exist and pass.
- [x] README has the three edited bullets and no other changes
  (`git diff --stat README.md` shows a small diff).
- [ ] Steps 1-7 exit 0, with complete logs recorded.
- [x] The step 8 evidence is recorded, or each gap is explicitly listed.
- [x] The progress log is updated.

## Concurrency and drift rules

- Before each edit, read the target file fresh. Record pre- and post-edit
  `shasum -a 256` hashes in the progress log.
- On drift, stop and log it. No git operations. Commits happen in workflow
  finalization.

## Amendment 2026-11-04 (blocked-wave-scope-or-contract, round 1)

**Blocker addressed**: `bun run test:dom` exited 1. This amendment touches
`src/features/workspace/WorkspaceShell.tsx` and
`src/features/workspace/WorkspaceShell.vitest.tsx`. Evidence is
`tmp/pdf-inline-rendering-20261104-01/pdf-shortcuts-finalize/test-dom.log` and
`check-agent-workspace-node22.log`.

**Analysis (author)**

- The 9 failures in the `numeric view shortcuts` tests come from the runtime,
  not from source:
  - The worker ran Node 26, which logs
    `ExperimentalWarning: localStorage is not available because
    --localstorage-file was not provided`.
  - `mise.toml:20` pins `node = "22.23.4"`.
  - Under Node 22 these 9 tests pass (`check-agent-workspace-node22.log`
    reports 61 passed and 1 failed).
- One failure remains: `ignores a stale parent directory rejection after a
  newer picker workspace opens` (`WorkspaceShell.vitest.tsx` about line 2727).
  - It exercises the file-picker and open queue in `WorkspaceShell.tsx` and
    involves no PDF.
  - No plan in this run modified `WorkspaceShell.tsx`. The diff against
    `cc1d40b` shows no change there.
  - It failed at 1027ms, just past the default `waitFor` timeout of 1000ms.
  - So it is either an existing baseline failure or a timing flake.
    Implementation evidence must decide which. It must not be assumed.

**Decisions**

1. *Runtime*: every Node-based Bun/vitest gate in this plan runs under the
   repository-pinned Node through mise, as `mise exec -- bun run test:dom`.
   The same applies to `bun run typecheck`, `bun run test` and
   `bun run lint:biome` when any of them invokes node. Record
   `mise exec -- node --version` (expect `v22.23.4`) in the log. Results
   produced under Node 26 are not valid gate evidence.
2. *Source-matched baseline comparison (no new repository write path)*:
   the baseline runs entirely outside the repository, with production and test
   source both taken from `cc1d40b`. Only read-only git is used.
   - (a) Run `BASE=$(mktemp -d)`. The directory must be outside the repo.
   - (b) Run `git archive cc1d40b1d13cbba45c1acf25242f4289f0ca61a5 | tar -x -C "$BASE"`,
     then `ln -s "$PWD/node_modules" "$BASE/node_modules"`. Record `$BASE`,
     `git rev-parse cc1d40b1d13cbba45c1acf25242f4289f0ca61a5` and both exit
     statuses. The extra pdfjs-dist package in node_modules is harmless to the
     baseline code. Do not run any other git command: no worktree, stash,
     checkout or reset.
   - (c) Baseline runs, three times:
     `(cd "$BASE" && mise exec node@22.23.4 -- bunx vitest run --config vitest.config.ts src/features/workspace/WorkspaceShell.vitest.tsx -t "ignores a stale parent directory rejection")`.
     Pin Node explicitly so the run does not depend on mise trusting the
     exported `mise.toml`. Log to
     `tmp/pdf-inline-rendering-20261104-01/pdf-shortcuts-finalize/baseline-stale-picker-base-{1,2,3}.log`.
   - (d) Current runs, three times, from the repository root:
     `mise exec -- bunx vitest run --config vitest.config.ts src/features/workspace/WorkspaceShell.vitest.tsx -t "ignores a stale parent directory rejection"`.
     Log to `baseline-stale-picker-current-{1,2,3}.log` in the same directory.
   - (e) If any baseline run cannot execute the test (module resolution
     through the symlink, a config error, or zero tests collected), record the
     exact error. The disposition is then **undetermined**, which is a
     blocker. Never classify it as baseline.
   - (f) Clean up with `rm -rf "$BASE"`, then `test ! -e "$BASE"`, and record
     both exit statuses. No file is added to the repository tree.
3. *Disposition rules*: let b be the number of baseline failures (0-3) and c
   the number of current failures (0-3). A failure counts only if it is the
   assertion `expected ... to contain 'new preview'` on this test. Apply the
   rules in order. Exactly one applies.
   - **(A) c > b: introduced in this run.**
     - First apply the targeted fix in `WorkspaceShell.vitest.tsx` only. Keep a
       handle to the `getContext` spy and call `mockRestore()` on it, instead of
       the nested `vi.restoreAllMocks()`. Keep the `close` mock semantics
       unchanged for the other tests.
     - Re-run (d) three times. If c becomes 0, run the full
       `mise exec -- bun run test:dom`, which must exit 0.
     - If c is still > 0 after the fix, record the result as a blocker. Name
       the accepted wave-1/2 production diff as the suspect cause, with all
       logs, and route it to integration review. Do not edit production files.
   - **(B) b >= 1 and b >= c: baseline.** The failure reproduces with
     production and test source at `cc1d40b`.
     - Do not edit, skip or retry-wrap the test, and do not touch
       `WorkspaceShell.tsx`.
     - Run the full `mise exec -- bun run test:dom` once. If the stale-picker
       test is the sole failure, record a `baselineReviewPending` candidate
       with the test name, assertion text, b, c and all logs.
     - If there is any other failure, that is a blocker.
   - **(C) b = 0 and c = 0: does not reproduce in isolation.**
     - Run the full `mise exec -- bun run test:dom`. If it exits 0, the gate
       passes.
     - If it fails only on this test, re-run the full gate up to 2 more times.
       Any run that exits 0 passes the gate.
     - Otherwise record a timing flake with all logs and route it as a
       blocker. Do not edit the test.
   - Under every disposition, any full-gate failure other than this test is a
     blocker.
4. *Out of scope*: `src/features/workspace/WorkspaceShell.tsx` stays
   unauthorized. If the evidence points to a production defect there, record it
   as a pre-existing residual risk with evidence. Do not change it.
5. *Runtime gap*: the packaged launch (Final verification step 8) is still
   required. Attempt it after the DOM gate disposition. If the visual or
   inspector tools are unavailable, record an explicit gap per step 8. Do not
   claim success.

**Round-1 revision (step5 F2/F3)**: the in-tree baseline copy was replaced
by an out-of-repo `git archive` export, and the dispositions are now
count-based and exhaustive.

**Unchanged**: plan IDs, the DAG, other plans, the README edits, and Final
verification steps 1-7 other than the Node runtime pin.

## Progress Log

### Session: 2026-11-04
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Wave 3. Runs after `pdf-canvas-pane` and `pdf-video-zoom` join.

### Session: 2026-11-04 — implementation
**Tasks Completed**: PDF-open shortcut tests and README changes. The focused PDF tests passed 2/2 under Node 22 (`tmp/pdf-inline-rendering-20261104-01/pdf-shortcuts-finalize/check-agent-pdf-node22.log`).
**Checks**: `bun run typecheck`, `bun run test` (67 passed), `bun run lint:biome`, `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml`, `bun run build`, and `CARGO_TERM_QUIET=true bun run tauri build --debug --no-bundle` exited 0. Complete logs are in `tmp/pdf-inline-rendering-20261104-01/pdf-shortcuts-finalize/` as `typecheck.log`, `test.log`, `lint.log`, `cargo-check.log`, `build-final.log`, and `tauri-build.log`. `assets.log` records 168 CMaps, 16 standard-font entries, the OpenJPEG fallback check and the worker asset (exit 0).
**Blockers**: `bun run test:dom` exited 1 (447 passed, 10 failed; `test-dom.log`): Node 26 lacks localStorage and an existing stale-picker test fails. Under Node 22 the WorkspaceShell suite still fails that stale-picker test (61 passed, 1 failed; `check-agent-workspace-node22.log`); source-matched baseline comparison is unavailable. The apparent file-open queue cause is in `src/features/workspace/WorkspaceShell.tsx`, outside this plan's write scope. Resolve the failure or establish the required baseline before acceptance.
**Runtime gap**: The three fixture PDFs were not generated, the debug executable was not launched, and rendered pixels, shortcut interaction, real worker, CSP and decoder console evidence remain unverified. The failed required DOM gate prevented completion; do not treat the build as runtime proof.
**Hashes**: README before `16738c9e04780e7caa27e31117130f6785c495aa9c9ee279324531f1a7d04958`, after `36188dbf66305224a78e742888a230cac7200685b7d50bdb2b5d1caa2a2dbc03`; WorkspaceShell test before `e98fd29bfaf304e50e418dca6d36da15cd8552358473208d37b92af84d2993d4`, after `4aec80515eebbd8e41d670ba2062bfe50d973ce411fca8a320436d8ff4a11169`. Per-edit intent and intermediate hashes are in the same evidence directory. Formal review and finalization remain downstream.

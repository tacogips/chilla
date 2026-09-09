# Design Notes

This document contains research findings, investigations, and miscellaneous design notes.

## JSON Preview Performance

Measure file reading, syntax highlighting, response serialization, and complete backend preview preparation using a user-provided file without logging its contents. The reported reproduction is a roughly 155 KiB JSON file. The current preview uses Rust syntect and sends complete highlighted HTML to the webview.

Choose the fix from measured evidence. Preserve source text, escaping, and light/dark readability. Prefer a focused JSON highlighting optimization if general-purpose syntax parsing dominates; avoid adding a JSON object parser unless structural parsing is actually needed. Preserve other language previews and use synthetic regression fixtures rather than private file contents. Record before/after timings and distinguish backend measurements from unmeasured UI latency.

The reproduction confirms expensive general-purpose highlighting: the isolated debug baseline takes 2,278 ms cold and 491–569 ms warm, compared with 0.091 ms reading and 42 ms response serialization. Its 158,624 source bytes become 877,626 HTML bytes with 18,742 spans. Existing app binaries show 3,647 ms debug versus 329 ms release for backend preview preparation; their differing build times mean the reproducible same-source benchmark is the controlled comparison.

Use a linear JSON lexical scan for `.json` source previews. Emit complete string tokens rather than grammar-level string fragments, derive token colors from the existing syntect theme, and escape every source slice before embedding it in HTML. This is source highlighting rather than JSON deserialization: preserve whitespace, numeric spelling, malformed input, and incomplete strings. Keep other extensions on their existing highlighting path. Bypass general grammar initialization when describing a JSON file. Full-document rendering remains a scalability limit for much larger inputs.

The same-source release baseline measures 220.519 ms cold highlighting, 41.787–42.770 ms warm highlighting, 41.483–45.105 ms warm backend preview preparation, and 0.989–1.139 ms serialization. Release optimizations substantially improve the debug result, but highlighting still dominates the backend work.

### Verified Results

Measured on 2026-09-09 against the same 158,624-byte local reproduction; no source contents are stored here or in fixtures. Cold means the first call in a fresh benchmark process; warm means subsequent calls. Timings are observations, not performance guarantees.

| Metric | Original | JSON fast path |
| --- | ---: | ---: |
| Debug cold highlighting | 2,278.496 ms | 23.935 ms |
| Debug warm highlighting | 490.836–568.944 ms | 13.510–14.170 ms |
| Release cold highlighting | 220.519 ms | 3.368 ms |
| Release warm highlighting | 41.787–42.770 ms | 1.485–1.575 ms |
| Release warm backend preview | 41.483–45.105 ms | 1.816–2.181 ms |
| Dark-theme HTML bytes | 877,626 | 441,558 |
| Dark-theme span count | 18,742 | 6,629 |

A fresh optimized release backend preview takes 3.283 ms plus 0.538 ms serialization. Light-theme debug highlighting is similar at 24.246 ms cold and 13.813–15.572 ms warm; its HTML contains more style spans than the dark theme.

The rebuilt debug desktop app successfully completes its preview command in 133 ms on a fresh recheck (341 ms while build/check work was ongoing), compared with the existing original debug binary's 3,647 ms. These app command timings include runtime execution conditions and are not interchangeable with the isolated highlighter benchmark. The remaining timing discrepancy was not isolated. No visible UI verification or paint-time measurement was possible because Computer Use tools were unavailable.

Reproduce aggregate-only benchmarks with `CARGO_TERM_QUIET=true mise exec -- cargo run --release --manifest-path src-tauri/Cargo.toml --example preview_performance -- /absolute/path/input.json`; omit `--release` for debug. Append `--preview-only` for a cold backend call or `--light` for the light theme. The benchmark never prints file contents. Eight syntax-highlighting tests, 23 viewer service tests, all-target compilation, Clippy, and the debug Tauri build pass.

## Shared Syntax Highlighting Performance

Extend the measured JSON performance work to the other file syntaxes supported by the shared Rust highlighter. Establish cold and warm debug/release baselines for Rust, TypeScript/JavaScript, Python, shell, TOML, YAML, CSS, HTML/XML, Markdown, and plain text using reproducible nonprivate fixtures. Measure real repository files as well as larger synthetic sources where useful.

Prefer improvements shared across grammars while retaining grammar semantics, exact source text, HTML escaping, light/dark colors, embedded languages, and multiline parser state. Evaluate regex engine and syntax initialization costs using measurements before selecting implementation. Any dependency change requires lockfile/build-script review and an advisory check. Preserve the JSON fast path. Apply shared improvements to file previews and Markdown code fences where applicable; do not substitute disabling syntax highlighting for an actual speedup.

The completion evidence must include before/after benchmarks across the representative language matrix, regressions for text/style preservation and multiline syntax, independent verification, and a rebuilt desktop launch. Full-document display remains a separate potential limit for arbitrarily large inputs.

### Selected Shared Optimization

The baseline identifies two independent costs: reconstructing the complete default-plus-TOML grammar set at first use (roughly 1.6 seconds debug / 0.17 seconds release), and repeated fancy-regex execution (75–182 ms release on representative 25–55 KiB repository files).

Generate the combined syntax packdump in `src-tauri/build.rs` using the existing trusted, embedded TOML definition and Syntect defaults. Embed the build artifact and deserialize it lazily at runtime, retaining the full grammar linkage and newline-aware state. Cargo must rerun generation when the TOML definition changes. Do not load a user-controlled cache or deserialize external data.

Evaluate Syntect's supported Oniguruma engine using the same fixtures. Accept the native engine only with demonstrated speedups, source/style regression verification, static bundled linking, and reviewed lockfile additions. The compatible crates are `onig` 6.5.3 and `onig_sys` 69.9.3; the latter bundles Oniguruma 6.9.10 and compiles it via existing `cc`/`pkg-config` build dependencies, with bindgen disabled through Syntect's dependency feature configuration. Its build script was inspected for filesystem/network actions. The original C upstream is archived, a maintenance tradeoff; the Rust wrapper and bundled package are separately maintained. Before changes, Cargo audit reports zero vulnerabilities and 14 preexisting informational warnings; compare the final graph against that baseline.

### Shared Benchmark Results

Measured 2026-09-09 on the local macOS machine. Each language uses a fresh benchmark process and the same roughly 16 KiB synthetic source before and after. `--initialize` separates global syntax-set loading; first highlighting still includes lazy regex compilation and theme loading. The table reports the mean of two subsequent release/dark highlighting calls, excluding hashing and span counting.

| Language | Before (ms) | After (ms) | Speedup |
| --- | ---: | ---: | ---: |
| Rust | 48.23 | 15.12 | 3.19x |
| TypeScript | 82.98 | 24.25 | 3.42x |
| JavaScript | 69.23 | 21.19 | 3.27x |
| Python | 76.73 | 30.65 | 2.50x |
| Shell | 26.25 | 16.67 | 1.57x |
| TOML | 8.64 | 10.22 | 0.85x |
| YAML | 102.48 | 15.15 | 6.76x |
| CSS | 32.51 | 14.54 | 2.24x |
| HTML | 49.75 | 19.98 | 2.49x |
| XML | 5.13 | 4.75 | 1.08x |
| Markdown | 98.70 | 16.72 | 5.90x |
| Plain text | 0.25 | 0.31 | 0.80x |
| Existing JSON fast path | 0.38 | 0.36 | 1.04x |

Release syntax-set initialization drops from 169–186 ms to 0.59–0.84 ms; debug initialization drops from 1,519–1,763 ms to 23–32 ms. Debug warm improvements also cover the language matrix, including Rust approximately 1 second to 120 ms, and YAML approximately 2.5 seconds to 89 ms.

The native engine is retained despite a small TOML warm-call tradeoff (about +1.6 ms) and a submillisecond plain-text variation: eliminating global initialization substantially improves first-file loading for these formats. This change does not promise a warm-call speedup for every grammar. The JSON fast path is unchanged.

At roughly 256 KiB, release warm Rust improves from 763–779 ms to 249–265 ms, JavaScript from 1,160–1,185 ms to 360–362 ms, and YAML from 1,618–1,685 ms to about 272 ms. Both themes and all small/large benchmark HTML fingerprints remain identical. The 26 small language/theme fingerprints are retained as regression fixtures, along with multiline/embedded-language, malformed source, Unicode/escaping, line-ending, fence/alias, and first-line-detection tests.

Reproduce with `CARGO_TERM_QUIET=true mise exec -- cargo run --locked --release --manifest-path src-tauri/Cargo.toml --example syntax_performance -- rust --initialize`. Substitute another fixture name, append `--light` or `--large`, or omit `--release` for debug. `all` runs the matrix in one process, so only its first case has cold global caches. Raw before/after metrics are in `/tmp/chilla-syntax-performance.oaqHA9/`; fixtures contain no user data. External engine and dump references are indexed in [references](../references/README.md#syntax-highlighting-performance).

The final lockfile adds only `onig`/`onig_sys` and removes the unused fancy-regex entry and Syntect features; existing unrelated lockfile changes are preserved. Cargo audit still reports zero vulnerabilities and the same 14 preexisting informational warnings. The macOS debug binary links only system frameworks/libraries; the bundled native regex engine introduces no external `libonig` runtime dependency. Its archived C upstream remains a maintenance consideration.

### Real-File and Desktop Verification

The same repository file contents were verified by SHA-256 before and after. Release measurements use the `preview_performance` example in a fresh process for each file:

| File | Source bytes | First highlight before / after (ms) | Warm highlight before / after (ms) |
| --- | ---: | ---: | ---: |
| `src-tauri/src/github_pr_diff.rs` | 25,656 | 315.8 / 25.9 | 74.5–80.2 / 18.7–20.2 |
| `src/app/App.css` | 55,274 | 377.6 / 56.4 | 134.6–147.1 / 40.8–45.2 |
| `src/features/workspace/WorkspaceShell.tsx` | 47,202 | 427.0 / 52.4 | 178.3–181.9 / 42.6–45.4 |

Complete warm backend previews after the change take 17.0–18.9 ms, 41.2–46.0 ms, and 41.9–44.2 ms respectively, with response serialization under 0.4 ms in these release measurements.

Verification passes: 11 targeted syntax tests, all 206 Rust library tests in a serial run, locked all-target Clippy with warnings denied, release benchmark builds, and `CARGO_TERM_QUIET=true mise exec -- bun run tauri build --debug --no-bundle` (including frontend typechecking/build). One unrelated logging retention test failed transiently in the initial parallel suite; its isolated retry and the full serial run pass. No logging code was changed.

Launched `/Users/taco/gits/tacogips/chilla/target/debug/chilla --verbose /Users/taco/gits/tacogips/chilla/src-tauri/src/github_pr_diff.rs > /tmp/chilla-shared-syntax-launch.log 2>&1`. The debug app's diagnostic log `/Users/taco/Library/Logs/chilla/chilla-verbose-17598.log` records successful preview completion in 339 ms. That command timing includes desktop runtime conditions and is not the isolated release measurement above. The test process was stopped afterward. Build output is `/tmp/chilla-shared-syntax-build.log`. Computer Use tools were unavailable, so visible rendering and paint-time validation were not claimed; other operating systems were not exercised locally.

## Exhaustive Syntax Optimization

Inventory every grammar in the app's generated Syntect bundle, including embedded/hidden grammars, extension/name aliases, the JSON fast path, and every frontend diff `SyntaxKind`. Benchmark all entries with nonprivate, language-appropriate fixtures and explicit grammar identity checks; do not treat a fallback-to-plain result as language coverage. Preserve the previous broad engine improvement as the baseline for this pass.

Use stage-level measurements to select further common optimizations and format-specific improvements where required. Cover first-use/uncached work as well as repeated work, retain full source and equivalent token styling, and keep any reuse cache bounded and keyed by all relevant source/syntax/theme inputs. Do not report cache hits as uncached parsing gains. Do not remove coloring, truncate content, or skip slow grammars to claim optimization.

The backend source/fence highlighter and the separate frontend diff tokenizer both belong to this inventory. Public Tauri command contracts stay unchanged unless evidence requires an explicit design update. Completion requires a checked-in inventory and per-entry benchmark report, exhaustive coverage assertions, independent Rust/Bun verification, and a rebuilt desktop launch. Any per-entry regression or limitation must be resolved or explicitly accounted for without omitting that entry.

The complete grammar and diff-kind inventory is tracked in [Complete Syntax Inventory and Performance](design-syntax-inventory.md).

## Overview

Notable items that do not fit into architecture or client categories.

---

## Sections

## macOS DMG Release Notes

### Design Reference

- See `design-docs/specs/design-macos-dmg-release.md` for the release-shape decision that keeps the current Darwin tarball contract but adds a separate Tauri `app,dmg` distribution path for signed/notarized macOS builds.
- The same design now defines the migration from `tacogips/tap` to the official Homebrew Cask repository, including the external notability gate and the requirement not to advertise tap-free installation before upstream acceptance.

## Markdown Workbench Notes

### Scope Corrections Applied

- The architecture now treats the checked-in Tauri + Bun + TypeScript structure as the current project baseline.
- The root Rust manifest is workspace-level; backend crate implementation belongs under `src-tauri/`.
- Bare `chilla` startup without a file opens the current working directory in file view mode.
- Cargo development variables such as `CARGO_TERM_QUIET` belong to implementation tooling, not the product CLI surface.

### Key Assumptions

- "Editor is default hidden" was interpreted as "the preview pane is hidden by default while the editor remains the primary visible pane."
- The table of contents is generated from Markdown headings only, not from arbitrary HTML headings embedded in source.
- Mermaid support applies to fenced code blocks marked for Mermaid diagrams.
- Markdown mode recognizes `.md`, `.markdown`, and `.mdown`; file view mode handles additional previewable file types.

## File Viewer Mode Notes

### Scope Additions

- `chilla` is no longer Markdown-file-only at startup; it must handle directories, Markdown files, other text files, and binary files.
- `chilla` also needs an explicit multi-file startup path where the left pane is constrained to only the provided filepaths.
- File type parsing is a Rust responsibility and should use a dedicated library rather than frontend sniffing.
- Binary files are previewable only as metadata/placeholders, not as rendered content.
- File view mode uses a yazi-style flat current-directory list, not a recursive tree widget.
- CSV should be promoted from generic text preview to a dedicated structured preview kind with raw/formatted switching.

### Interaction Assumptions

- The flat file list still counts as the "file tree" for product language because directory navigation preserves filesystem hierarchy through current-directory replacement.
- Multi-file startup should not pretend to be directory navigation; it should use a dedicated explicit-file-set selector view in the same left-pane slot.
- `Ctrl-M` should be treated as equivalent to Enter/confirm in the webview key handler.
- Markdown mode remains the only editable mode in this feature slice; non-Markdown files are view-only.
- CSV formatted view should not infer a schema/header row in the first slice; numeric row/column labels preserve data fidelity.
- CSV raw/formatted switching should reuse the existing source/rendered workspace control instead of introducing a CSV-only toolbar.

### Design Reference

- See `design-docs/specs/design-file-viewer-mode.md` for the detailed explicit-file-set selector design, startup contract, and left-pane behavior.
- See `design-docs/specs/design-csv-viewer.md` for CSV preview classification, payload shape, and table rendering behavior.

### Verification Targets

- Keep Bun typecheck, Vitest (`bun run test:dom`), and Cargo checks/tests/clippy aligned with Markdown parsing, heading extraction, watcher behavior, and new preview kinds such as CSV.
- Linux WebDriver smoke (`bun run test:tauri:e2e:linux`) remains the authoritative mixed-stack probe for startup roots, listing, selection, Markdown preview styling, CSV raw/formatted toggles, and explicit argv file sets (`impl-plans/completed/file-view-mixed-stack-validation.md`).

### Implementation Follow-Up

- File-view mode, CSV preview, Markdown workbench first slice, DMG packaging, mixed-stack smoke validation, and Markdown save/conflict slices are archived under `impl-plans/completed/`; see `impl-plans/README.md` for the authoritative index before extending those areas.
- New features in this surface should still start from `impl-plans/active/` plans that enumerate CLI/bootstrap, backend parsing/watch, frontend workspace behavior, task automation impacts, and every Rust/TypeScript IPC contract change.
- Mixed-stack changes should be implemented as a Tauri feature rather than isolated frontend or Rust-only work.

## EPUB Navigation Notes

### Reference Alignment

- Foliate / Foliate JS is the UX and architecture reference for this slice, specifically its TOC tree model, href-based navigation, and anchor-based relocation across repagination.
- Persisting raw page numbers would be incorrect because the current EPUB reader uses CSS multi-column pagination, so page counts change with viewport and layout.

### Design Direction

- Rust should own EPUB TOC extraction and href normalization.
- The frontend should own the last-reading-location store because it is lightweight view state and the repo already persists small UI settings in `localStorage`.
- TOC interaction for EPUB should reuse the same workspace slot and toggle behavior as Markdown instead of adding a second navigation paradigm.

## Linux Tauri WebDriver E2E Notes

### Goal

- Add a Linux-only desktop smoke test that drives the real Tauri window through `tauri-driver` rather than relying on browser-only mocks.
- Keep the existing browser-mode Vitest coverage for fast UI checks, but document that browser checks do not prove Tauri runtime behavior.

### Runtime Decisions

- Use `tauri-driver` as the WebDriver proxy and `WebKitWebDriver` as the Linux native backend.
- Build the app with `bun run tauri build --debug --no-bundle` before running the smoke test so the harness always targets the current code.
- Run against the real workspace root and assert that the Tauri app opens the current directory, filters to `README.md`, and renders the real Markdown preview.
- When no `DISPLAY` is available, provide an `Xvfb` fallback so Linux desktop verification can run headlessly inside the dev shell.

### Scope Boundaries

- This slice adds a smoke test and local developer workflow only.
- CI wiring and non-Linux native-driver support remain follow-up work.

### Verification Targets

- `bun run test:tauri:e2e:linux`
- `task test-tauri-e2e-linux`
- Existing browser-mode tests remain the fast path for UI-only changes.

## Browser Test Migration to Tauri E2E Notes

### Goal

- Replace the repo's browser-only Vitest suite with real Linux desktop Tauri-driver coverage.
- Keep the verification focused on behaviors that matter at the Tauri runtime boundary:
  startup path resolution, directory paging/filtering, file selection, and rendered Markdown/theme output.

### Runtime Decisions

- Use a generated temporary fixture workspace for deterministic desktop E2E instead of a browser-only fallback path.
- Launch the built Tauri binary through a temporary wrapper script so the test can pass a fixture startup path.
- Consolidate the current browser assertions into a single real-runtime suite rather than keeping one browser test file per UI slice.

### Scope Boundaries

- This slice removes the automated browser-mode test command and browser test files from the repository.
- DOM-unit tests under `src/**/*.vitest.*` remain in place for fast non-runtime coverage.
- Workspace/document behavior is no longer expected to run meaningfully in plain browser mode without the desktop runtime.

### Verification Targets

- `bun run typecheck`
- `bun run test`
- `bun run test:tauri:e2e:linux`
- `nix build .#chilla --no-link`

## Real Runtime Only Verification Notes

### Goal

- Make workspace and document behavior depend on the real Tauri runtime only.
- Keep fast unit tests only for frontend-local code that does not pretend to replace the desktop
  boundary.

### Runtime Decisions

- `src/lib/tauri/document.ts` should always call the Tauri API surface.
- Tests and UI startup checks that relied on a fake desktop boundary should be removed instead of
  rewritten around a simulated runtime.
- Real runtime validation for workspace/document startup behavior should remain in the Linux
  Tauri-driver E2E suite.

### Scope Boundaries

- This slice removes the browser-only fallback path and tests that existed only to prove that
  fallback.
- Pure helper/unit tests that do not claim to emulate desktop behavior remain allowed.
- Rust command contracts are unchanged in this slice.

### Verification Targets

- `bun run typecheck`
- `bun run test`
- `bun run test:dom`
- `bun run test:tauri:e2e:linux`

---

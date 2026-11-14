# Structured Data Formatting and Syntax Coverage Implementation Plan

**Status**: Completed
**Design Reference**: [Structured Data Formatting and Syntax Coverage](../../design-docs/specs/design-structured-data-formatting.md)
**Created**: 2026-09-26
**Last Updated**: 2026-10-01

## Deliverables

- `src-tauri/src/viewer/data_format/` (new): token-based JSON, JSON Lines, and XML formatters with `format_structured_source(source: &str, format: StructuredDataFormat) -> FormatOutcome`.
- `src-tauri/src/viewer/types.rs`: `StructuredDataFormat` enum; `FilePreview::Text` fields `structured_format`, `formatted_html`, `format_notice`.
- `src-tauri/src/viewer/service.rs`, `preview_detection.rs`, `csv.rs`: structured-format detection, formatted HTML generation, TSV routing with tab delimiter.
- `src-tauri/src/syntax_highlight/mod.rs`: JSON-family lexer routing (`is_json_path`), new grammar aliases, exact-filename resolution.
- `src-tauri/syntaxes/*.sublime-syntax`, `src-tauri/build.rs`: new grammars.
- `src-tauri/examples/support/*`, `design-docs/specs/design-syntax-inventory.md`: regenerated inventory/baselines and documentation.
- `src/lib/tauri/document.ts`, `src/features/workspace/*`, `src/features/preview/*`, `src/features/pr-diff/prDiffSyntaxLanguages.ts`, styles: toggle UI, persistence, shortcuts, TSV labels, diff aliases.

## Tasks

### TASK-001: Backend structured data formatting
**Status**: Completed
**Parallelizable**: Yes
- [x] JSON / JSON Lines / XML formatters with unit tests
- [x] Lenient HTML re-indenter and CSS / JavaScript-TypeScript beautifiers with unit tests
- [x] Text preview contract fields populated
- [x] TSV routed to CSV preview with tab delimiter
- [x] JSON-family paths use the JSON lexer

### TASK-002: Backend syntax coverage
**Status**: Completed
**Parallelizable**: Yes
- [x] New grammars compiled into the packdump
- [x] Aliases and exact-filename resolution
- [x] Regression inventory, fixtures, baselines, and inventory doc updated

### TASK-003: Frontend toggle and aliases
**Status**: Completed
**Parallelizable**: Yes (contract fixed in design)
- [x] Contract mirrored in TypeScript
- [x] Header toggle, document column switching, shortcuts, persistence
- [x] TSV labels, diff tokenizer aliases, tests
- [x] `format.toggle` (Shift+F) and `syntax.toggle` (Shift+C) actions, header syntax button, help/README updates
- [x] HTML rendered view (sandboxed asset-protocol iframe, relative resources, 1/2/Shift+P)

### TASK-004: Verification
**Status**: Completed
**Parallelizable**: No (depends on TASK-001..003)
- [x] Cargo check/clippy/tests, Bun typecheck/tests/Biome pass
- [x] Debug app rebuilt and launched with JSON, JSONL, XML, HTML, CSS, JS, TSV, and Nix samples
- [x] Visual confirmation of toggles, HTML Preview relative resources in WebKit, and Nix colors

## Progress Log

### 2026-09-26
- Design recorded; TASK-001..003 dispatched in parallel against the fixed contract.
- User added: dedicated shortcuts for syntax highlighting on/off and format on/off; added to TASK-003.
- User added HTML formatting, then approved lenient CSS and JS/TS beautifiers (no new dependencies; external formatters rejected due to App Store sandbox).
- User added a browser-style rendered HTML view (frontend-only, scripts disabled).
- TASK-001 completed: JSON/JSON Lines/XML/HTML/CSS/JavaScript-TypeScript formatters, `StructuredDataFormat` enum and `FilePreview::Text` contract fields, TSV-to-CSV tab-delimiter routing, and JSON-family syntax lexer routing are all implemented and tested (`cargo check`/`clippy -D warnings`/`fmt --check`/full lib suite green); design doc's Format Inventory and formatter-behavior sections updated to match.
- TASK-002 completed: nine project-authored grammars (Nix, Swift, Dockerfile, Zig, Protocol Buffers, Kotlin, INI, HCL, GraphQL), alias and exact-filename resolution, regenerated exhaustive artifacts (85 grammars), inventory doc updated.
- TASK-003 completed: structured preview toggle, HTML Markdown-style Raw/Preview with sandboxed asset iframe, `format.toggle` (Shift+F) and `syntax.toggle` (Shift+C), TSV labels, diff aliases, help and README.
- Independent verification: cargo fmt/clippy -D warnings/workspace check pass; nextest 309/309; bun typecheck, 67 Bun tests, 425 DOM tests, Biome pass.
- Built `bun run tauri build --debug --no-bundle`; launched `target/debug/chilla --verbose sample.json sample.jsonl sample.xml sample.html sample.css sample.js sample.tsv sample.nix` from a scratch sample directory; verbose log `~/Library/Logs/chilla/chilla-verbose-90301.log` records a successful 5 ms preview command. Screen capture returned a blank image (no screen-recording permission), so visible UI was not confirmed.

### 2026-10-01 Release Completion
- Native Computer Use visibly confirmed raw/formatted JSON via Shift+F, syntax
  on/off via Shift+C, rendered HTML containing a relative SVG image, and colored
  Nix tokens in WebKit. Fixtures and launch evidence are local under
  `/tmp/chilla-release-0.3.5/`; no private files were used.
- Combined 0.3.5 verification passes: 67 Bun tests, 443 DOM tests, 318 Rust
  library tests, one integration test, typecheck/Biome/rustfmt/check/strict Clippy.
- All implementation completion criteria satisfied; archived as completed.

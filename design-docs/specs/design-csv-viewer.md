# CSV Viewer Design

Detailed design for adding CSV-specific preview behavior to `chilla`.

## Overview

This document defines how `.csv` files should be classified, loaded, and displayed in file view mode.

The feature goal is to give CSV files the same high-level affordance that Markdown already has:

- a raw view for the original source
- a formatted view for a more readable representation

Unlike Markdown, CSV remains a read-only file-view feature in this slice. The formatted view renders CSV records as a scrollable cell table rather than as generic highlighted text.

## Scope

### In Scope

- Detect CSV files as a dedicated preview kind instead of generic text.
- Show a two-state view switch for CSV:
  - `Raw`
  - `Formatted`
- Render formatted CSV as a semantic table with visible cell boundaries.
- Preserve raw preview as an exact source-oriented representation.
- Reuse existing file reload and file-selection flows.
- Let users toggle first-row headers and set the initial value through typed file-open options and the CLI.

### Out Of Scope

- Editing CSV cells in place
- Spreadsheet formulas, sorting, filtering, or frozen panes
- TSV / Excel / spreadsheet workbook support
- Automatic schema inference or per-column typing
- User-configurable delimiter selection in the first slice

## User Experience

### Entry And Activation

- Selecting a CSV file from file view opens a CSV preview rather than the generic text preview.
- CSV stays in file view mode; it does not enter Markdown mode.
- The workspace header shows the same two-state source/rendered control pattern already used for Markdown.
- `Shift+P` continues to toggle the active two-state preview, but for CSV the second state is labeled `Formatted` instead of `Preview`.
- Numeric view shortcuts mirror the shared workspace pattern: `1` selects raw source, and `2` selects formatted table when formatted output is available.
- `2` is a no-op when CSV parsing fails or safety limits disable formatted output; `3` and higher digits do not affect CSV view state.
- Numeric view shortcuts must not run while focus is inside editable controls, including the file-browser filter field.

### Raw View

Raw view is the source-oriented representation of the file.

- It shows the CSV file contents using the existing text-preview styling pipeline.
- The text is read-only.
- Line breaks, quoting, delimiter placement, and escaped characters remain visible exactly as stored after decoding.
- This view is the fallback-safe mode and remains available even when formatted parsing fails.

### Formatted View

Formatted view renders CSV records as a table.

- The table is read-only.
- The top sticky row shows numeric column indices by default, or first-record field values when the explicit header option is enabled.
- A left sticky gutter shows record indices (`1`, `2`, `3`, ...).
- Each parsed field is rendered as plain text inside an individual cell.
- Multiline field content wraps inside the cell with preserved newlines.
- Horizontal overflow scrolls within the document pane rather than stretching the whole workspace.

### First-Row Header Control

The default remains numeric headings with every parsed record in the table body.
There is no automatic header inference. The explicit option described in
[First-Row Header Options](#first-row-header-options) replaces the earlier deferral
of a user toggle.

### Error And Fallback Behavior

- If the file cannot be parsed into CSV records, raw view remains available.
- Formatted view is disabled or replaced with an inline failure state that explains why table rendering is unavailable.
- If the file exceeds formatted-preview safety limits, the UI shows either:
  - a truncated table with an explicit notice, or
  - a raw-only fallback if the file is too large to render safely

The exact thresholds belong in implementation, but the product behavior must prefer responsiveness over attempting to fully materialize arbitrarily large tables.

## Detection And Classification

CSV should become a first-class preview kind owned by the Rust viewer service.

### Detection Rules

- Extension-first detection for `.csv`
- MIME support for `text/csv`
- Extension should win over ambiguous generic text MIME reports

This keeps CSV handling stable even on systems where MIME sniffing is inconsistent.

### File Preview Contract Addition

The current typed preview union should gain a dedicated CSV variant.

```text
FilePreview
- markdown
- csv
- image
- video
- audio
- pdf
- epub
- text
- binary
```

Recommended CSV payload shape:

```text
CsvPreview
- path
- file_name
- mime_type
- raw_html
- rows[][]
- column_count
- displayed_row_count
- first_row_as_header
- row_count_status
- total_row_count?
- truncated
- formatted_available
- parse_error?
- size_bytes
- last_modified
```

Contract notes:

- `raw_html` is the source-oriented highlighted/raw rendering reused by the raw pane.
- `rows[][]` is structured data for frontend table rendering, not backend-generated HTML.
- `column_count` is the maximum observed parsed width, including a record shortened by the cell budget; it is independent of header mode.
- `total_row_count` may be omitted when the backend stops early for performance reasons.
- `formatted_available` is false when parsing fails or formatted rendering is intentionally disabled by safety limits.
- `parse_error` being present explains why formatted rendering is unavailable; raw view still works.

## Parsing Model

Rust should parse CSV rather than the frontend.

### Responsibility Split

- Rust owns file reading, CSV decoding, delimiter-aware parsing, truncation decisions, and typed payload construction.
- Frontend owns table layout, scroll behavior, cell rendering, and mode-switch UI state.

### Parser Behavior

The backend should use an RFC 4180-capable CSV parser so that:

- quoted fields containing commas are preserved correctly
- escaped quotes are decoded correctly
- multiline quoted fields remain a single cell

The parser should run in a flexible-record-width mode.

Reasoning:

- Real CSV files often contain ragged rows.
- Rejecting the entire preview because one row has fewer cells is a poor UX for a read-only viewer.

Rendering rule for ragged rows:

- the frontend pads missing trailing cells as empty cells up to `column_count`

### Decode Policy

The first slice should share the same text-decoding baseline as the generic text preview path.

- UTF-8 and UTF-8-with-BOM should render correctly
- non-UTF-8 input may degrade to replacement characters unless a later encoding feature is added

This keeps CSV behavior aligned with the rest of the current viewer stack instead of introducing CSV-only encoding magic.

## Frontend Integration

### Workspace State Model

The current `markdownPane` state is too Markdown-specific for this feature. The design should generalize the concept into a document presentation mode that can apply to multiple preview kinds.

Recommended direction:

```text
DocumentPresentationMode
- raw
- rendered
```

User-facing labels stay content-specific:

- Markdown: `Raw` / `Preview`
- CSV: `Raw` / `Formatted`

This preserves one shortcut and one header control model across multiple previewable document types.

### New Preview Component

Add a dedicated frontend component for CSV, separate from the generic HTML `PreviewPane`.

Recommended component role:

```text
CsvFilePreviewPane
- receives CsvPreview payload
- receives active presentation mode
- renders raw highlighted HTML for raw mode
- renders semantic table DOM for formatted mode
- shows truncation / parse-status messaging
```

Reasoning:

- Structured cell rendering is easier and safer in frontend code than shipping giant backend-generated HTML tables.
- A dedicated component can implement sticky row/column labels and overflow handling cleanly.
- Rendering cells as text nodes avoids HTML injection concerns from CSV contents.

### TOC And Navigation

- CSV previews do not participate in the table of contents pane.
- `Shift+T` remains inactive for CSV.
- Selection anchors and heading navigation remain Markdown / EPUB-only concerns.

## Table Rendering Rules

### Layout

- Use a semantic `<table>` structure inside the preview pane.
- The column header row (numeric or first-record labels) remains visible while vertically scrolling.
- Row-number gutter remains visible while horizontally scrolling when practical in the chosen CSS approach.
- Cells use compact but readable padding and visible borders.

### Cell Content

- Render cell values as plain text.
- Preserve embedded newlines with wrapped display.
- Do not evaluate formulas or links.
- Do not interpret HTML from cell contents.

### Empty Values

- Empty CSV fields render as empty cells.
- Missing trailing cells in ragged rows render as empty padded cells.

## Performance And Safety

Formatted CSV preview needs stricter bounds than raw text preview because table DOM cost scales with cell count.

Design requirements:

- Protect the UI with row and/or total-cell limits for formatted rendering.
- Keep raw mode available even when formatted mode is limited.
- Surface truncation clearly in the UI.
- Avoid a backend design that requires building enormous HTML strings for big tables.

Recommended strategy:

- parse incrementally in Rust
- stop when the formatted-preview budget is reached
- return the displayed subset plus truncation metadata

This keeps the first slice fast enough without blocking future virtualization work.

## Verification Targets For Later Implementation

- Rust tests for CSV detection, quoted-field parsing, multiline fields, ragged rows, and truncation behavior
- Frontend tests for mode toggle behavior, raw/formatted rendering, and sticky table labels
- Mixed-stack tests that selecting a CSV file routes to the CSV preview kind and that reload refreshes both raw and formatted content

## Assumptions

- CSV support in this slice is read-only.
- The product continues to treat Markdown as the only editable document type.
- Delimiter auto-detection beyond normal CSV parsing is out of scope.
- Automatic first-row header inference remains out of scope; explicit header selection is supported.

## First-Row Header Options

### Issue And Reference Mapping

- Workflow mode: `issue-resolution`; execution: `codex-design-and-implement-review-loop-session-1`.
- Source: Step 1 intake, `comm-000002`, authoritative workflow title/body.
- Issue: "Allow CSV first-row header behavior to be toggled in preview and specified in open options". No issue number or URL was supplied; neither is inferred.
- Reference repository: `/Users/taco/gits/tacogips/chilla`, explicitly established by intake. The fallback `../../codex-agent` is not applicable.
- `AGENTS.md` governs same-directory work and mixed Rust/TypeScript implementation. `.agents/agents/rust-coding.md` and `.agents/agents/ts-coding.md` own their respective implementation tasks; `.agents/agents/check-and-test-after-modify.md` owns post-modification checks.
- `.agents/skills/ts-coding-standards/SKILL.md` governs typed UI state; `.agents/skills/tauri-development/SKILL.md` governs matching request/response contracts; `.agents/skills/chilla-post-edit-launch/SKILL.md` governs subsequent runtime launch verification.
- These are Codex development-process references, not a Cursor CLI product reference. No Cursor behavior, adapter, subprocess invocation, or intentional product divergence is introduced. Any future Cursor-specific integration must remain behind a separate adapter rather than entering CSV parsing or workspace state.

### Defaults And Lifetime

The boolean setting is named `csv_first_row_as_header` in file-open options and
`first_row_as_header` in CSV responses. Its default is **false**, preserving existing path-only opens.
A native checkbox labeled **Use first row as header** appears in the formatted
CSV pane header. It is keyboard focusable, toggles with Space, exposes its checked
state and a visible focus indicator, and introduces no new global shortcut.
The shared workspace Raw/Formatted control remains responsible only for view mode.

The workspace owns the setting for the active preview; the pane receives the
current value and change callback. Toggling is immediate and requires no IPC,
file read, parsing, file write, or metadata change. The checkbox remains usable
on an empty CSV. It is disabled if formatted output is unavailable; the workspace
continues to fall back to Raw in that case. A directly rendered failure pane must
also suppress the table. Raw mode need not display this checkbox.

| Event | Setting behavior |
|-------|------------------|
| New preview | Explicit open option, otherwise launch default, otherwise false |
| Raw/Formatted switch or theme refresh | Preserve active setting |
| Reload same active preview, including after a read failure | Preserve active setting, including changes made during the request |
| Select a different file, then return | Treat as a new preview; reinitialize from open/launch defaults |
| Open a new file or directory through a picker | Use launch default unless that open supplies an explicit value |
| Close/restart application | Discard active overrides; no disk/localStorage preference |
| Non-CSV or diff preview | Ignore CSV option; no header checkbox or parsing change |

The CLI sets a launch-wide initial default for each newly opened CSV, including
files selected later from a directory or explicit file set. A checkbox change
never changes this launch default. Capture the launch default separately from
replaceable browser-root context so picker navigation cannot silently reset it.
A normal Finder/no-option launch starts with false.

### Open Contract And Data Flow

1. `src-tauri/src/cli/mod.rs` parses `--csv-first-row-header=true|false` into typed startup open options, separate from `StartupTarget`. Use a startup request containing target and options in `CliParseOutcome::Run`, so both `parse_cli` and the executable retain the setting. `NormalizedCli` must not lose the option on the way to the run outcome. Existing target classification and verbose initialization retain their behavior.
2. `src-tauri/src/main.rs` passes that request to `src-tauri/src/lib.rs`; builder setup constructs `StartupContext` with an additional `file_open_options` object. `src-tauri/src/app_state.rs` retains the context for `get_startup_context`. Startup target resolution still owns path validation and canonicalization. Adapt internal callers and target-based verbose logging to access the request's target explicitly.
3. `src/lib/tauri/document.ts` normalizes startup `file_open_options` and exposes `openFilePreview(path, options?)`. `FileOpenOptions` contains optional `csv_first_row_as_header` on the wire. Startup uses this same options object. Top-level `file_open_options` absence defaults to false; accept `fileOpenOptions` as its camel-case alias, following the existing startup normalizer. If both are present, snake_case takes precedence, including explicit null. The nested field is canonically snake_case only.
4. Invoke `open_file_preview` with `{ path, options: { csv_first_row_as_header: true } }`, or the existing `{ path }`. `src-tauri/src/commands/document.rs` accepts optional typed options and passes the effective value through `src-tauri/src/viewer/service.rs`. Missing/null outer options or an omitted nested field resolve to false; a present nested value must be a JSON boolean (null, strings and numbers are rejected). Unknown nested fields are rejected to catch misspellings.
5. `src-tauri/src/viewer/types.rs` adds `first_row_as_header: boolean` to the CSV response as the resolved initial presentation value, including raw-only fallback responses. Non-CSV response variants remain unchanged. Backend defaults are false; it has no mutable global header preference. The workspace explicitly sends the launch default when no per-open boolean was supplied (including an empty options object); explicit false overrides true. A direct path-only invoke still resolves to false, independently of the launch default.
6. Frontend boundary handling validates new option/response fields at runtime rather than trusting an `invoke` generic. Legacy CSV responses missing the new field normalize to false; a present non-boolean fails with the existing user-facing load-error mechanism. Startup missing/null outer options use defaults; malformed present fields and unknown nested option fields fail similarly. Rust serialization and TypeScript fixtures cover identical snake_case shapes and defaults.
7. `WorkspaceShell.tsx` initializes active CSV state from an accepted response and passes it through `WorkspaceDocumentColumn.tsx` to `CsvFilePreviewPane.tsx`. Use the existing preview request identity to discard stale responses. Reload captures the current option for the request but must not overwrite a newer toggle when it resolves; preserve the active value for the same preview generation. A response for an older selection cannot change the new preview's content or setting.

The options field is `csv_first_row_as_header` because file-open options apply to
multiple formats; the CSV-only response field is `first_row_as_header`. This
mapping must be explicit in tests. No new command, permission, event, persisted
format, dependency, remote request, or shell execution is required.

### Record, Header And Count Invariants

Keep `src-tauri/src/viewer/csv.rs` header-neutral with `has_headers(false)` and
flexible record widths. `rows` always contains every retained source record,
including record 1. Do not enable parser header consumption or remove a record
in both backend and frontend. The open option affects response metadata only.

Let N be `rows.length` and H be 1 only when the active option is true and N > 0.
The table body uses records starting at H; its displayed data-row count is N-H.
With H=1, the first record supplies `<thead>` cells with `scope="col"`; record 1
is absent from `<tbody>`. Body row gutters retain source-record indices, starting
at 2 in header mode and 1 otherwise. These are parsed record indices, not physical
line numbers; a multiline quoted field is one record.

- Header text preserves quotes after CSV decoding, embedded newlines, whitespace, and duplicates. Render text nodes, never HTML, links, formulas, or Markdown.
- Empty or missing header cells display the numeric column index and have an accessible name such as `Column 3`. Existing nonempty duplicate labels remain duplicates; do not rename user data.
- Data rows continue to pad missing trailing fields as empty cells. Header width follows the same `column_count` as the body, including when later rows are wider.
- Empty CSV: no header record, zero body rows, visible `No CSV records` state, no invented data/header row. A one-record CSV with headers enabled shows its column headers, an empty body, and `No data rows`; disabling restores that record as data. Ignore blank physical lines exactly as the existing parser does.
- `displayed_row_count` continues to equal N; `total_row_count`, when present, counts all source records. Neither backend count changes on toggle. If UI displays data-row totals, subtract H from the retained count and subtract 1 from a known positive total in header mode; unknown totals remain unknown. Label source-record counts explicitly if displayed without that transformation.
- `row_count_status`, `truncated`, `formatted_available`, and `parse_error` remain independent of the option. Parse failure clears structured rows and retains raw fallback. The header option never makes an unavailable formatted view available.

### Bounds And Raw Fidelity

Keep the current parser budgets of 4,000 retained records and 120,000 retained
field values, including the header candidate. Header mode does not free budget,
request an additional record, or scan to calculate a full total. A truncated
first record supplies only its retained fields; missing labels follow the numeric
fallback rule. Preserve the existing conservative truncation marker at the row
limit, even if it happens to coincide with EOF; do not fabricate a known total.

`column_count` currently reflects full observed width even when fields are
shortened by the cell budget. Header mode must use the same table dimensions
as numeric mode and never generate extra columns from header text. Stored-cell
limits are not a guarantee about total padded DOM cells; improving that existing
wide/ragged-table limitation is outside this option feature. Include a wide-row
fixture to prove toggling does not expand the table or bypass the current limits.

Raw HTML and decoding remain exactly as produced today: optional UTF-8 BOM
removal, lossy UTF-8 with the existing notice, highlighting, source line breaks,
and file metadata. Header selection changes none of those bytes or fields.
Existing parser acceptance of quoting is unchanged; this feature does not add a
stricter validator. Preserve raw fallback for errors the parser actually reports.

### Acceptance And Verification Mapping

| Intake acceptance | Design obligation | Implementation verification |
|-------------------|-------------------|-----------------------------|
| Accessible toggle | Native labeled checkbox in formatted pane, focus and Space behavior | `src/features/preview/CsvFilePreviewPane.vitest.tsx`; keyboard and checked-state assertions |
| Semantic header on; numeric/all rows off | Header-neutral payload and derived table; no double removal | CSV component tests for both states, source gutters, empty/header-only, duplicate/blank labels |
| File-open initial value and compatible defaults | CLI startup request, startup options, typed IPC, response metadata | `src-tauri/src/cli/tests.rs`, viewer service tests, `src/lib/tauri/document.vitest.ts`, `src/lib/tauri/document-invoke.vitest.ts` |
| Preserve parsing and safety behavior | Mode-invariant records, counts, budgets, raw/fallback | `src-tauri/src/viewer/csv.rs` parser tests; `src-tauri/src/viewer/service/tests.rs` on/off equality except option metadata; component fixtures |
| Reload, selection, mixed-stack completion | Active state ownership and request identity; coordinated boundary rollout | `src/features/workspace/WorkspaceShell.vitest.tsx`, `src/features/workspace/WorkspaceHeader.vitest.tsx`, real app exercise |

Parser/service fixtures must include UTF-8 BOM, commas in quotes, escaped quotes,
multiline fields, ragged rows (header narrower and wider), empty source,
header-only source, truncation at row/cell limits, a shortened first record, and
an actual parser-error case. Service tests assert false/true preserve the same
raw HTML, rows, counts and fallback metadata. CLI tests cover omitted/true/false,
invalid/missing values, duplicate flags, interspersed flags, bare/directory/file/
file-set targets, non-CSV and diff targets, and information-only exits.
Workspace tests cover explicit false overriding a true launch default, new-file
reset, picker navigation, same-file reload, toggling during reload, stale responses,
failed reload/retry, and independent Raw/Formatted state.

After implementation use the existing tasks, recording complete foreground logs
and final exit statuses (these are future checks, not results of this design turn):

- `CARGO_TERM_QUIET=true mise run verify` (includes Cargo check/test/format/clippy plus Bun typecheck, lint, unit and DOM tests).
- Focused Rust: `CARGO_TERM_QUIET=true mise exec -- cargo test --manifest-path src-tauri/Cargo.toml viewer` and `CARGO_TERM_QUIET=true mise exec -- cargo test --manifest-path src-tauri/Cargo.toml cli`.
- Focused frontend: `mise exec -- bun run test:dom src/features/preview/CsvFilePreviewPane.vitest.tsx src/features/workspace/WorkspaceShell.vitest.tsx src/features/workspace/WorkspaceHeader.vitest.tsx src/lib/tauri/document.vitest.ts src/lib/tauri/document-invoke.vitest.ts`.
- Build: `CARGO_TERM_QUIET=true mise exec -- bun run tauri build --debug --no-bundle`.
- Launch: `target/debug/chilla --csv-first-row-header=true <csv-fixture-path>`, then verify toggle, Raw/Formatted, reload, and a second file; separately exercise false/default startup. Record actual fixture paths, commands, visible results, log paths, and termination status.

Riela owns app verification: use a foreground terminal session retained through
exit or an explicitly owned Riela service lifecycle. Do not use the background
launch example from the launch skill. A process launch alone does not prove UI
acceptance; record actual visible interactions or mark the verification blocked.
If nextest is chosen, also set `NEXTEST_STATUS_LEVEL=fail`,
`NEXTEST_FAILURE_OUTPUT=immediate-final`, and `NEXTEST_HIDE_PROGRESS_BAR=1`.

### Rollout, Review And Open Questions

Update Rust and TypeScript together, including all startup constructors, browser
fallback fixtures in `src/lib/tauri/document.ts`, and picker-created context in
`src/features/workspace/openFiles.ts`. Add only CSV control styling needed in
`src/app/App.css`; preserve workspace header shortcuts and existing pane focus
behavior. Update CLI help and `README.md` with default, scope, syntax, and examples;
`design-docs/specs/command.md` is the normative CLI companion.

Single design author and single implementation-plan author; independent design,
plan, implementation and adversarial review gates remain required. Step 2 does
not approve its own independent review or implement runtime behavior. Continue
on `main` in `/Users/taco/gits/tacogips/chilla`; no worktrees. Preserve intake's
pre-existing modifications, especially overlapping workspace files and README;
do not stage or commit unrelated work. Capture attributable diffs before later
commit stages. This feature adds no external command execution.

No unresolved user decisions remain: both open surfaces, false default, lifetime,
reload precedence, and empty/header-only behavior are selected above. The missing
issue URL/number is recorded metadata, not a blocker. No user-QA document is
needed unless independent review identifies a decision requiring user input.
Residual implementation risks are contract drift and reload races (covered by
boundary/state tests), overlap with existing workspace edits (covered by change
ownership review), and the pre-existing padded-table DOM limitation (unchanged).

## References

See `design-docs/references/README.md` for external references.

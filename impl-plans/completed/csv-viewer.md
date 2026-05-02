# CSV Viewer Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/design-csv-viewer.md`
**Created**: 2026-05-01
**Last Updated**: 2026-05-02

## Design Document Reference

**Primary Source**: `design-docs/specs/design-csv-viewer.md`

**Supporting Sources**:
- `design-docs/specs/design-file-viewer-mode.md#rust-file-classification`
- `design-docs/specs/design-file-viewer-mode.md#frontend-interaction-model`
- `design-docs/specs/architecture.md#csv-preview-architecture`
- `design-docs/specs/notes.md#file-viewer-mode-notes`

### Summary

Add first-class CSV preview support to file view mode. CSV files should classify as a typed `FilePreview::Csv`, keep raw source view available, and render a bounded formatted table from structured row/cell data.

### Scope

**Included**:
- `.csv` extension-first detection and `text/csv` MIME support
- Rust-owned CSV parsing with flexible record width
- bounded formatted payload with truncation / parse-status metadata
- raw/formatted presentation mode in the frontend
- semantic table rendering with numeric row and column labels
- tests for quoted fields, multiline fields, ragged rows, truncation, and mode switching

**Excluded**:
- CSV editing
- schema/header inference
- formulas, sorting, filtering, frozen panes, or spreadsheet workbook support
- delimiter auto-detection or user-configurable delimiter selection

## Modules And Contracts

### 1. Rust CSV Preview Types

#### `src-tauri/src/viewer/types.rs`

**Status**: COMPLETED

**Checklist**:
- [x] Add `CsvPreview` fields on `FilePreview::Csv` variant
- [x] Add `FilePreview::Csv`
- [x] Keep existing preview variants unchanged
- [x] Mirror the contract in `src/lib/tauri/document.ts`

### 2. Rust CSV Parser And Preview Service

#### `src-tauri/src/viewer/csv.rs`
#### `src-tauri/src/viewer/service.rs`
#### `src-tauri/Cargo.toml`

**Status**: COMPLETED

```rust
pub struct CsvPreviewLimits {
    pub max_rows: usize,
    pub max_cells: usize,
}

pub struct ParsedCsvPreview {
    pub rows: Vec<Vec<String>>,
    pub column_count: usize,
    pub displayed_row_count: usize,
    pub total_row_count: Option<usize>,
    pub truncated: bool,
    pub parse_error: Option<String>,
}

pub fn parse_csv_preview(source: &str, limits: CsvPreviewLimits) -> ParsedCsvPreview;

impl ViewerService {
    fn open_csv_preview(
        &self,
        path: &std::path::Path,
        mime_type: String,
        ui_theme: SyntaxUiTheme,
    ) -> AppResult<FilePreview>;
}
```

**Checklist**:
- [x] Add RFC 4180-capable parser dependency or implementation
- [x] Parse with flexible record width
- [x] Preserve quoted commas, escaped quotes, and multiline fields
- [x] Stop formatted parsing at explicit row/cell limits
- [x] Preserve raw highlighted preview using existing text-preview path

### 3. Frontend CSV Contract And Presentation State

#### `src/lib/tauri/document.ts`
#### `src/features/workspace/WorkspaceShell.tsx`

**Status**: COMPLETED

```ts
export interface CsvPreview {
  readonly kind: "csv";
  readonly path: string;
  readonly file_name: string;
  readonly mime_type: string;
  readonly raw_html: string;
  readonly rows: readonly (readonly string[])[];
  readonly column_count: number;
  readonly displayed_row_count: number;
  readonly total_row_count: number | null;
  readonly truncated: boolean;
  readonly formatted_available: boolean;
  readonly parse_error: string | null;
  readonly size_bytes: number;
  readonly last_modified: string;
}

export type DocumentPresentationMode = "raw" | "formatted";
```

**Checklist**:
- [x] Add CSV preview union member
- [x] Generalize Markdown-specific presentation state where needed
- [x] Keep `Shift+P` as the shared two-state toggle
- [x] Use labels `Raw` / `Formatted` for CSV (icons match Markdown raw/preview controls)
- [x] Keep TOC inactive for CSV

### 4. Frontend CSV Preview Component

#### `src/features/preview/CsvFilePreviewPane.tsx`
#### `src/app/App.css`

**Status**: COMPLETED

```ts
export interface CsvFilePreviewPaneProps {
  readonly preview: Extract<FilePreview, { kind: "csv" }>;
  readonly presentationMode: DocumentPresentationMode;
  readonly colorScheme: ColorScheme;
  readonly subtitle: string;
}

export function CsvFilePreviewPane(
  props: CsvFilePreviewPaneProps,
): JSX.Element;
```

**Checklist**:
- [x] Render raw mode from `raw_html`
- [x] Render formatted mode as semantic table DOM
- [x] Use numeric column labels and row labels
- [x] Pad ragged rows to `column_count`
- [x] Render cells as text, not HTML
- [x] Show parse error or truncation notices inline

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Rust CSV types | `src-tauri/src/viewer/types.rs` | COMPLETED | Cargo |
| Rust CSV parser/service | `src-tauri/src/viewer/csv.rs`, `src-tauri/src/viewer/service.rs` | COMPLETED | Cargo |
| Frontend contract/state | `src/lib/tauri/document.ts`, `src/features/workspace/WorkspaceShell.tsx` | COMPLETED | Bun |
| CSV preview component | `src/features/preview/CsvFilePreviewPane.tsx`, `src/app/App.css` | COMPLETED | Bun + Vitest |

## Implementation Tasks

### TASK-001: Backend CSV Contract And Detection
**Status**: COMPLETED
**Parallelizable**: No
**Deliverables**: `src-tauri/src/viewer/types.rs`, `src-tauri/src/viewer/service.rs`, `src-tauri/Cargo.toml`

**Completion Criteria**:
- [x] `.csv` extension maps to CSV before generic text fallback
- [x] `text/csv` MIME maps to CSV preview
- [x] `FilePreview::Csv` serializes with `kind: "csv"`

### TASK-002: Backend CSV Parsing And Limits
**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: `TASK-001`
**Deliverables**: `src-tauri/src/viewer/csv.rs`, `src-tauri/src/viewer/service.rs`

**Completion Criteria**:
- [x] quoted commas, escaped quotes, multiline cells, and ragged rows are handled
- [x] row/cell limits produce truncation metadata
- [x] parse failures keep raw preview available with `formatted_available: false` (payload path; the `csv` crate rarely surfaces hard parse errors for typical inputs)

### TASK-003: Frontend Contract And Mode Control
**Status**: COMPLETED
**Parallelizable**: Yes
**Depends On**: `TASK-001`
**Deliverables**: `src/lib/tauri/document.ts`, `src/features/workspace/WorkspaceShell.tsx`

**Completion Criteria**:
- [x] TypeScript preview union includes CSV
- [x] raw/formatted mode uses shared `Shift+P` behavior
- [x] CSV never opens editor or TOC behavior

### TASK-004: CSV Table Rendering UI
**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: `TASK-002`, `TASK-003`
**Deliverables**: `src/features/preview/CsvFilePreviewPane.tsx`, `src/app/App.css`

**Completion Criteria**:
- [x] raw view renders the raw highlighted source
- [x] formatted view renders table cells as text nodes
- [x] row/column labels are numeric
- [x] truncation and parse-status messages are visible

### TASK-005: Verification
**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: `TASK-004`
**Deliverables**: backend and frontend tests

**Completion Criteria**:
- [x] `bun run typecheck` passes
- [x] `bun run test` passes
- [x] `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml` passes
- [x] `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml` passes
- [x] `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` passes
- [x] `bun run test:dom` full suite

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| TASK-002 backend parser | TASK-001 | DONE |
| TASK-003 frontend mode control | TASK-001 | DONE |
| TASK-004 CSV table rendering | TASK-002, TASK-003 | DONE |
| TASK-005 verification | TASK-004 | DONE |

## Completion Criteria

- [x] CSV files classify as `FilePreview::Csv`
- [x] raw source view remains available for every readable CSV file
- [x] formatted view renders structured rows within explicit safety limits
- [x] CSV content is rendered as text and not interpreted as HTML
- [x] no header/schema inference is applied
- [x] listed Bun scripts and Cargo commands used in TASK-005 pass including full `test:dom` suite

## Progress Log

### Session: 2026-05-01 17:37 JST
**Tasks Completed**: Created implementation plan from the CSV viewer design.
**Tasks In Progress**: None
**Blockers**: None
**Notes**: This plan is split from `file-viewer-mode.md` because CSV preview has independent parser, payload, UI, and verification work.

### Session: 2026-05-01 (implementation)
**Tasks Completed**: TASK-001 through TASK-005 (delivery + Vitest coverage including `CsvFilePreviewPane`; full `test:dom` passes).
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Backend uses `csv` crate with row/cell caps; MIME `text/csv` is detected ahead of generic `text/*`; `.csv` removed from generic text-extension fallback list so CSV always uses the typed path.

### Session: 2026-05-01 (verification follow-up)
**Notes**: Confirmed `bun run test:dom` passes repo-wide; TASK-005 checklist updated accordingly.

### Review Feedback: 2026-05-01
**Finding**: `src-tauri/src/viewer/csv.rs` applies `max_cells` only after pushing the full row into the returned preview payload. A single very wide CSV record can therefore return far more than the intended cell budget and still render an oversized table in `CsvFilePreviewPane`.
**Required Follow-Up**:
- [x] Enforce `CsvPreviewLimits.max_cells` before appending cells that would exceed the budget, or cap the returned row contents explicitly.
- [x] Add a regression where one record exceeds `max_cells` and the returned payload never exceeds the configured cell budget.

### Review Feedback: 2026-05-01 (current git diff)
**Finding**: The staged implementation still has the CSV cell-budget issue. In `src-tauri/src/viewer/csv.rs`, `parse_csv_preview` builds a complete `row_strings`, increments `cell_total`, pushes the full row, and only then marks truncation when `cell_total > limits.max_cells`. The current `parse_truncates_at_cell_limit` test also encodes the unsafe behavior by expecting 4 returned cells with `max_cells: 3`.
**Required Follow-Up**:
- [x] Change the parser so returned `rows.iter().map(Vec::len).sum::<usize>() <= limits.max_cells` for every nonzero cell limit.
- [x] Update `parse_truncates_at_cell_limit` to assert the returned payload is capped, not just flagged as truncated.
- [x] Add a single-record wide-row regression because that is the path most likely to bypass the intended table-size bound.

**Review Verification**: `bun run typecheck`, `bun run test`, `bun run test:dom`, `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml`, and `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` passed during review. Linux WebDriver E2E was not re-run in this review.

### Session: 2026-05-02 (cell budget hardening)
**Tasks Completed**: `parse_csv_preview` now respects `max_cells` per row (truncate within a wide record), `CsvPreviewLimits` derives `Copy`, added `parse_truncates_wide_row_at_cell_budget` + `cell_total_never_exceeds_max_cells` tests; `cargo test`, `cargo clippy -D warnings`, `bun run typecheck`, `bun run test`, `bun run test:dom` all passing.
**Notes**: Review Feedback follow-ups marked complete. Phase 2 mixed-stack validation is archived as `impl-plans/completed/file-view-mixed-stack-validation.md`.

### Review Feedback: 2026-05-01 (post-hardening diff review)
**Finding**: `src-tauri/src/viewer/csv.rs` now caps returned row contents to `CsvPreviewLimits.max_cells`, but it still reports `column_count` from the full physical record width. `src/features/preview/CsvFilePreviewPane.tsx` pads every rendered row to `column_count`, so one very wide record can still create an oversized formatted table even when `rows` was truncated to the cell budget.
**Required Follow-Up**:
- [ ] Bound the formatted-table column count separately from the source record width, or expose both `source_column_count` and `display_column_count` so rendering uses the bounded display value.
- [ ] Add a frontend regression where `rows` contains fewer cells than an oversized `column_count` and formatted rendering does not allocate/pad beyond the intended preview budget.
- [ ] Add a backend regression asserting the serialized CSV preview metadata cannot cause the frontend to render more cells than `CsvPreviewLimits.max_cells`.

### Session: 2026-05-01 (git alignment)
**Notes**: Staged previously untracked CSV viewer artifacts (`design-csv-viewer.md`, `viewer/csv.rs`, `CsvFilePreviewPane`, `documentRefreshDecision`, completed impl-plan moves from `active/`). Re-ran `cargo test`, `cargo clippy -D warnings`, `bun run typecheck`, `bun run test`, `bun run test:dom`; all passing.

### Review Feedback: 2026-05-01 (full worktree diff review)
**Finding**: The current parser marks `truncated = true` immediately after pushing the row that reaches `CsvPreviewLimits.max_rows`. A CSV with exactly the row limit and no additional records is therefore reported as truncated and gets `total_row_count: None`, which produces a false truncation notice in the formatted preview.
**Required Follow-Up**:
- [ ] Only set row-limit truncation after observing that another record exists beyond `max_rows`, or otherwise distinguish "exactly at limit" from "more rows omitted".
- [ ] Add a backend regression where the input has exactly `max_rows` records and asserts `truncated == false` plus `total_row_count == Some(max_rows)`.
- [ ] Keep the existing over-limit regression so `max_rows + 1` records still reports truncation.

**Review Verification**: Reviewed both staged and unstaged diffs against `HEAD`. Re-ran `bun run typecheck`, `bun run test`, `bun run test:dom`, `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml`, and `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`; all passed. Linux WebDriver E2E was not re-run in this review.

## Related Plans

- **Depends On**: `impl-plans/completed/file-viewer-mode.md`
- **Previous**: `impl-plans/completed/file-viewer-mode.md`

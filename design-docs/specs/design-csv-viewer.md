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

### Raw View

Raw view is the source-oriented representation of the file.

- It shows the CSV file contents using the existing text-preview styling pipeline.
- The text is read-only.
- Line breaks, quoting, delimiter placement, and escaped characters remain visible exactly as stored after decoding.
- This view is the fallback-safe mode and remains available even when formatted parsing fails.

### Formatted View

Formatted view renders CSV records as a table.

- The table is read-only.
- The top sticky row shows column indices (`1`, `2`, `3`, ...), not inferred field names.
- A left sticky gutter shows record indices (`1`, `2`, `3`, ...).
- Each parsed field is rendered as plain text inside an individual cell.
- Multiline field content wraps inside the cell with preserved newlines.
- Horizontal overflow scrolls within the document pane rather than stretching the whole workspace.

### Why The First Row Is Not Treated As A Header

The first slice must not guess whether row 1 is schema or data.

Reasoning:

- Many CSV files have header rows, but not all do.
- Guessing wrong changes data meaning.
- Numeric column labels preserve fidelity without forcing heuristics.

Header inference or a user toggle such as "Use first row as header" can be added later as a separate feature.

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
- `column_count` is the maximum parsed column width across the displayed rows.
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
- Column-number header row remains visible while vertically scrolling.
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
- First-row header inference is intentionally deferred.

## References

See `design-docs/references/README.md` for external references.

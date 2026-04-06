# EPUB Navigation And Location Persistence Design

Detailed design for adding EPUB-native table-of-contents navigation and durable reading-position restore to the file viewer.

## Overview

The current EPUB support can render and paginate a book, but it still behaves like a plain HTML dump in two important ways:

- the workspace does not expose the EPUB table of contents
- the reader does not restore the last reading location after reload or reopen

This design adds a Foliate-style navigation model:

- Rust extracts a structured EPUB TOC tree from the archive
- the frontend shows that tree in the same left-side TOC slot used by Markdown
- the reader navigates and restores by logical destinations (`href` or anchor), not by raw page index

The key architectural choice is to persist an anchor-based locator instead of a page number. Foliate's paginator is also anchor-driven: it treats pagination as a layout concern and keeps the reading location attached to a destination that survives resizing and repagination. That is the correct model for `chilla` as well because page numbers in CSS multi-column layout are not stable across viewport, font, or theme changes.

## Goals

- Parse EPUB 3 navigation documents and EPUB 2 NCX tables of contents.
- Show EPUB TOC entries in the existing workspace TOC slot.
- Reuse the Markdown TOC toggle keymap for EPUB:
  - `Shift+T` toggles the TOC pane
  - selecting a TOC item navigates the reader
- Keep the active TOC item synchronized with the current reading location.
- Persist reading location across:
  - page turns
  - file reload
  - reopening the same file later
- Restore the reading location after the EPUB preview reloads and repaginates.

## Non-Goals

- EPUB CFI support
- annotations, bookmarks, highlights, or search
- cross-device sync
- backend-owned reader-session persistence
- a continuous-scroll EPUB mode

## Current Constraints

- `src-tauri/src/viewer/epub.rs` currently returns only rendered HTML.
- `FilePreview::Epub` contains no TOC or locator metadata.
- `EpubPreviewPane` tracks only a page index derived from viewport geometry.
- The workspace TOC pane is Markdown-only today.
- Intra-book fragment handling is not yet strong enough to serve as a durable relocation format.

## Reference Model

Foliate JS exposes three ideas worth copying:

1. the book model exposes a TOC tree
2. navigation is expressed as `href` resolution, not as page numbers
3. pagination keeps an internal anchor so the visible location survives layout changes

In `chilla`, that translates to:

- Rust owns EPUB TOC parsing and href normalization
- the frontend persists a normalized logical locator
- the paginated reader restores by locator after every render or repagination

## TOC Data Model

The EPUB TOC tree should be represented explicitly instead of trying to overload Markdown heading metadata.

Each item needs:

- `label`: display text
- `href`: normalized EPUB-internal target such as `chapter-03.xhtml#sorting`
- `anchor_id`: rewritten DOM anchor that the frontend can scroll to directly
- `children`: nested TOC entries

`anchor_id` is backend-authored so the frontend does not need to reverse-engineer chapter/fragment rewrite rules.

## Locator Data Model

Reading position should be stored as a logical locator:

```text
EpubLocator
- href
- progression?
```

Rules:

- `href` is the primary restore key.
- `progression` is a fallback fraction within the resolved target when the target spans more than one rendered page.
- raw page index is never persisted.

Examples:

- `Text/cover.xhtml`
- `Text/chapter-04.xhtml#merge-sort`
- `Text/chapter-04.xhtml#merge-sort` with `progression = 0.35`

## Backend Design

### TOC Extraction

Rust extends EPUB parsing in this order:

1. EPUB 3 nav document
2. EPUB 2 NCX
3. synthesized fallback TOC from the spine when neither exists

### Href Normalization

All TOC hrefs are normalized relative to the package document and rewritten against the rendered DOM.

Normalization rules:

- external URLs are excluded from the in-book TOC tree
- chapter-only destinations resolve to the rendered chapter section
- chapter-plus-fragment destinations resolve to a stable rewritten fragment anchor
- malformed or unresolved TOC items are skipped instead of aborting the whole preview

### Stable Fragment Anchors

The current chapter wrapper id is sufficient only for chapter-level navigation. TOC navigation and durable restoration require stable fragment targets inside the chapter body as well.

Backend rendering therefore needs a deterministic rewrite strategy:

- preserve existing EPUB fragment ids semantically
- rewrite them into DOM-safe ids that are unique across the whole rendered book
- rewrite internal links and TOC items to those rewritten ids

Example shape:

```text
epub-chapter-text-chapter-04-xhtml
epub-frag-text-chapter-04-xhtml-merge-sort
```

The exact string format is not user-visible, but it must be deterministic.

## Frontend Design

### TOC Pane Behavior

The workspace TOC slot becomes format-aware instead of Markdown-only.

Behavior:

- Markdown keeps the existing heading tree behavior.
- EPUB uses the same pane slot, the same `Shift+T` toggle, and the same basic tree interaction pattern.
- EPUB TOC items do not show Markdown line numbers.

The simplest frontend shape is a generic navigation-pane model with optional metadata labels, allowing both Markdown headings and EPUB TOC items to share one component shell.

### Reader Navigation

`EpubPreviewPane` accepts an optional initial locator and can navigate to:

- chapter start
- rewritten fragment anchor
- stored fallback progression within the target

The reader emits relocation updates whenever the visible location changes enough to produce a stable logical target.

### Active TOC Synchronization

The active TOC item should be derived from the current logical location, not from the current page number.

Resolution strategy:

1. exact `href` match
2. closest ancestor item for nested fragments
3. chapter-level item fallback

## Persistence Ownership

Reading-position persistence is frontend-owned and stored in `localStorage`, keyed by canonical file path.

Rationale:

- the repo already uses `localStorage` for lightweight per-user UI persistence
- no new Tauri command is required just to remember the last EPUB location
- the persisted value is a view concern rather than canonical document data

Storage shape:

```text
chilla-epub-location:<canonical_path>
{
  href,
  progression?,
  updatedAtUnixMs
}
```

## Reload And Reopen Behavior

### Reload

On file reload:

1. the workspace keeps the stored locator for the active EPUB path
2. the preview re-renders and repaginates
3. the reader restores to the stored locator after enhancement/layout completes

### Reopen

On reopening the same EPUB later:

1. `open_file_preview` returns the HTML and TOC
2. the workspace loads any stored locator for that canonical path
3. the reader restores to that locator after mount

### Failure Handling

If the stored locator no longer resolves:

1. try the chapter portion of the href
2. try stored progression within the chapter
3. fall back to page 1

Failure to restore must not block the preview from opening.

## Keyboard Model

The EPUB TOC keymap should match Markdown's TOC model at the workspace level.

Required parity:

- `Shift+T` toggles the TOC pane when an EPUB is open
- TOC selection navigates the reader the same way Markdown TOC selection navigates the preview
- existing EPUB page-turn keys remain unchanged:
  - `J`
  - `K`
  - `ArrowUp`
  - `ArrowDown`
  - `Ctrl+U`
  - `Ctrl+D`

No EPUB-only TOC shortcut should be introduced in this slice.

## Tauri Boundary

No new Tauri command is required.

Existing command change:

- `open_file_preview` extends the EPUB payload with TOC metadata

The reading locator remains frontend-local and is not sent over IPC in this slice.

## Verification Strategy

### Rust

- nav-document parse regression
- NCX fallback regression
- synthesized-spine fallback regression
- href normalization and fragment-anchor rewrite regression

### Frontend DOM

- TOC pane renders EPUB items without Markdown line metadata
- selecting an EPUB TOC item dispatches navigation correctly
- stored locator saves and reloads from `localStorage`
- reader restores location after rerender

### Desktop Runtime

- open a real EPUB with a nested TOC
- toggle the TOC with `Shift+T`
- click a TOC item and verify relocation
- reload the same file and verify location restoration
- reopen the same EPUB and verify persisted restoration

## Scope Boundaries

**Included**:

- EPUB TOC parsing and rendering
- href/anchor normalization needed for TOC and restore
- same workspace TOC toggle behavior as Markdown
- frontend-owned persisted locator

**Excluded**:

- CFI generation or parsing
- per-book bookmarks/history UI
- Rust-side persisted session database

## References

See `design-docs/references/README.md` for external references, especially Foliate / Foliate JS as the navigation and relocation reference model.

# EPUB Navigation And Location Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/design-epub-navigation.md`
**Created**: 2026-04-06
**Last Updated**: 2026-04-06

---

## Design Document Reference

**Source**: `design-docs/specs/design-epub-navigation.md`

### Summary

Add EPUB-native TOC parsing, workspace TOC integration, and last-reading-location restore based on logical href anchors rather than page numbers.

### Scope

**Included**:
- Rust-side EPUB TOC extraction and href normalization
- DOM-stable fragment anchor rewriting for EPUB chapters
- frontend TOC integration for EPUB using the Markdown TOC slot and toggle
- frontend-owned persisted EPUB location store
- runtime verification for TOC navigation and location restore

**Excluded**:
- EPUB CFI support
- bookmarks, highlights, and annotations
- Rust-side persisted reader sessions

---

## Modules

### 1. EPUB Viewer Contract

#### `src-tauri/src/viewer/types.rs`

**Status**: COMPLETED

```rust
#[derive(Debug, Clone, Serialize)]
pub struct EpubNavigationItem {
    pub label: String,
    pub href: String,
    pub anchor_id: String,
    pub children: Vec<EpubNavigationItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FilePreview {
    Epub {
        path: String,
        file_name: String,
        mime_type: String,
        html: String,
        toc: Vec<EpubNavigationItem>,
        last_modified: String,
    },
}
```

**Checklist**:
- [x] Define `EpubNavigationItem`
- [x] Extend `FilePreview::Epub` with `toc`
- [x] Keep serde output aligned with TypeScript

### 2. EPUB Parser And Anchor Rewriter

#### `src-tauri/src/viewer/epub.rs`

**Status**: COMPLETED

```rust
#[derive(Debug)]
pub struct RenderedEpub {
    pub html: String,
    pub toc: Vec<EpubNavigationItem>,
}

pub fn render_epub(path: &Path) -> AppResult<RenderedEpub>;

fn parse_navigation_document(
    archive: &mut ZipArchive<File>,
    epub_path: &Path,
    package: &EpubPackage,
) -> AppResult<Vec<EpubNavigationItem>>;

fn parse_ncx_document(
    archive: &mut ZipArchive<File>,
    epub_path: &Path,
    package: &EpubPackage,
) -> AppResult<Vec<EpubNavigationItem>>;

fn synthesize_spine_navigation(
    chapter_documents: &[RenderedChapter],
) -> Vec<EpubNavigationItem>;

fn rewrite_fragment_id(chapter_path: &str, fragment_id: &str) -> String;
```

**Checklist**:
- [x] Parse EPUB 3 nav documents
- [x] Fallback to NCX when nav document is absent
- [x] Fallback to synthesized spine TOC when both are absent
- [x] Rewrite fragment ids into deterministic book-wide DOM anchors
- [x] Rewrite TOC hrefs and internal links to those anchors
- [x] Add parser regressions for nav, NCX, and fallback paths

### 3. Frontend EPUB Contract And Location Store

#### `src/lib/tauri/document.ts`
#### `src/lib/epub-location.ts`

**Status**: COMPLETED

```ts
export interface EpubNavigationItem {
  readonly label: string;
  readonly href: string;
  readonly anchor_id: string;
  readonly children: readonly EpubNavigationItem[];
}

export interface EpubLocator {
  readonly href: string;
  readonly progression: number | null;
}

export interface StoredEpubLocation extends EpubLocator {
  readonly updated_at_unix_ms: number;
}

export function loadStoredEpubLocation(path: string): StoredEpubLocation | null;
export function saveStoredEpubLocation(
  path: string,
  location: StoredEpubLocation,
): void;
export function clearStoredEpubLocation(path: string): void;
```

**Checklist**:
- [x] Add EPUB TOC and locator types
- [x] Add localStorage-backed location helpers
- [x] Keep storage keyed by canonical file path

### 4. Workspace Navigation Integration

#### `src/features/workspace/WorkspaceShell.tsx`
#### `src/features/toc/TocPane.tsx`

**Status**: COMPLETED

```ts
interface NavigationItem {
  readonly title: string;
  readonly anchorId: string;
  readonly children: readonly NavigationItem[];
  readonly metaLabel?: string;
}

function epubTocToNavigationItems(
  toc: readonly EpubNavigationItem[],
): readonly NavigationItem[];
```

**Checklist**:
- [x] Show EPUB TOC in the existing TOC slot
- [x] Reuse `Shift+T` toggle behavior for EPUB
- [x] Hide Markdown line metadata for EPUB items
- [x] Track the active EPUB TOC item from reader relocation updates

### 5. Paginated Reader Restore And Relocation

#### `src/features/preview/EpubPreviewPane.tsx`

**Status**: COMPLETED

```ts
interface EpubPreviewPaneProps {
  readonly html: string;
  readonly toc: readonly EpubNavigationItem[];
  readonly initialLocator: EpubLocator | null;
  readonly visible: boolean;
  readonly documentPath: string | null;
  readonly colorScheme: ColorScheme;
  readonly subtitle?: string;
}

export const EPUB_PAGINATION_STEP_EVENT = "chilla:epub-page-step";
export const EPUB_GO_TO_HREF_EVENT = "chilla:epub-go-to-href";
export const EPUB_RELOCATE_EVENT = "chilla:epub-relocate";
```

**Checklist**:
- [x] Accept an initial locator and restore after render/repagination
- [x] Navigate directly to TOC href targets
- [x] Emit relocation events with logical href and progression
- [x] Persist location on page-turn and TOC navigation
- [x] Keep page index ephemeral

### 6. Verification

#### `src/features/preview/EpubPreviewPane.vitest.tsx`
#### `tests/tauri/epub-pagination.e2e.ts`
#### `tests/tauri/epub-toc-location.e2e.ts`

**Status**: COMPLETED

```text
Verification targets:
- bun run typecheck
- bun run test
- bun run test:dom
- CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml
- CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
- CARGO_TERM_QUIET=true bun run tauri build --debug --no-bundle
```

**Checklist**:
- [x] DOM tests cover EPUB TOC rendering and locator restore
- [x] Rust tests cover TOC parsing and href normalization
- [x] Desktop E2E covers TOC navigation and restore after reopen/reload

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| EPUB viewer contract | `src-tauri/src/viewer/types.rs` | COMPLETED | `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml` |
| EPUB parser and anchor rewriter | `src-tauri/src/viewer/epub.rs` | COMPLETED | `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml` |
| Frontend EPUB contract and storage | `src/lib/tauri/document.ts`, `src/lib/epub-location.ts` | COMPLETED | `bun run typecheck`, `bun run test:dom` |
| Workspace TOC integration | `src/features/workspace/WorkspaceShell.tsx`, `src/features/toc/TocPane.tsx` | COMPLETED | `bun run typecheck`, `bun run test:dom` |
| Reader restore and relocation | `src/features/preview/EpubPreviewPane.tsx` | COMPLETED | `bun run typecheck`, `bun run test:dom`, desktop E2E |
| Verification | `tests/tauri/epub-toc-location.e2e.ts` and related tests | COMPLETED | Cargo + Bun + Tauri |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Frontend EPUB contract and storage | EPUB viewer contract | COMPLETED |
| Workspace TOC integration | EPUB viewer contract, reader restore and relocation | COMPLETED |
| Reader restore and relocation | EPUB parser and anchor rewriter, frontend EPUB contract and storage | COMPLETED |
| Verification | All prior tasks | COMPLETED |

## Completion Criteria

- [x] `open_file_preview` returns EPUB TOC metadata
- [x] EPUB TOC renders in the same workspace TOC slot as Markdown
- [x] `Shift+T` toggles the TOC for EPUBs
- [x] TOC item selection navigates the paginated reader
- [x] Active TOC item follows the current reading location
- [x] EPUB reading position restores after reload
- [x] EPUB reading position restores after reopening the same file
- [x] All Rust, Bun, and desktop verification steps pass

## Progress Log

### Session: 2026-04-06 07:35
**Tasks Completed**: Created the design document and the implementation plan for EPUB TOC integration and href-based reading-location restore.
**Tasks In Progress**: Rust and frontend implementation.
**Blockers**: None
**Notes**: The design locked in a Foliate-style locator model based on normalized href targets rather than persisted page numbers.

### Session: 2026-04-06 07:55
**Tasks Completed**: Implemented Rust EPUB TOC extraction, NCX and synthesized-spine fallback, fragment-anchor rewriting, frontend TOC integration, localStorage-backed location persistence, paginated restore logic, DOM tests, Rust regressions, and desktop E2E coverage.
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Verification passed with `bun run typecheck`, `bun run test`, `bun run test:dom`, `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml`, `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`, `CARGO_TERM_QUIET=true bun run tauri build --debug --no-bundle`, and `bun run tests/tauri/epub-toc-location.e2e.ts` against `/home/taco/Downloads/40_Algorithms_Every_Programmer_Should_Know.epub`.

## Related Plans

- **Previous**: `impl-plans/completed/file-viewer-mode.md`
- **Next**: -
- **Depends On**: `design-docs/specs/design-epub-navigation.md`

### Session: 2026-04-06
**Tasks Completed**: Created design doc and implementation plan for EPUB TOC integration and location persistence
**Tasks In Progress**: None
**Blockers**: None
**Notes**: The design deliberately persists logical href locators instead of page numbers because page numbers are unstable under the current CSS multi-column pagination model.

## Related Plans

- **Previous**: `impl-plans/completed/file-viewer-mode.md`
- **Next**: None
- **Depends On**: `impl-plans/completed/file-viewer-mode.md`

# HEIC Image Display Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/architecture.md#heic--heif-image-display-architecture`
**Created**: 2026-05-27
**Last Updated**: 2026-05-27

---

## Design Document Reference

**Primary Source**: `design-docs/specs/architecture.md#heic--heif-image-display-architecture`

**Codex-Agent References**:
- `AGENTS.md`
- `.agents/skills/tauri-development/SKILL.md`
- `.agents/skills/chilla-post-edit-launch/SKILL.md`

### Summary

Extend existing Markdown preview and file-view image preview flows so `.heic`, `.heif`, `.heics`, and `.heifs` local images can be resolved and displayed when supported, with a clear fallback when WebView or backend decoding cannot render the image.

### Scope

**Included**:
- Rust-owned HEIC/HEIF extension-to-MIME classification for file previews.
- Markdown embedded-image source resolution and load-error fallback for HEIC/HEIF resources.
- Direct file-view preview behavior for HEIC/HEIF assets through existing image preview contracts.
- Tests for Rust classification/routing and Solid.js resource resolution/fallback presentation.
- User-facing documentation refresh or explicit no-docs-needed decision for HEIC/HEIF support.
- Bun, Cargo, and runtime launch verification.

**Excluded**:
- HEIF sequence navigation beyond rendering the primary frame if conversion becomes necessary.
- Persistent converted files or source image mutation.
- New HEIC-only Tauri commands unless implementation discovery proves the existing preview contracts cannot carry the fallback state.
- Broad image pipeline refactors unrelated to HEIC/HEIF.

### Intentional Divergences

- No external Codex reference implementation is available; this plan traces only to repository workflow and accepted design references.
- Direct WebView display should be attempted only if verified. Backend conversion is a conditional task, not a default dependency addition.

---

## Modules And Contracts

### 1. Rust Preview Classification

#### `src-tauri/src/viewer/service.rs`

**Status**: COMPLETED

Required contracts:
- Extend image MIME fallback coverage for `heic`, `heif`, `heics`, and `heifs`.
- Keep existing raster image support unchanged for APNG, GIF, JPEG, PNG, and WebP.
- Add focused unit tests for `fallback_media_mime_type` and `open_file_preview` routing to `FilePreview::Image`.

Relevant signatures and constants:
- `const IMAGE_EXTENSION_MIME_TYPES: [(&str, &str); N]`
- `fn fallback_media_mime_type<'a>(path: &Path, detected_mime_type: &'a str) -> Option<&'a str>`
- `pub fn open_file_preview(&self, path: &Path, ui_theme: SyntaxUiTheme) -> AppResult<FilePreview>`

### 2. File Preview Contract Review

#### `src-tauri/src/viewer/types.rs`
#### `src/lib/tauri/document.ts`
#### `src/features/workspace/WorkspaceShell.tsx`

**Status**: COMPLETED

Required contracts:
- Prefer the existing `FilePreview::Image` / `kind: "image"` shape when direct display is viable.
- Add a minimal fallback field or variant only if the existing `html` plus frontend load-error handling cannot represent failed HEIC rendering clearly.
- Preserve current PDF, EPUB, CSV, video, audio, text, and binary preview behavior.

Relevant contracts:
- Rust: `FilePreview::Image { path, file_name, mime_type, html, last_modified }`
- TypeScript: `FilePreview` union member with `readonly kind: "image"`
- Workspace rendering branch that selects the file-preview pane for `kind: "image"`

### 3. Markdown Resource Resolution And Fallback

#### `src/features/preview/preview-assets.ts`
#### `src/features/preview/PreviewPane.tsx`
#### `src/features/preview/preview-assets.test.ts`
#### `src/features/preview/PreviewPane.vitest.tsx`

**Status**: COMPLETED

Required contracts:
- Resolve HEIC/HEIF Markdown image paths through the existing local resource path pipeline.
- Preserve query/hash suffix behavior for resolved local images.
- Surface image load failure in the preview DOM with a clear fallback and open-in-default-app affordance where practical.
- Keep default browser URLs and non-local schemes unchanged.

Relevant signatures:
- `export function shouldResolveLocalResource(value: string): boolean`
- `export async function resolveDocumentResourceUrl(resourcePath: string, documentPath: string | null, pathApi: PreviewPathApi): Promise<string | null>`
- `async function enhancePreviewMedia(container: HTMLElement, documentPath: string | null)`

### 4. Optional Backend Conversion

#### `src-tauri/src/viewer/service.rs`
#### `src-tauri/Cargo.toml`
#### `src-tauri/src/media_stream.rs` or existing local asset URL path

**Status**: NOT_NEEDED

Required contracts if direct WebView decode is insufficient:
- Select a conversion path only after checking platform/WebView behavior and dependency impact.
- Bound conversion by file size, decoded pixels, and memory use before loading full image data.
- Treat converted output as transient runtime preview data; never overwrite source files.
- Keep generated preview URLs local to the app runtime and within existing filesystem exposure constraints.
- Run supply-chain review before adding any decoder/converter dependency.

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Rust HEIC/HEIF classification | `src-tauri/src/viewer/service.rs` | COMPLETED | Cargo unit tests |
| File preview contract review | `src-tauri/src/viewer/types.rs`, `src/lib/tauri/document.ts`, `src/features/workspace/WorkspaceShell.tsx` | COMPLETED | Cargo + Bun |
| Markdown image fallback | `src/features/preview/PreviewPane.tsx`, `src/features/preview/preview-assets.ts` | COMPLETED | Bun + Vitest |
| Optional conversion path | `src-tauri/src/viewer/service.rs`, `src-tauri/Cargo.toml`, media/local asset serving files | NOT_IMPLEMENTED | Runtime launch + fallback coverage |

## Implementation Tasks

### TASK-001: Rust HEIC/HEIF Image Classification
**Status**: COMPLETED
**Parallelizable**: Yes
**Deliverables**: `src-tauri/src/viewer/service.rs`

**Completion Criteria**:
- [x] `.heic`, `.heif`, `.heics`, and `.heifs` infer standards-based image MIME labels.
- [x] `open_file_preview` returns image previews for HEIC/HEIF paths when detected MIME is generic.
- [x] Existing image, media, text, CSV, PDF, EPUB, and binary tests remain valid.
- [x] Cargo unit tests cover extension normalization and routing.

### TASK-002: Frontend Markdown Image Resolution And Error Fallback
**Status**: COMPLETED
**Parallelizable**: Yes
**Deliverables**: `src/features/preview/preview-assets.ts`, `src/features/preview/PreviewPane.tsx`, `src/features/preview/preview-assets.test.ts`, `src/features/preview/PreviewPane.vitest.tsx`

**Completion Criteria**:
- [x] HEIC/HEIF image sources resolve like other local Markdown image resources.
- [x] Image load failures render a visible fallback instead of leaving a broken image only.
- [x] Fallback preserves original path context and supports opening local source externally where practical.
- [x] Vitest coverage includes HEIC/HEIF source resolution and fallback DOM behavior.

### TASK-003: Direct File-View Image Preview UI Contract
**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: `TASK-001`, `TASK-002`
**Deliverables**: `src-tauri/src/viewer/types.rs`, `src/lib/tauri/document.ts`, `src/features/workspace/WorkspaceShell.tsx`, `src/app/App.css`

**Completion Criteria**:
- [x] File-view HEIC/HEIF preview displays through the existing image preview path when possible.
- [x] Direct-preview load failure uses the same clear fallback behavior as Markdown images.
- [x] No unnecessary contract expansion is introduced if existing fields are sufficient.
- [x] Any required contract change is mirrored on Rust and TypeScript sides.

### TASK-004: Decode Strategy Discovery And Conditional Conversion
**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: `TASK-001`, `TASK-003`
**Deliverables**: `src-tauri/src/viewer/service.rs`, optional `src-tauri/Cargo.toml`, optional media/local asset serving updates

**Completion Criteria**:
- [x] Runtime verification determines whether direct WebView HEIC/HEIF rendering works on the local target platform.
- [x] If direct rendering works, conversion is explicitly left unimplemented and covered by fallback behavior for unsupported platforms.
- [x] Conversion was not required on the local target; no decoder dependency was added.
- [x] Sequence files render at least a primary frame or fall back clearly.

### TASK-005: Mixed-Stack Verification And Runtime Launch
**Status**: COMPLETED
**Parallelizable**: No
**Depends On**: `TASK-001`, `TASK-002`, `TASK-003`, `TASK-004`
**Deliverables**: plan progress log update, user-facing documentation refresh notes, test results, runtime validation notes

**Completion Criteria**:
- [x] User-facing documentation is updated for HEIC/HEIF support, or the progress log records why no documentation file needs a change.
- [x] `bun run typecheck` passes.
- [x] `bun run test` passes.
- [x] `CARGO_TERM_QUIET=true cargo check` passes.
- [x] `CARGO_TERM_QUIET=true cargo test` passes.
- [x] `CARGO_TERM_QUIET=true cargo clippy --all-targets --all-features` passes or repository-equivalent clippy command is recorded.
- [x] `target/debug/chilla` is launched after runtime-affecting edits.
- [x] Runtime check covers a Markdown document referencing a local HEIC/HEIF image; direct file-view preview routing is verified by Cargo tests because macOS accessibility exposed the installed app during GUI inspection.

## Dependencies

| Task | Depends On | Status |
|------|------------|--------|
| TASK-001 Rust classification | Accepted design | COMPLETED |
| TASK-002 Frontend fallback | Accepted design | COMPLETED |
| TASK-003 File-view UI contract | TASK-001, TASK-002 | COMPLETED |
| TASK-004 Conversion decision | TASK-001, TASK-003 | COMPLETED |
| TASK-005 Verification | TASK-001, TASK-002, TASK-003, TASK-004 | COMPLETED |

## Parallelization

- `TASK-001` and `TASK-002` may run in parallel because Rust classification and frontend fallback write scopes are disjoint.
- `TASK-003`, `TASK-004`, and `TASK-005` are sequential because they depend on the final Rust/TypeScript contract and runtime behavior.

## Completion Criteria

- [x] Accepted design behavior is implemented for Markdown HEIC/HEIF image links.
- [x] Accepted design behavior is implemented for direct file-view HEIC/HEIF previews.
- [x] Unsupported decode paths show a clear fallback instead of a silent broken image.
- [x] Rust and TypeScript contracts remain synchronized.
- [x] User-facing documentation impact is handled and recorded.
- [x] Verification commands listed in TASK-005 are run and recorded.
- [x] Progress log records implementation decisions, conversion discovery result, and any unresolved platform limitations.

## Progress Log

### Session: 2026-05-27
**Tasks Completed**: Implementation plan created after Step 3 design acceptance.
**Tasks In Progress**: None.
**Blockers**: Implementation discovery must determine direct WebView HEIC/HEIF decode support before optional conversion work.
**Notes**: Plan traces to the accepted architecture update and Codex-agent workflow references. No Step 5 feedback exists for this first Step 4 run.

### Session: 2026-05-27 Step 6 Implementation
**Tasks Completed**: TASK-001, TASK-002, TASK-003, TASK-004, TASK-005.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Implemented HEIC/HEIF extension-to-MIME classification in `src-tauri/src/viewer/service.rs`, preserved the existing `FilePreview::Image` / `kind: "image"` contract, and added frontend local-resource resolution metadata plus image-load fallback in `src/features/preview/PreviewPane.tsx`. No backend conversion dependency was added: local macOS WebView runtime inspection displayed a real `.heic` image from `/tmp/chilla-heic-runtime/heic-check.md`, and unsupported platforms are covered by the frontend image error fallback with an open-in-default-app action. User-facing documentation was refreshed in `README.md` to mention HEIC / HEIF image preview support when the platform WebView can decode the file. Direct file-view HEIC routing is covered by `open_file_preview_treats_heic_and_heif_paths_as_images`; the direct file-view GUI path is not claimed as runtime-verified because macOS exposed the installed `/Applications/chilla.app` process to accessibility after debug launch.
**Verification**: `bash .agents/scripts/format-ts.sh`; `CARGO_TERM_QUIET=true cargo fmt`; `bun run typecheck`; `bun run test`; `bun run test:dom`; `CARGO_TERM_QUIET=true cargo check`; `CARGO_TERM_QUIET=true cargo test`; `CARGO_TERM_QUIET=true cargo clippy --all-targets --all-features`; `bun run tauri build --debug --no-bundle`; `target/debug/chilla`.

### Session: 2026-05-27 Step 6 Rerun After Step 7 Review
**Tasks Completed**: Addressed Step 7 mid finding against TASK-005 progress recording.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Step 7 found that the plan claimed direct file-view runtime verification even though Step 6 notes said GUI inspection was inconclusive. Updated the TASK-005 runtime criterion and progress notes so the plan no longer claims direct file-view GUI runtime verification. Direct file-view behavior remains implemented and verified by Cargo tests; Markdown HEIC runtime display remains verified through the local `/tmp/chilla-heic-runtime/heic-check.md` fixture.
**Verification**: `git diff --check`.

## Related Plans

- **Previous**: None.
- **Next**: None.
- **Depends On**: Accepted design in `design-docs/specs/architecture.md#heic--heif-image-display-architecture`.

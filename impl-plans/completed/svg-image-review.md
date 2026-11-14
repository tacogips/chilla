# SVG Image Review Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/architecture.md#svg-image-review`
**Created**: 2026-08-14
**Last Updated**: 2026-08-14

## Design Document Reference

Route direct SVG files through the image preview and add an SVG-only image mode to the GitHub and local Git changed-file workspace while preserving left/right, stack, and full-file text review.

Included: backend extension-to-MIME routing, direct file-preview regression coverage, frontend selection timing, changed-file mode selection, isolated SVG image rendering, lazy-content integration, explicit fallback states, tests, styles, and user documentation.

Excluded: raster image diffs, before/after visual comparison, new backend commands, SVG DOM injection, and editing/comment submission.

## Modules And Contracts

### 1. Direct SVG File Preview Classification

#### `src-tauri/src/viewer/preview_detection.rs`
#### `src/features/workspace/workspacePreviewModel.ts`

**Status**: COMPLETED

**Checklist**:
- [x] Map case-insensitive `.svg` paths to `image/svg+xml` when detection reports XML/text/octet-stream.
- [x] Remove SVG from the generic text-extension fallback.
- [x] Verify the existing `open_file_preview` path returns `FilePreview::Image` for SVG content in the launched app.
- [x] Treat SVG selection as a fast image preview on the frontend.

### 2. SVG Image Review Model And Renderer

#### `src/features/pr-diff/PrDiffWorkspace.tsx`

**Status**: COMPLETED

```typescript
type DiffViewMode = "left_right" | "full_file" | "stack" | "image";

function isSvgPath(path: string): boolean;
function svgImageDataUrl(svgText: string): string;
```

**Checklist**:
- [x] Expose image mode only for `.svg` paths.
- [x] Render complete current SVG text through an isolated image URL.
- [x] Reuse lazy full-file loading for GitHub SVG content.
- [x] Show explicit loading, failure, unavailable, and truncated states.
- [x] Preserve all existing text review modes.
- [x] Add `4` selection and SVG-aware `Tab` cycling.

### 3. Styling And Regression Tests

#### `src/app/App.css`
#### `src/features/pr-diff/PrDiffWorkspace.vitest.ts`

**Status**: COMPLETED

**Checklist**:
- [x] Keep rendered SVGs contained within the review viewport.
- [x] Cover image mode visibility and image rendering.
- [x] Cover lazy GitHub SVG loading and fallback states.
- [x] Cover keyboard selection and mode cycling.
- [x] Keep existing SVG text syntax-highlighting coverage.

### 4. User Documentation And Verification

#### `README.md`
#### `impl-plans/completed/svg-image-review.md`

**Status**: COMPLETED

**Checklist**:
- [x] Document SVG image review and shortcut `4`.
- [x] Run formatter, typecheck, frontend tests, and focused DOM tests.
- [x] Record verification results and archive this plan.

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Direct SVG classification | `src-tauri/src/viewer/preview_detection.rs` | COMPLETED | 3 Rust unit tests |
| Preview selection timing | `src/features/workspace/workspacePreviewModel.ts` | COMPLETED | 2 Bun unit tests |
| SVG image mode | `src/features/pr-diff/PrDiffWorkspace.tsx` | COMPLETED | Focused Vitest DOM |
| SVG image styling | `src/app/App.css` | COMPLETED | Focused Vitest DOM |
| Regression coverage | `src/features/pr-diff/PrDiffWorkspace.vitest.ts` | COMPLETED | 30 Vitest DOM tests |
| Documentation | `README.md` | COMPLETED | Review |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| SVG image renderer | Existing `PrDiffFile.full_text` and lazy file-text loader | COMPLETED |
| SVG keyboard/mode UI | SVG image renderer | COMPLETED |
| Verification | Implementation and tests | COMPLETED |

## Completion Criteria

- [x] Direct SVG files open as image previews rather than XML/text.
- [x] SVG files can be reviewed as rendered images in GitHub and local Git diff workspaces.
- [x] SVG markup is not injected into the application DOM.
- [x] Existing text review modes remain available.
- [x] Unsupported states are explicit and do not render partial SVGs.
- [x] Typecheck and relevant frontend tests pass.
- [x] README and implementation-plan index reflect the completed feature.

## Progress Log

### Session: 2026-08-14

**Tasks Completed**: Confirmed the original direct-view defect in the launched macOS app; routed `.svg` and `.SVG` to `image/svg+xml`; removed SVG from text fallback; added fast frontend selection, rendered changed-file review, fallback states, shortcuts, styling, tests, and documentation.

**Tasks In Progress**: None.

**Blockers**: The packaged Rielflow implementation workflow is unavailable in this checkout, so the repository's documented design, specialist-agent, and verification process is being followed directly.

**Verification**: `mise run verify` passed with 21 Bun tests and 162 Rust tests; focused `PrDiffWorkspace.vitest.ts` passed 30 tests; the notarized debug macOS app visibly rendered the SVG in direct file view and local Git image-review mode.

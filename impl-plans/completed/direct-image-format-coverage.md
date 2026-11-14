# Direct Image Format Coverage Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/architecture.md#direct-image-format-coverage`
**Created**: 2026-08-15
**Last Updated**: 2026-08-15

## Design Document Reference

Extend the existing direct image-preview classification beyond its current APNG, GIF, HEIC/HEIF, JPEG, PNG, SVG, and WebP set while preserving platform-dependent decoding and the existing error fallback.

Included: AVIF, BMP/DIB, ICO, TIFF, JPE/JFIF suffixes, backend MIME fallback, frontend preview timing, regression tests, documentation, and launched-app verification.

Excluded: image transcoding, camera RAW, PSD, JPEG XL, raster Git diff modes, new Tauri commands, and payload changes.

## Modules And Contracts

### 1. Backend Image Classification

#### `src-tauri/src/viewer/preview_detection.rs`

**Status**: COMPLETED

**Checklist**:
- [x] Add case-insensitive AVIF, BMP/DIB, ICO, TIFF, JPE, and JFIF MIME fallbacks.
- [x] Preserve existing WebP and other image mappings.
- [x] Add focused table-driven tests for all supported direct-image suffixes.

### 2. Frontend Preview Timing

#### `src/features/workspace/workspacePreviewModel.ts`
#### `src/features/workspace/workspacePreviewModel.test.ts`

**Status**: COMPLETED

**Checklist**:
- [x] Keep the fast preview-selection debounce aligned with backend image suffixes.
- [x] Test lowercase and uppercase supported image paths.
- [x] Preserve default timing for unrelated text paths.

### 3. Documentation And Verification

#### `README.md`
#### `impl-plans/completed/direct-image-format-coverage.md`

**Status**: COMPLETED

**Checklist**:
- [x] Document the explicit direct image format list and decoder fallback.
- [x] Run formatting, typecheck, frontend tests, Cargo checks, clippy, and Rust tests.
- [x] Launch the debug desktop app and exercise WebP plus a newly classified format.
- [x] Archive this plan and update the implementation-plan index.

## Completion Criteria

- [x] WebP remains classified and previewed as an image.
- [x] AVIF, BMP/DIB, ICO, TIFF, JPE, and JFIF paths route through image preview.
- [x] Unsupported platform decoders surface the existing image fallback.
- [x] Relevant frontend and Rust tests pass.
- [x] The launched desktop app verifies the direct image route.
- [x] User documentation and plan index reflect the completed work.

## Progress Log

### Session: 2026-08-15

**Tasks Completed**: Confirmed WebP already exists in backend and frontend classification; added and tested AVIF, BMP/DIB, ICO, TIFF, JPE, and JFIF routing; aligned frontend timing; refreshed documentation; and visibly verified WebP and BMP in the built debug app.

**Tasks In Progress**: None.

**Blockers**: The packaged Rielflow implementation workflow is unavailable in this checkout, so the repository's documented design, specialist-agent, and verification process is being followed directly.

**Verification**: `mise run verify` passed with 39 Bun tests and 162 Rust tests; focused image timing passed 20 tests; focused preview detection passed 3 tests; the signed debug macOS app visibly rendered both WebP and BMP fixtures.

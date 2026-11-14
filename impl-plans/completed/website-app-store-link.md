# Website App Store Link Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-product-website.md#mac-app-store-availability
**Created**: 2026-10-15
**Last Updated**: 2026-10-15

## Scope and Deliverables

Add verified App Store links and installation copy to both static product-page
locales, and update repository installation documentation. No app code changes.

## Tasks

### TASK-001: Localized installation content
**Status**: Completed
**Parallelizable**: No
**Deliverables**: `pubpage/index.html`, `pubpage/ja/index.html`, `README.md`, `pubpage/README.md`.

### TASK-002: Validate and publish
**Status**: Completed
**Parallelizable**: No (depends on TASK-001)
**Deliverables**: Production build, validator result, deployment and live HTTP evidence.

### TASK-003: Commit and push
**Status**: Completed
**Parallelizable**: No (depends on TASK-002)
**Deliverables**: Focused commit with the existing App Store publication notes, pushed to origin/main.

## Module Status

| Module | Status | Verification |
| --- | --- | --- |
| Localized static content | Complete | Build and validator passed |
| Deployment | Complete | Both live locales verified |

## Completion Criteria

- [x] Both locales expose App Store links in hero, installation and footer
- [x] Production build and existing validator pass
- [x] Live English and Japanese pages contain the expected links
- [x] Changes committed and pushed

## Progress Log

### 2026-10-15
Apple public lookup confirms Chilla Viewer 0.3.6 is available free. Existing
release-publication notes will be included; untracked Riela package files are
outside this website/publication change.

Build and existing validator passed via `npm run check` in `pubpage/`. Each
built and live locale has three App Store links. Cloudflare deployment version:
`c5aa4547-f98b-4e29-983f-260c93b1ca83`. Live HTTPS content checks passed using
curl with a browser user agent (Python default user agent received HTTP 403).
Computer Use reported no browser connection; visual browser QA was unavailable.
Commit/push are the final delivery operations for this completed content change.

# File Viewer Branding Implementation Plan

**Status**: Completed
**Design Reference**: [File Viewer Visual Identity](../../design-docs/specs/notes.md#file-viewer-visual-identity)
**Created**: 2026-11-15
**Last Updated**: 2026-11-15

## Scope and Deliverables

Replace the cat icon and theme illustration with Runway-generated document/viewer
artwork. Deliver master PNGs and request/provenance records in `doc/branding/`,
native formats in `src-tauri/icons/`, an empty-screen asset in `public/`, README
artwork, and product-page derivatives. No Rust types or IPC contracts change.

## Tasks and Dependencies

| Task | Deliverables | Depends on | Status |
|------|--------------|------------|--------|
| TASK-001 | Generate and visually inspect icon and illustration | None | Completed |
| TASK-002 | Regenerate native icons, wire imagery and accessible text | TASK-001 | Completed |
| TASK-003 | Build, launch, verify visuals and record provenance | TASK-002 | Completed |

All tasks are sequential; none require parallel implementation.

## Completion Criteria

- [x] Artwork generated with runwayml-cli and inspected
- [x] Native icons and all active cat-branding surfaces replaced
- [x] Frontend and product-page checks pass
- [x] Rebuilt desktop app launched and visible result inspected

## Progress Log

### Session: 2026-11-15
Design selected: layered documents and split viewer, graphite/ivory/teal palette.
Located desktop, empty-screen, README, and product-page branding assets.

Completed both Runway generations and theme edge cleanup; recorded exact requests,
task IDs, dimensions and source hashes. Regenerated all existing native icons and
updated empty-screen, README and bilingual product-page branding. Removed obsolete
cat source assets; historical app captures remain unretouched.

Verification: independent `mise exec -- bun run typecheck` and `bun run test`
(67 passing); product-page `bun run build` and `node scripts/validate-build.mjs`;
`CARGO_TERM_QUIET=true mise exec -- bun run tauri build --debug --bundles app`;
`git diff --check`. Final desktop build completed successfully. Launched
`/Users/taco/gits/tacogips/chilla/target/debug/chilla` with output redirected to
`/tmp/chilla-branding-launch.log`. Computer Use initially failed discovery but
subsequently connected to the exact debug bundle; its screenshot showed the new
illustration on the light empty screen and its accessibility tree exposed the
updated image description. Closed the test app after verification. Build log:
`/tmp/chilla-branding-build.log`.

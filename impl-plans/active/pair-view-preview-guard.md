# Pair View: PreviewPane Hidden-Ancestor Shortcut Guard

**Status**: Ready
**Plan ID**: pair-view-preview-guard
**Wave**: 1 (no dependencies)
**Design Reference**: design-docs/specs/design-pair-view.md (Layout, "Hidden-pane shortcut suppression"; Validation)
**Created**: 2026-11-15
**Last Updated**: 2026-11-15

---

## Intent And Context

In pair view, a hidden pane stays mounted inside an ancestor that has the
`hidden` attribute. `PreviewPane` renders images, rendered Markdown, and text.
Its window `keydown` handler (`src/features/preview/PreviewPane.tsx`
`handleKeyDown`, about lines 674-690) checks only `props.visible`, and
`WorkspaceDocumentColumn` always passes `visible={true}`. Pressing `+` or `-`
therefore also zooms a hidden pane, which corrupts before/after comparison
state after a restore.

The fix is one added guard that matches the existing guards:

- `src/features/preview/PdfFilePreviewPane.tsx:175` `hidden()` uses
  `body?.closest(".pane--hidden, [hidden], [aria-hidden='true']") != null`.
- `src/features/preview/MediaFilePreviewPane.tsx:207-210` `isActive` uses the
  same selector.

## Non-Goals

- Do not change the `props.visible` semantics, wheel zoom, drag pan
  (`attachPreviewPan`), link clicks, or the render effect.
- Do not edit `WorkspaceDocumentColumn.tsx` (it has uncommitted user edits),
  the PDF or media panes, or any workspace file.
- No focus routing and no new props.

## File-Level Changes

### `src/features/preview/PreviewPane.tsx`

- In `handleKeyDown`, add an early return when the mounted preview element
  (the element already used for `attachPreviewPan`, the `.pane__body`
  `preview` ref) has a
  `.pane--hidden, [hidden], [aria-hidden='true']` ancestor, checked with
  `closest`. Put the check next to the existing `!props.visible` check.
- Pitfall: `closest` includes the element itself. That is fine and matches the
  PDF/media guards.
- Pitfall: do not use `offsetParent` or computed-style visibility checks.
  jsdom does not do layout, so tests would not show the behavior.

### `src/features/preview/PreviewPane.vitest.tsx`

Add tests next to "zooms with plus and minus keyboard shortcuts" (around line
608), reading the zoom via `--preview-zoom-scale` as the existing tests do:

- PreviewPane mounted inside `<div hidden>`, window keydown `+` -> scale
  unchanged (`1` or unset, whichever the existing baseline reads).
- Same with `aria-hidden="true"` -> unchanged.
- Mounted normally (no hidden ancestor), `+` -> `1.1` (existing behavior; the
  existing test still passes).
- Mounted in a hidden wrapper, `+` (ignored), then the `hidden` attribute is
  removed and `+` pressed again -> `1.1`, so the guard is evaluated per event
  and not captured at mount.

## Invariants

- Standalone (non-pair) zoom-shortcut behavior and all existing
  `PreviewPane.vitest.tsx` tests are unchanged.

## Overwrite Safety

These files are owned exclusively by this plan in wave 1. Before each edit,
read the file fresh and record a pre-hash with `shasum -a 256`. Re-hash after
the edit. If the pre-hash differs from the last read, stop and re-read.

## Verification (run from repository root)

1. `bunx vitest run --config vitest.config.ts src/features/preview/PreviewPane.vitest.tsx`
   must exit 0, with the new tests listed as passed.
2. `bun run typecheck` must exit 0. If it fails only in files owned by other
   wave-1 plans that are still in progress, record that in the progress log;
   files owned by this plan must have no errors.
3. `bunx biome check src/features/preview/PreviewPane.tsx src/features/preview/PreviewPane.vitest.tsx --diagnostic-level=warn`
   must exit 0.

## Completion Criteria

- [ ] Guard added in `handleKeyDown` only
- [ ] Four test cases added and passing
- [ ] Targeted vitest, typecheck, and biome pass
- [ ] Progress log updated

## Progress Log

(Implementer appends a session entry: date, changes, command exit statuses.)

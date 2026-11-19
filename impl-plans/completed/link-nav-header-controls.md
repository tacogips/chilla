# Link Navigation: Toolbar Back/Forward Buttons Implementation Plan

**Status**: Completed
**Completion**: 2026-11-19. Adversarial review accepted (comm-019097). Serial reconciliation gates passed (`tmp/link-nav-history-20261119-01/serial-reconcile-wave-001/`). Archived to `impl-plans/completed/link-nav-header-controls.md`.
**Plan ID**: link-nav-header-controls
**Wave**: 2 (depends on link-nav-keymap-actions)
**Design Reference**: design-docs/specs/design-link-navigation-history.md#triggers (Toolbar)
**Created**: 2026-11-19
**Last Updated**: 2026-11-19

---

## Intent And Context

This plan adds the Back and Forward icon buttons to the workspace header. The
header stays presentational; the shell (wave 3) passes state and callbacks.

The props are optional, so `WorkspaceShell` still typechecks before wave 3.

Existing code to imitate:

- `src/features/workspace/WorkspaceHeader.tsx`: the "Open one or more files"
  button (`button workspace__icon-button`, `aria-label`, `title(...)` with a
  `SHORTCUT_LABELS` fallback) and the Refresh button (`disabled` handling).
- Glyph style: `src/features/workspace/workspaceGlyphs.tsx` (for example
  `OpenFilesGlyph`, `ReloadGlyph`).
- Tests: `src/features/workspace/WorkspaceHeader.vitest.tsx`.

## Non-Goals

- No history logic and no keymap edits.
- No `WorkspaceShell.tsx` edit.
- No CSS changes beyond what existing classes provide. Reuse
  `workspace__icon-button`.

## Pinned Contract (new optional `WorkspaceHeaderProps`)

```ts
readonly canGoBack?: boolean;       // default false
readonly canGoForward?: boolean;    // default false
readonly onGoBack?: () => void;
readonly onGoForward?: () => void;
```

## Deliverables

- `workspaceGlyphs.tsx`: add `BackGlyph` and `ForwardGlyph` (left/right
  chevron or arrow SVG). Use the same size, `aria-hidden` and stroke
  conventions as the existing glyphs.
- `workspaceShortcuts.tsx`: add `SHORTCUT_LABELS.goBack:
  "Cmd/Ctrl+[ / Alt+Left"` and `goForward: "Cmd/Ctrl+] / Alt+Right"`. If
  `SHORTCUT_SECTIONS` "Workspace" is a static help list, add two entries with
  keys `["Cmd/Ctrl", "["]` -> "Go back in link history (also Alt+Left)" and the
  forward equivalent.
- `WorkspaceHeader.tsx`: render two buttons immediately before the
  "Open one or more files" button, always rendered:
  - `class="button button--ghost workspace__icon-button"`, `type="button"`;
  - `aria-label="Back"` / `"Forward"`;
  - `title={title("Back", "history.back", SHORTCUT_LABELS.goBack)}`, and the
    forward equivalent;
  - `disabled={props.canGoBack !== true}`, and the forward equivalent;
  - `onClick={() => props.onGoBack?.()}`.

## Pitfalls

- `title()` takes `KeymapAction`, so this plan needs the
  `link-nav-keymap-actions` names. That is why it is wave 2.
- Do not hide the buttons in diff mode. The shell passes
  `canGoBack=false` there.

## Tests (`WorkspaceHeader.vitest.tsx`)

- default render -> Back and Forward buttons exist and are both disabled
- `canGoBack` true -> Back enabled; clicking calls `onGoBack` once
- `canGoForward` true -> clicking Forward calls `onGoForward` once
- disabled Back clicked -> `onGoBack` not called
- titles include `Cmd/Ctrl+[` (or the keymap-derived label) for Back

## Verification

- `bunx vitest run --config vitest.config.ts src/features/workspace/WorkspaceHeader.vitest.tsx`
  -> pass, exit 0
- `bun run typecheck` -> exit 0
- `bunx biome check src/features/workspace/WorkspaceHeader.tsx src/features/workspace/WorkspaceHeader.vitest.tsx src/features/workspace/workspaceGlyphs.tsx src/features/workspace/workspaceShortcuts.tsx`
  -> no errors

## Completion Criteria

- [x] Optional props added; buttons render with the correct disabled state
- [x] Glyphs and labels added
- [x] Header tests pass

## Progress Log

### Session: 2026-11-19
**Tasks Completed**: Plan created
**Notes**: Record file hashes before and after editing.

### Session: 2026-11-19 — implementation
**Tasks Completed**: Header controls, glyphs, shortcut labels and focused tests.
**Verification**: Scoped Vitest 15/15, typecheck and scoped Biome passed on the shared tree; logs in `tmp/link-nav-history-20261119-01/link-nav-header-controls/check-agent/`. Formal review and integration remain downstream.
**Per-edit SHA-256 (before → after)**:
- `WorkspaceHeader.tsx`: `17f02e7ff0ddc9a2c6869409ecc16d084f2083704f96b4522e5de319730bd455` → `29b398d7915fc9fe782cde6046d51c31d6ef86602e09be372ab1e14523153015`.
- `WorkspaceHeader.vitest.tsx`: `d11bf11789914316a94c8dd8d7fd3f05cc8fd5dfd3979d932e82798b8fd5b498` → `8651c78281c80e14f5443b603d2545d5499baa13191639b039d6ce6aed333105` → formatted `e4f5279fc4ec224ee47273c8f587bf632a93f1da3127da8142443c2820e82ad6`.
- `workspaceGlyphs.tsx`: `8ee287909502852e3b706c4ab6b12b9f9396e1214c402f7d673dcf66a1c1fa52` → `1d9f25d4abec101e55594dab7d7d85b6449f14d8667dbe423aeee7f34835334f` → formatted `2e2a45b68c2ee16b7a2348fc39c112e9055278c3a5156c6ce2eb639a206563e0`.
- `workspaceShortcuts.tsx`: `36d084963025a9eb0bc0aac636ac1b85f7fa052f8d96d7392c70938f2f3912c1` → `95889ab01b58c1d41e0778f3d4a40affd2c68fcd858830168a9c7e8f20409678` → formatted `860a92450be0b6a6e6a507e9e531da90546b501d0e77f209122e2145335b64b3`.
- This plan's before/after hashes and intent are recorded in `tmp/link-nav-history-20261119-01/link-nav-header-controls/plan-update/`; detailed source intents and formatting hashes are in `ts-agent/`.

# Link Navigation: Toolbar Back/Forward Buttons Implementation Plan

**Status**: Ready
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

- [ ] Optional props added; buttons render with the correct disabled state
- [ ] Glyphs and labels added
- [ ] Header tests pass

## Progress Log

### Session: 2026-11-19
**Tasks Completed**: Plan created
**Notes**: Record file hashes before and after editing.

# Preview Right-Drag Pan Helper Implementation Plan

**Status**: Superseded by preview-pan-zoom-module (design-docs/specs/architecture.md#shared-preview-pan-and-zoom-gestures); do not dispatch
**Plan ID**: preview-right-drag-helper
**Wave**: 1 (no dependencies)
**Design Reference**: design-docs/specs/architecture.md#shared-preview-right-drag-pan
**User QA**: design-docs/user-qa/qa-preview-right-drag-pan.md (default Option A)
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

Holding the right mouse button and dragging pans a preview: the content
follows the pointer. One shared helper keeps the threshold, the contextmenu rule
and the cursor class identical across `PreviewPane`, `MediaFilePreviewPane`
(video) and `PdfFilePreviewPane`. This plan delivers only the helper, its
unit tests, the cursor CSS rule and the README line. The three pane wirings are
separate wave-2 plans (`preview-right-drag-preview-pane`,
`preview-right-drag-media-pane`, `preview-right-drag-pdf-pane`) that depend on
the signature pinned here.

The working tree also contains PART A work, which may already be committed or
may still be pending. `src/app/App.css` and `README.md` already hold PART A hunks.
Do not revert, reformat or reorder any existing content.

## Non-Goals

- No pane wiring. Do not edit `PreviewPane.tsx`, `MediaFilePreviewPane.tsx`,
  `PdfFilePreviewPane.tsx` or their vitest files.
- No keymap entry, setting, Tauri command or Rust change.
- No platform-specific contextmenu suppression at press (Option B or C in the
  user QA). Implement Option A only.
- No middle-button or touch panning. No inertia or momentum.

## Deliverables

### 1. `src/features/preview/rightDragPan.ts` (new)

Pinned contract (wave-2 plans depend on it exactly):

```ts
export const RIGHT_DRAG_PAN_THRESHOLD_PX = 4;
export const RIGHT_DRAG_PANNING_CLASS = "preview--right-drag-panning";
export function attachRightDragPan(target: HTMLElement, isActive: () => boolean): () => void;
```

The return value is a detach function. It removes every listener, clears state
and removes the class.

Behavior (design `Gesture Contract`, architecture.md:802-850):
- `pointerdown`: ignore unless `event.button === 2` and `isActive()` is true.
  Clear any leftover "just ended" flag first, on every `pointerdown`, including
  ignored ones. Record `pointerId`, `clientX`, `clientY`, `target.scrollLeft`
  and `target.scrollTop`. Set `panning = false` and call
  `target.setPointerCapture(pointerId)` inside try/catch (jsdom and an
  already-released pointer can throw; a failure must not break the gesture).
  Do NOT call `preventDefault` on `pointerdown`.
- `pointermove` with a matching `pointerId`:
  1. Check first: if `(event.buttons & 2) === 0`, end the gesture (see End) and
     return without scrolling or `preventDefault`.
  2. `dx = clientX - startX`, `dy = clientY - startY`. If not yet panning and
     `Math.hypot(dx, dy) > RIGHT_DRAG_PAN_THRESHOLD_PX`, set `panning = true`
     and add `RIGHT_DRAG_PANNING_CLASS` to `target`.
  3. If panning, set `scrollLeft = startScrollLeft - dx`,
     `scrollTop = startScrollTop - dy` and call `preventDefault`. Otherwise do
     nothing.
- End (shared by the buttons-bit termination, `pointerup` and `pointercancel`
  with a matching id): if `target.hasPointerCapture(id)`, release it (in
  try/catch). Remove the class. If `panning` was true, set
  `suppressNextContextMenu = true`. Clear the drag state.
  `lostpointercapture` with a matching id does the same without releasing.
- `contextmenu` on `target`: call `preventDefault` if an active gesture is
  panning or `suppressNextContextMenu` is true. Always reset
  `suppressNextContextMenu = false` afterwards. Otherwise leave it alone.

Pattern to imitate: `src/features/preview/PreviewPane.tsx` `PreviewPane` /
`onMount` (`dragState`, `finishDrag`, `handlePointerDown`/`Move`/`Up`, and the
listener add/remove pairs at about lines 690-770). Use plain
`addEventListener` on `target` with no `passive` option; `pointermove`
`preventDefault` must work.

Pitfalls:
- Pointer events in jsdom are often plain `Event`s with properties defined by
  the tests. Read `button`, `buttons`, `pointerId`, `clientX` and `clientY`
  from the event and do not use `instanceof PointerEvent`.
- Do not check `isPrimary` or `pointerType` (the design gates on
  `button === 2` only).
- Do not check `isActive()` on move or end. A gesture that started while the
  pane was visible ends normally.
- Do not touch left-button behavior. Return immediately for `button !== 2` on
  `pointerdown` (after clearing the flag).

### 2. `src/features/preview/rightDragPan.vitest.ts` (new)

A local `pointerEvent(type, id, x, y, button, buttons)` helper builds an
`Event` with defined properties, as `PreviewPane.vitest.tsx:pointerEvent`
does. Use a `div` with writable `scrollLeft`/`scrollTop` and stubbed
`setPointerCapture`/`releasePointerCapture`/`hasPointerCapture` (imitate
`PreviewPane.vitest.tsx:previewBodyWithPointerCapture`).

Test cases:
- Right down at (20,30), scroll (100,80), move to (45,55) with buttons=2 ->
  scroll (75,55), the move is `defaultPrevented`, the class is present and
  `setPointerCapture` was called with the id.
- Right down, then pointerdown not `defaultPrevented`.
- Right down, move by (2,2) (hypot 2.8), up, contextmenu -> contextmenu not
  prevented, scroll unchanged, the move not prevented.
- Right down, move by 30px, up (buttons=0), contextmenu -> contextmenu
  prevented, class removed, `releasePointerCapture` called. A second
  contextmenu with no new gesture -> not prevented (the flag was consumed).
- A panned gesture ends, then a new right down with no move, up, contextmenu
  -> not prevented (the flag was cleared on pointerdown).
- Chord release: right down (buttons=2), move past threshold pans,
  move buttons=3 pans, move buttons=1 -> not prevented, scroll unchanged from
  the previous value, class removed, `releasePointerCapture` called. Further
  buttons=1 moves are inert. contextmenu prevented. A new right gesture pans
  again.
- `isActive` returns false -> right drag does nothing and contextmenu is not
  prevented.
- Left down (button 0) and middle down (button 1) followed by moves -> no
  scroll, nothing prevented, no capture.
- pointercancel and lostpointercapture end the gesture (later moves inert).
- A different pointerId's moves are ignored.
- After the detach function runs, a right drag does nothing.

### 3. `src/app/App.css`

Append one rule near the existing preview rules:
`.preview--right-drag-panning { cursor: grabbing; }` (add
`user-select: none` only on this class, which is applied only while panning).
Do not edit other rules.

### 4. `README.md`

In the `## Keyboard Shortcuts` section, add one bullet next to the
`Alt (Option)+mouse wheel` line (README.md:253): right-button drag pans the
Markdown/rendered, source, image, video and PDF previews, and a plain
right-click still opens the context menu. Change nothing else.

## Invariants

- The exported names and signature above are exact.
- No change to any file outside `writePaths`.
- PART A hunks in `App.css` and `README.md` stay byte-identical.

## Concurrency And Drift

Wave 2 plans read but do not write these files. Before each edit, read the file
fresh and record a sha256 (`shasum -a 256 <file>`) before and after. If the
pre-hash differs from the last read, re-read and re-apply only this plan's
intended hunk. Never use `git checkout`/`git stash`/`git restore` and never run
concurrent git operations.

## Verification

Run in the foreground from the repository root. Keep the exit status and a
complete log at `tmp/preview-right-drag/helper/<command>.log`:
1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bun run test:dom src/features/preview/rightDragPan.vitest.ts`
   -> exit 0, all cases pass.
2. `bun run typecheck` -> exit 0.
3. `bunx biome check src/features/preview/rightDragPan.ts src/features/preview/rightDragPan.vitest.ts src/app/App.css README.md --diagnostic-level=warn`
   -> exit 0. If biome does not lint README.md, note it.

## Completion Criteria

- [ ] `rightDragPan.ts` exports the pinned contract
- [ ] All listed vitest cases exist and pass
- [ ] App.css cursor rule added
- [ ] README bullet added
- [ ] typecheck and scoped biome exit 0
- [ ] Progress log updated with commands, exit statuses and log paths

## Progress Log

(Worker appends one entry per session here only.)

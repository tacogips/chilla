# Preview Pan And Zoom Shared Module Implementation Plan

**Status**: Ready
**Plan ID**: preview-pan-zoom-module
**Wave**: 1 (no dependencies)
**Design Reference**: design-docs/specs/architecture.md#shared-preview-pan-and-zoom-gestures
**User QA**: design-docs/user-qa/qa-preview-right-drag-pan.md (Option A default)
**Supersedes**: preview-right-drag-helper
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

PART B of session 715 adds a touch-style drag pan with a momentum fling to
every preview type (right/middle drag; left drag on direct images), plus a
smooth `Ctrl`/`Cmd`+wheel zoom anchored at the pointer. It follows the
read-only nodetto-cloud reference (`page-tab-scroll.ts` `pageTabFlingStep`,
`PageTabs.tsx`, `interaction/pointer.ts`, `interaction/events.ts`
`wheelPixels`). This plan delivers only the shared, DOM-light module and its
unit tests. The three pane wirings are wave-2 plans that depend on the
contract pinned below:

- `preview-pan-zoom-preview-pane`
- `preview-pan-zoom-media-pane`
- `preview-pan-zoom-pdf-pane`

An interrupted earlier run left `src/features/preview/rightDragPan.ts` and
`rightDragPan.vitest.ts`. No pane imports them. This plan deletes both and
moves the still-valid test cases into the new test file: slop, chord release,
the contextmenu rule and capture.

## Non-Goals

- Do not wire any pane. Do not edit `PreviewPane.tsx`,
  `MediaFilePreviewPane.tsx`, `PdfFilePreviewPane.tsx`, their vitest files,
  `App.css` or `README.md`.
- No PDF page-local anchoring here. That logic lives in the PDF pane plan,
  which uses `anchoredZoomScroll` from this module.
- No touch/pen-specific logic, keymap entry, setting or Rust change.
- No frame-dt cap, no extra easing and no configurable constants.
- Never modify `/Users/taco/gits/tacogips/nodetto-cloud`.

## Deliverables

### 1. `src/features/preview/previewPanZoom.ts` (new)

Pinned exports. Wave-2 plans depend on these names and shapes exactly:

```ts
export const PAN_SLOP = 4;
export const FLING_WINDOW_MS = 80;
export const FLING_DECAY = 0.998;
export const FLING_MIN_VELOCITY = 0.02;
export const WHEEL_ZOOM_SENSITIVITY = 0.0015;
export const PREVIEW_PANNING_CLASS = "preview--right-drag-panning";
export interface PanSample { t: number; x: number; y: number }
export interface FlingVelocity { vx: number; vy: number }
export interface AnchorMeasure { originX: number; originY: number; width: number; height: number }
export interface PreviewPanOptions { isActive(): boolean; leftButton?(): boolean; scrollOwner?(): HTMLElement }
export interface PreviewPanHandle { detach(): void; stopFling(): void }
export function wheelPixels(delta: number, deltaMode: number): number;
export function flingVelocity(samples: readonly PanSample[], releaseTime: number): FlingVelocity | null;
export function flingStep(velocity: number, dtMs: number): { displacement: number; velocity: number };
export function wheelZoomFactor(event: WheelEvent): number | null;
export function anchoredZoomScroll(scroll: number, pointerOffset: number, originBefore: number, originAfter: number, ratio: number): number;
export function measureAnchor(owner: HTMLElement, anchor: HTMLElement): AnchorMeasure;
export function anchorScrollAfterZoom(owner: HTMLElement, event: MouseEvent, before: AnchorMeasure, after: AnchorMeasure, fallbackRatio: number): void;
export function applyWheelZoom(event: WheelEvent, current: number, max: number): number | null;
export function attachPreviewPan(target: HTMLElement, options: PreviewPanOptions): PreviewPanHandle;
```

`flingStep` is applied per axis. `fallbackRatio` is `newZoom / oldZoom`; it
is the one signature detail the design left implicit. `applyWheelZoom`
clamps to `[50, max]` through a local non-exported `ZOOM_MIN = 50`. Do NOT
import from `PreviewPane.tsx`, because that would create an import cycle.

Behavior, per design "Shared Module" and "Pan Gesture Contract":

**Pure helpers**

- `wheelPixels`: returns `deltaMode === 0 ? delta : delta * 16`, for every
  nonzero mode (nodetto `events.ts:48-49`). Do not use the viewport height.
- `flingVelocity`: keep the samples with `t >= releaseTime - FLING_WINDOW_MS`
  and compute `(newest - oldest) / (newest.t - oldest.t)`. Return `null` when
  fewer than 2 samples are kept, the span is 0, or
  `Math.hypot(vx, vy) < FLING_MIN_VELOCITY`.
- `flingStep(v, dt)`: returns `{ displacement: v * dt, velocity: v *
  FLING_DECAY ** dt }`. The displacement uses the INCOMING velocity
  (nodetto `page-tab-scroll.ts:53-60`). A common mistake is to decay first.
- `wheelZoomFactor`: returns `null` unless `(ctrlKey || metaKey) && deltaY
  !== 0`. `altKey` is irrelevant. Otherwise it returns
  `Math.exp(-wheelPixels(deltaY, deltaMode) * WHEEL_ZOOM_SENSITIVITY)`.
- `anchoredZoomScroll`: returns `originAfter + (scroll + pointerOffset -
  originBefore) * ratio - pointerOffset`.

**Measurement and wheel helpers**

- `measureAnchor(owner, anchor)`:
  - When `anchor === owner`, the origin is the owner's computed
    `paddingLeft`/`paddingTop` (parseFloat) and width/height are 0.
  - Otherwise the origin is `anchorRect.left - ownerRect.left +
    owner.scrollLeft` (and the same for top), and the size is the anchor's
    `getBoundingClientRect()` width/height. That rect includes transforms.
- `anchorScrollAfterZoom`:
  - The pointer offset is `event.clientX - ownerRect.left` (and the same for
    Y).
  - The per-axis ratio is `after.width / before.width` when both sizes are
    greater than 0, else `fallbackRatio`.
  - It writes `owner.scrollLeft` and `owner.scrollTop`. It does not clamp;
    the browser does.
- `applyWheelZoom`: returns `null` with NO `preventDefault` when the factor
  is `null`. Otherwise it calls `preventDefault()` and returns the clamped
  `current * factor`.

**`attachPreviewPan` gesture**

1. Listeners go on `target`: `pointerdown`, `pointermove`, `pointerup`,
   `pointercancel`, `lostpointercapture`, `contextmenu` and `wheel`. The
   wheel listener is passive and only calls `stopFling()`, because the panes
   own the zoom listener.
2. Every `pointerdown` first calls `stopFling()` and clears the just-ended
   context-menu flag.
3. A gesture starts only if `isActive()` and one of these holds:
   - `button === 2`, bit 2;
   - `button === 1`, bit 4;
   - `button === 0 && isPrimary && options.leftButton?.() === true`, bit 1.
4. On start: resolve `owner = options.scrollOwner?.() ?? target` ONCE and
   keep it for the gesture and its fling. Record the start scroll position
   from the owner. Call `target.setPointerCapture` inside try/catch, then
   `preventDefault()`.
5. On `pointermove`:
   - If `(buttons & bit) === 0`, end the gesture (no scroll, no
     `preventDefault`, no fling). If a right gesture had panned, set the
     just-ended flag.
   - Otherwise push a sample `{t: event.timeStamp, x: clientX, y: clientY}`
     and drop samples older than `FLING_WINDOW_MS` before the newest.
   - Once `hypot > PAN_SLOP`, set `panning` and add the class to `target`.
   - While panning, set the owner's `scrollLeft = start - dx` (and the same
     for top) and call `preventDefault()`.
6. On `pointerup`: release capture (try/catch, only if held) and remove the
   class. If the gesture panned, set the flag for right gestures and start a
   fling from `flingVelocity(samples, event.timeStamp)`.
7. `pointercancel` and `lostpointercapture` end the gesture without a fling.
   `lostpointercapture` does not release capture.
8. `contextmenu`: call `preventDefault()` only if (an active right gesture
   is panning) or the just-ended flag is set. Then clear the flag.

**Fling**

- Skip the fling if any of these holds:
  - `typeof matchMedia !== "function"`;
  - `matchMedia("(prefers-reduced-motion: reduce)").matches`;
  - `typeof requestAnimationFrame !== "function"`;
  - the velocity is `null`.
- Otherwise set `last = performance.now()` and schedule a frame. Each frame
  callback `ts`:
  - computes `dt = Math.max(0, ts - last)` and sets `last = ts`;
  - per axis with a nonzero velocity, calls `flingStep` and writes
    `owner.scroll -= displacement`;
  - if the read-back value equals the value before the write, sets that
    axis velocity to 0 (edge);
  - stops when `Math.hypot(vx, vy) < FLING_MIN_VELOCITY`, else schedules the
    next frame.
- While a fling runs, a `window` `keydown` listener is registered and calls
  `stopFling()`. Remove it on stop.
- `stopFling()` is idempotent: it cancels the pending frame with
  `cancelAnimationFrame` and removes the keydown listener. Only one fling per
  target exists at a time.
- `detach()` removes all listeners, stops the fling, ends any gesture
  (releasing capture, removing the class) and clears the flag.

**Patterns to imitate**

- `src/features/preview/rightDragPan.ts:attachRightDragPan`: listener
  registration, the try/catch around capture, and the end paths. Reuse its
  structure, extended as above.
- `src/features/preview/PreviewPane.tsx` (the `dragState` block, around
  lines 691-745): the left-button semantics being absorbed.

### 2. `src/features/preview/previewPanZoom.vitest.ts` (new)

jsdom: create the target `div` with writable `scrollLeft`/`scrollTop` (plain
data properties via `Object.defineProperty`). An optional clamp setter
simulates edges. Stub `setPointerCapture`, `hasPointerCapture` and
`releasePointerCapture` (imitate
`PreviewPane.vitest.tsx:previewBodyWithPointerCapture`). Build pointer events
like `PreviewPane.vitest.tsx:pointerEvent`, extended with `buttons`,
`timeStamp`, `isPrimary` and `pointerType` through `Object.defineProperties`.
Stub `requestAnimationFrame`, `cancelAnimationFrame` and `performance.now`
with a manual frame queue, and stub `window.matchMedia`. Restore every stub in
`afterEach`.

Test cases (`input -> expected`):

**Wheel helpers**

- `wheelPixels(5,0) -> 5`, `wheelPixels(1,1) -> 16`,
  `wheelPixels(1,2) -> 16`, `wheelPixels(-3,2) -> -48`.
- `wheelZoomFactor`:
  - plain `{deltaY:-1} -> null`; `{altKey, deltaY:-1} -> null`;
    `{ctrlKey, deltaY:0} -> null`.
  - `{ctrlKey, deltaY:1, deltaMode:2}` is close to `0.9762857` (1e-7).
  - `{metaKey, deltaY:-100}` is close to `Math.exp(0.15)`.
- `applyWheelZoom`:
  - `Ctrl` with `deltaY:-10000` at current 100, max 300 -> 300 and
    `defaultPrevented`.
  - The same with `+10000` -> 50.
  - A plain wheel -> `null` and not prevented.

**Fling math**

- `flingStep(1,16)` -> displacement exactly 16, velocity `0.998**16`.
- `flingVelocity`:
  - samples `t=0,40,80` with x `0,20,40`, release 80 -> `vx = 0.5`.
  - samples all older than `release - 80` (pause) -> `null`.
  - one sample -> `null`.
  - zero span -> `null`.
  - speed 0.01 -> `null`.

**Anchoring**

- `anchoredZoomScroll(100,50,0,0,2) -> 250`. That keeps content point 150 at
  300 after a 2x zoom.
- A moved origin: `(100,50,20,40,2) -> 40 + 130*2 - 50 = 250`.
- `measureAnchor(owner, owner)` with padding 8px -> origin `{8,8}`, size
  `{0,0}`.
- `anchorScrollAfterZoom` with a zero size uses `fallbackRatio`.

**Pan gesture**

- Right press then a 3px move -> no scroll, not prevented, no class.
- Then a 10px move -> scroll = start - delta, prevented, class present.
- Middle press (`button 1`, `buttons 4`) pans like right.
- Left press without `leftButton` -> no capture, no scroll, the press is not
  prevented.
- Left press with `leftButton: () => true` pans after the slop.
- `isActive() === false` -> a right drag does nothing.
- `scrollOwner` given -> the owner's offsets change and the target's offsets
  stay 0.
- Chord release:
  - right pan, then `pointermove(buttons=1)` -> not prevented, scroll
    unchanged, class removed, capture released;
  - a following `contextmenu` is prevented;
  - no fling is scheduled.

**Context menu**

- A plain right click (press, release, contextmenu) -> not prevented.
- A moved right drag, release, then contextmenu -> prevented, and a second
  contextmenu -> not prevented (flag consumed).
- A middle drag, release, then contextmenu -> not prevented.

**Fling behavior**

- Release after moves at about 0.5 px/ms -> a frame is scheduled. Each frame
  advances by `v*dt` and decays. Frames continue until speed < 0.02, then no
  frame remains queued.
- A clamped scrollTop at max -> that axis stops; the fling ends when both
  axes stop.
- Reduced motion `matches: true` -> no frame scheduled.
- No `matchMedia` -> no frame.
- A paused release (last move more than 80ms before `pointerup`) -> no fling.
- Stop triggers, each with a running fling -> `cancelAnimationFrame` called
  and the scroll unchanged by later queued callbacks:
  - a new `pointerdown`;
  - a `wheel` on the target;
  - a `window` `keydown`;
  - `stopFling()`;
  - `detach()`.
- `detach()` -> later events do nothing and the class is removed.

### 3. Deletions

- Delete `src/features/preview/rightDragPan.ts` and
  `src/features/preview/rightDragPan.vitest.ts`.
- Before deleting, confirm with
  `grep -rn "rightDragPan" src` that only those two files match.

## Invariants

- The constants equal the nodetto values above. No other module defines pan
  or zoom constants.
- A plain wheel and an `Alt`+wheel are never prevented by this module.
- A press that does not start a gesture is never prevented.
- No listener is registered on `window` except the fling-time `keydown`.

## Change Safety (shared working directory)

- Before each edit, re-read the target file fresh and record `shasum -a 256`
  of the files in this plan's writePaths in the progress log (pre and post).
- If a file outside writePaths changed unexpectedly (drift), do not touch
  it. Record it in the progress log for serial repair.
- Run no git mutations (no checkout, stash, restore, add or commit).

## Verification

Run in the foreground and record each exit code and log path under
`tmp/preview-pan-zoom/preview-pan-zoom-module/`:

1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/preview/previewPanZoom.vitest.ts`
   must exit 0, with every case above passing.
2. `bunx biome check src/features/preview/previewPanZoom.ts src/features/preview/previewPanZoom.vitest.ts --diagnostic-level=warn`
   must exit 0.
3. `bun run typecheck` must report no errors in `previewPanZoom.ts` or
   `previewPanZoom.vitest.ts`. Record errors in other files (siblings are not
   yet running in wave 1, so expect exit 0).
4. `grep -rn "rightDragPan" src` returns nothing (exit 1).

## Completion Criteria

- [ ] `previewPanZoom.ts` exports exactly the pinned contract
- [ ] `previewPanZoom.vitest.ts` covers every listed case and passes
- [ ] `rightDragPan.ts` and `rightDragPan.vitest.ts` are deleted
- [ ] Biome and the typecheck are clean for the owned files
- [ ] The progress log is updated with hashes and command evidence

## Progress Log

### Session: 2026-11-04
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Wave 1 contract plan.

## Related Plans

- **Next**: preview-pan-zoom-preview-pane, preview-pan-zoom-media-pane, preview-pan-zoom-pdf-pane
- **Supersedes**: preview-right-drag-helper

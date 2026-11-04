export const PAN_SLOP = 4;
export const FLING_WINDOW_MS = 80;
export const FLING_DECAY = 0.998;
export const FLING_MIN_VELOCITY = 0.02;
export const WHEEL_ZOOM_SENSITIVITY = 0.0015;
export const PREVIEW_PANNING_CLASS = "preview--right-drag-panning";

export interface PanSample {
  t: number;
  x: number;
  y: number;
}
export interface FlingVelocity {
  vx: number;
  vy: number;
}
export interface AnchorMeasure {
  originX: number;
  originY: number;
  width: number;
  height: number;
}
export interface PreviewPanOptions {
  isActive(): boolean;
  leftButton?(): boolean;
  scrollOwner?(): HTMLElement;
}
export interface PreviewPanHandle {
  detach(): void;
  stopFling(): void;
}

export function wheelPixels(delta: number, deltaMode: number): number {
  return deltaMode === 0 ? delta : delta * 16;
}
export function flingVelocity(
  samples: readonly PanSample[],
  releaseTime: number,
): FlingVelocity | null {
  const recent = samples.filter(
    (sample) => sample.t >= releaseTime - FLING_WINDOW_MS,
  );
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last || recent.length < 2 || last.t === first.t) return null;
  const vx = (last.x - first.x) / (last.t - first.t);
  const vy = (last.y - first.y) / (last.t - first.t);
  return Math.hypot(vx, vy) < FLING_MIN_VELOCITY ? null : { vx, vy };
}
export function flingStep(
  velocity: number,
  dtMs: number,
): { displacement: number; velocity: number } {
  return {
    displacement: velocity * dtMs,
    velocity: velocity * FLING_DECAY ** dtMs,
  };
}
export function wheelZoomFactor(event: WheelEvent): number | null {
  if (!(event.ctrlKey || event.metaKey) || event.deltaY === 0) return null;
  return Math.exp(
    -wheelPixels(event.deltaY, event.deltaMode) * WHEEL_ZOOM_SENSITIVITY,
  );
}
export function anchoredZoomScroll(
  scroll: number,
  pointerOffset: number,
  originBefore: number,
  originAfter: number,
  ratio: number,
): number {
  return (
    originAfter +
    (scroll + pointerOffset - originBefore) * ratio -
    pointerOffset
  );
}
export function measureAnchor(
  owner: HTMLElement,
  anchor: HTMLElement,
): AnchorMeasure {
  if (owner === anchor) {
    const style = getComputedStyle(owner);
    return {
      originX: Number.parseFloat(style.paddingLeft) || 0,
      originY: Number.parseFloat(style.paddingTop) || 0,
      width: 0,
      height: 0,
    };
  }
  const ownerRect = owner.getBoundingClientRect();
  const rect = anchor.getBoundingClientRect();
  return {
    originX: rect.left - ownerRect.left + owner.scrollLeft,
    originY: rect.top - ownerRect.top + owner.scrollTop,
    width: rect.width,
    height: rect.height,
  };
}
export function anchorScrollAfterZoom(
  owner: HTMLElement,
  event: MouseEvent,
  before: AnchorMeasure,
  after: AnchorMeasure,
  fallbackRatio: number,
): void {
  const rect = owner.getBoundingClientRect();
  const ratioX =
    before.width > 0 && after.width > 0
      ? after.width / before.width
      : fallbackRatio;
  const ratioY =
    before.height > 0 && after.height > 0
      ? after.height / before.height
      : fallbackRatio;
  owner.scrollLeft = anchoredZoomScroll(
    owner.scrollLeft,
    event.clientX - rect.left,
    before.originX,
    after.originX,
    ratioX,
  );
  owner.scrollTop = anchoredZoomScroll(
    owner.scrollTop,
    event.clientY - rect.top,
    before.originY,
    after.originY,
    ratioY,
  );
}
export function applyWheelZoom(
  event: WheelEvent,
  current: number,
  max: number,
): number | null {
  const factor = wheelZoomFactor(event);
  if (factor === null) return null;
  event.preventDefault();
  return Math.min(max, Math.max(50, current * factor));
}

const hasSelection = (): boolean =>
  Boolean(window.getSelection?.()?.toString());

const isEditableTarget = (target: EventTarget | null): boolean => {
  const element =
    target instanceof Element
      ? target
      : target instanceof Text
        ? target.parentElement
        : null;
  return (
    element?.closest(
      'input, textarea, [contenteditable]:not([contenteditable="false"])',
    ) != null
  );
};

export function attachPreviewPan(
  target: HTMLElement,
  options: PreviewPanOptions,
): PreviewPanHandle {
  let drag: {
    id: number;
    bit: number;
    owner: HTMLElement;
    x: number;
    y: number;
    left: number;
    top: number;
    panning: boolean;
    samples: PanSample[];
  } | null = null;
  let suppressMenu = false;
  let press: { hadSelection: boolean } | null = null;
  let frame: number | null = null;
  const stopFling = (): void => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    window.removeEventListener("keydown", stopFling);
  };
  const startFling = (
    owner: HTMLElement,
    velocity: FlingVelocity | null,
  ): void => {
    if (
      !velocity ||
      typeof matchMedia !== "function" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof requestAnimationFrame !== "function"
    )
      return;
    let { vx, vy } = velocity;
    let last = performance.now();
    const tick = (ts: number): void => {
      frame = null;
      const dt = Math.max(0, ts - last);
      last = ts;
      if (vx !== 0) {
        const before = owner.scrollLeft;
        const step = flingStep(vx, dt);
        owner.scrollLeft = before - step.displacement;
        vx = owner.scrollLeft === before ? 0 : step.velocity;
      }
      if (vy !== 0) {
        const before = owner.scrollTop;
        const step = flingStep(vy, dt);
        owner.scrollTop = before - step.displacement;
        vy = owner.scrollTop === before ? 0 : step.velocity;
      }
      if (Math.hypot(vx, vy) < FLING_MIN_VELOCITY) stopFling();
      else frame = requestAnimationFrame(tick);
    };
    window.addEventListener("keydown", stopFling);
    frame = requestAnimationFrame(tick);
  };
  const end = (release: boolean, flingTime?: number): void => {
    if (!drag) return;
    const ended = drag;
    drag = null;
    if (release) {
      try {
        if (target.hasPointerCapture(ended.id))
          target.releasePointerCapture(ended.id);
      } catch {
        /* Capture is optional. */
      }
    }
    target.classList.remove(PREVIEW_PANNING_CLASS);
    if (ended.panning && ended.bit === 2) suppressMenu = true;
    if (ended.panning && flingTime !== undefined)
      startFling(ended.owner, flingVelocity(ended.samples, flingTime));
  };
  const pointerDown = (event: PointerEvent): void => {
    stopFling();
    suppressMenu = false;
    if (event.button === 2 && options.isActive())
      press = { hadSelection: hasSelection() };
    const bit =
      event.button === 2
        ? 2
        : event.button === 1
          ? 4
          : event.button === 0 && event.isPrimary && options.leftButton?.()
            ? 1
            : 0;
    if (!bit || !options.isActive() || drag) return;
    const owner = options.scrollOwner?.() ?? target;
    drag = {
      id: event.pointerId,
      bit,
      owner,
      x: event.clientX,
      y: event.clientY,
      left: owner.scrollLeft,
      top: owner.scrollTop,
      panning: false,
      samples: [{ t: event.timeStamp, x: event.clientX, y: event.clientY }],
    };
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      /* Capture is optional. */
    }
    event.preventDefault();
  };
  const mouseDown = (event: MouseEvent): void => {
    if (event.button !== 2 || !options.isActive()) return;
    if (press === null) press = { hadSelection: hasSelection() };
    if (!press.hadSelection && !isEditableTarget(event.target))
      event.preventDefault();
  };
  const pointerMove = (event: PointerEvent): void => {
    if (!drag || drag.id !== event.pointerId) return;
    if ((event.buttons & drag.bit) === 0) {
      end(true);
      return;
    }
    drag.samples.push({
      t: event.timeStamp,
      x: event.clientX,
      y: event.clientY,
    });
    drag.samples = drag.samples.filter(
      (sample) => sample.t >= event.timeStamp - FLING_WINDOW_MS,
    );
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.panning && Math.hypot(dx, dy) > PAN_SLOP) {
      drag.panning = true;
      target.classList.add(PREVIEW_PANNING_CLASS);
    }
    if (drag.panning) {
      drag.owner.scrollLeft = drag.left - dx;
      drag.owner.scrollTop = drag.top - dy;
      event.preventDefault();
    }
  };
  const pointerUp = (event: PointerEvent): void => {
    press = null;
    if (drag?.id === event.pointerId) end(true, event.timeStamp);
  };
  const pointerCancel = (event: PointerEvent): void => {
    press = null;
    if (drag?.id === event.pointerId) end(true);
  };
  const lostCapture = (event: PointerEvent): void => {
    if (drag?.id === event.pointerId) end(false);
  };
  const contextMenu = (event: MouseEvent): void => {
    if ((drag?.bit === 2 && drag.panning) || suppressMenu)
      event.preventDefault();
    else if (isEditableTarget(event.target)) {
      // Keep the native menu for editable targets.
    } else if (press !== null) {
      if (!press.hadSelection) {
        if (hasSelection()) window.getSelection()?.removeAllRanges();
        event.preventDefault();
      }
    } else if (!hasSelection()) event.preventDefault();
    suppressMenu = false;
    press = null;
  };
  target.addEventListener("pointerdown", pointerDown);
  target.addEventListener("mousedown", mouseDown);
  target.addEventListener("pointermove", pointerMove);
  target.addEventListener("pointerup", pointerUp);
  target.addEventListener("pointercancel", pointerCancel);
  target.addEventListener("lostpointercapture", lostCapture);
  target.addEventListener("contextmenu", contextMenu);
  target.addEventListener("wheel", stopFling, { passive: true });
  return {
    stopFling,
    detach: () => {
      target.removeEventListener("pointerdown", pointerDown);
      target.removeEventListener("mousedown", mouseDown);
      target.removeEventListener("pointermove", pointerMove);
      target.removeEventListener("pointerup", pointerUp);
      target.removeEventListener("pointercancel", pointerCancel);
      target.removeEventListener("lostpointercapture", lostCapture);
      target.removeEventListener("contextmenu", contextMenu);
      target.removeEventListener("wheel", stopFling);
      stopFling();
      end(true);
      suppressMenu = false;
      press = null;
    },
  };
}

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anchorScrollAfterZoom,
  anchoredZoomScroll,
  applyWheelZoom,
  attachPreviewPan,
  FLING_DECAY,
  flingStep,
  flingVelocity,
  measureAnchor,
  PAN_SLOP,
  PREVIEW_PANNING_CLASS,
  wheelPixels,
  wheelZoomFactor,
} from "./previewPanZoom";

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function pointer(
  type: string,
  x = 0,
  y = 0,
  t = 0,
  button = 2,
  buttons = 2,
): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    clientX: { value: x },
    clientY: { value: y },
    timeStamp: { value: t },
    button: { value: button },
    buttons: { value: buttons },
    isPrimary: { value: true },
  });
  return event;
}
function setup(
  options: Parameters<typeof attachPreviewPan>[1] = { isActive: () => true },
) {
  const target = document.createElement("div");
  target.scrollLeft = 100;
  target.scrollTop = 100;
  const captured = new Set<number>();
  target.setPointerCapture = vi.fn((id) => {
    captured.add(id);
  });
  target.hasPointerCapture = vi.fn((id) => captured.has(id));
  target.releasePointerCapture = vi.fn((id) => {
    captured.delete(id);
  });
  const handle = attachPreviewPan(target, options);
  const send = (event: Event) => {
    target.dispatchEvent(event);
    return event;
  };
  const menu = (dispatchTarget: Node = target) => {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    dispatchTarget.dispatchEvent(event);
    return event;
  };
  return { target, handle, send, menu };
}
function frames(reduced = false) {
  const queue = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queue.set(++id, cb);
    return id;
  });
  const cancel = vi.fn((key: number) => {
    queue.delete(key);
  });
  vi.stubGlobal("cancelAnimationFrame", cancel);
  vi.spyOn(performance, "now").mockReturnValue(0);
  const next = (time: number) => {
    const entry = queue.entries().next().value;
    if (!entry) throw new Error("no frame");
    queue.delete(entry[0]);
    entry[1](time);
  };
  return { queue, next, cancel };
}
function launch(send: (e: Event) => Event) {
  send(pointer("pointerdown"));
  send(pointer("pointermove", 20, 20, 40));
  send(pointer("pointerup", 20, 20, 40, 2, 0));
}

describe("wheel and geometry", () => {
  it("normalizes wheel deltas and modifiers", () => {
    expect([
      wheelPixels(5, 0),
      wheelPixels(1, 1),
      wheelPixels(1, 2),
      wheelPixels(-3, 2),
    ]).toEqual([5, 16, 16, -48]);
    for (const e of [
      new WheelEvent("wheel", { deltaY: -1 }),
      new WheelEvent("wheel", { deltaY: -1, altKey: true }),
      new WheelEvent("wheel", { ctrlKey: true }),
    ])
      expect(wheelZoomFactor(e)).toBeNull();
    expect(
      wheelZoomFactor(
        new WheelEvent("wheel", { deltaY: 1, deltaMode: 2, ctrlKey: true }),
      ),
    ).toBeCloseTo(0.9762857, 7);
    expect(
      wheelZoomFactor(new WheelEvent("wheel", { deltaY: -100, metaKey: true })),
    ).toBeCloseTo(Math.exp(0.15));
  });
  it("clamps handled zoom and preserves plain wheel", () => {
    const up = new WheelEvent("wheel", {
      ctrlKey: true,
      deltaY: -10000,
      cancelable: true,
    });
    expect(applyWheelZoom(up, 100, 300)).toBe(300);
    expect(up.defaultPrevented).toBe(true);
    expect(
      applyWheelZoom(
        new WheelEvent("wheel", {
          ctrlKey: true,
          deltaY: 10000,
          cancelable: true,
        }),
        100,
        300,
      ),
    ).toBe(50);
    const plain = new WheelEvent("wheel", { deltaY: 1, cancelable: true });
    expect(applyWheelZoom(plain, 100, 300)).toBeNull();
    expect(plain.defaultPrevented).toBe(false);
  });
  it("measures and anchors the content point", () => {
    expect(anchoredZoomScroll(100, 50, 0, 0, 2)).toBe(250);
    expect(anchoredZoomScroll(100, 50, 20, 40, 2)).toBe(250);
    const owner = document.createElement("div");
    owner.style.padding = "8px";
    owner.scrollLeft = 100;
    owner.scrollTop = 100;
    const measure = measureAnchor(owner, owner);
    expect(measure).toEqual({ originX: 8, originY: 8, width: 0, height: 0 });
    anchorScrollAfterZoom(
      owner,
      new MouseEvent("wheel", { clientX: 50, clientY: 50 }),
      measure,
      measure,
      2,
    );
    expect([owner.scrollLeft, owner.scrollTop]).toEqual([242, 242]);
    const anchor = document.createElement("div");
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 20,
      width: 30,
      height: 40,
    } as DOMRect);
    expect(measureAnchor(owner, anchor)).toEqual({
      originX: 252,
      originY: 262,
      width: 30,
      height: 40,
    });
  });
});
describe("fling math", () => {
  it("uses incoming velocity and recent samples", () => {
    expect(flingStep(1, 16)).toEqual({
      displacement: 16,
      velocity: FLING_DECAY ** 16,
    });
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 40, x: 20, y: 0 },
      { t: 80, x: 40, y: 0 },
    ];
    expect(flingVelocity(samples, 80)).toEqual({ vx: 0.5, vy: 0 });
    expect(flingVelocity(samples, 161)).toBeNull();
    expect(flingVelocity(samples.slice(0, 1), 0)).toBeNull();
    expect(
      flingVelocity(
        [
          { t: 0, x: 0, y: 0 },
          { t: 0, x: 1, y: 0 },
        ],
        0,
      ),
    ).toBeNull();
    expect(
      flingVelocity(
        [
          { t: 0, x: 0, y: 0 },
          { t: 50, x: 0.5, y: 0 },
        ],
        50,
      ),
    ).toBeNull();
  });
});
describe("pan", () => {
  it("respects slop and suppresses right menus", () => {
    const { target, send, menu } = setup();
    expect(PAN_SLOP).toBe(4);
    expect(send(pointer("pointerdown")).defaultPrevented).toBe(true);
    expect(send(pointer("pointermove", 3)).defaultPrevented).toBe(false);
    expect(target.scrollLeft).toBe(100);
    expect(send(pointer("pointermove", 10)).defaultPrevented).toBe(true);
    expect(target.scrollLeft).toBe(90);
    expect(target.classList.contains(PREVIEW_PANNING_CLASS)).toBe(true);
    send(pointer("pointerup", 10));
    expect(menu().defaultPrevented).toBe(true);
    expect(menu().defaultPrevented).toBe(true);
    send(pointer("pointerdown"));
    send(pointer("pointerup"));
    expect(menu().defaultPrevented).toBe(true);
  });
  it("supports middle and optional primary left, respects active and owner", () => {
    const owner = document.createElement("div");
    owner.scrollLeft = 100;
    const { target, send, menu } = setup({
      isActive: () => true,
      leftButton: () => true,
      scrollOwner: () => owner,
    });
    send(pointer("pointerdown", 0, 0, 0, 1, 4));
    send(pointer("pointermove", 10, 0, 1, 1, 4));
    send(pointer("pointerup", 10, 0, 1, 1, 0));
    expect(owner.scrollLeft).toBe(90);
    expect(target.scrollLeft).toBe(100);
    expect(menu().defaultPrevented).toBe(true);
    send(pointer("pointerdown", 0, 0, 0, 0, 1));
    send(pointer("pointermove", 10, 0, 1, 0, 1));
    expect(owner.scrollLeft).toBe(80);
    const noLeft = setup();
    expect(
      noLeft.send(pointer("pointerdown", 0, 0, 0, 0, 1)).defaultPrevented,
    ).toBe(false);
    expect(noLeft.target.setPointerCapture).not.toHaveBeenCalled();
    const inactive = setup({ isActive: () => false });
    inactive.send(pointer("pointerdown"));
    inactive.send(pointer("pointermove", 10));
    expect(inactive.target.scrollLeft).toBe(100);
  });
  it("ends chord release without fling, but suppresses menu", () => {
    const f = frames();
    const { target, send, menu } = setup();
    send(pointer("pointerdown"));
    send(pointer("pointermove", 20, 0, 40));
    expect(send(pointer("pointermove", 30, 0, 50, 0, 1)).defaultPrevented).toBe(
      false,
    );
    expect(target.scrollLeft).toBe(80);
    expect(target.releasePointerCapture).toHaveBeenCalled();
    expect(menu().defaultPrevented).toBe(true);
    expect(f.queue.size).toBe(0);
  });
  it.each(["pointercancel", "lostpointercapture"])(
    "ends %s without fling",
    (event) => {
      const f = frames();
      const { target, send } = setup();
      send(pointer("pointerdown"));
      send(pointer("pointermove", 20, 0, 40));
      send(pointer(event));
      expect(f.queue.size).toBe(0);
      expect(target.classList.contains(PREVIEW_PANNING_CLASS)).toBe(false);
      if (event === "lostpointercapture")
        expect(target.releasePointerCapture).not.toHaveBeenCalled();
    },
  );
  it("continues when capture fails", () => {
    const { target, send } = setup();
    target.setPointerCapture = () => {
      throw new Error("unavailable");
    };
    send(pointer("pointerdown"));
    send(pointer("pointermove", 10));
    expect(target.scrollLeft).toBe(90);
  });
});
describe("native context menu guard", () => {
  it("prevents the press-time menu and permits subsequent panning", () => {
    const { target, send, menu } = setup();
    send(pointer("pointerdown"));
    expect(menu().defaultPrevented).toBe(true);
    expect(send(pointer("pointermove", 10)).defaultPrevented).toBe(true);
    expect(target.scrollLeft).toBe(90);
    expect(target.classList.contains(PREVIEW_PANNING_CLASS)).toBe(true);
    send(pointer("pointerup", 10));
    expect(menu().defaultPrevented).toBe(true);
  });

  it("prevents a menu without a gesture", () => {
    expect(setup().menu().defaultPrevented).toBe(true);
  });

  it("keeps native menus for editable targets and their children", () => {
    const { target, menu } = setup();
    for (const tag of ["input", "textarea"]) {
      const editable = document.createElement(tag);
      target.append(editable);
      expect(menu(editable).defaultPrevented).toBe(false);
    }
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    const text = document.createTextNode("text");
    child.append(text);
    editable.append(child);
    target.append(editable);
    expect(menu(child).defaultPrevented).toBe(false);
    expect(menu(text).defaultPrevented).toBe(false);
    const empty = document.createElement("div");
    empty.setAttribute("contenteditable", "");
    target.append(empty);
    expect(menu(empty).defaultPrevented).toBe(false);
    const disabled = document.createElement("div");
    disabled.setAttribute("contenteditable", "false");
    target.append(disabled);
    expect(menu(disabled).defaultPrevented).toBe(true);
  });

  it("keeps the native menu for a selection, except during or just after a right pan", () => {
    const { target, send, menu } = setup();
    const text = document.createTextNode("selected text");
    target.append(text);
    document.body.append(target);
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection();
    if (!selection) throw new Error("selection unavailable");
    selection.addRange(range);
    expect(menu().defaultPrevented).toBe(false);
    send(pointer("pointerdown"));
    send(pointer("pointermove", 10));
    expect(menu().defaultPrevented).toBe(true);
    send(pointer("pointerup", 10));
    expect(menu().defaultPrevented).toBe(true);
    expect(menu().defaultPrevented).toBe(false);
    selection.removeAllRanges();
    expect(menu().defaultPrevented).toBe(true);
    target.remove();
  });

  it("removes the menu listener on detach", () => {
    const { handle, menu } = setup();
    handle.detach();
    expect(menu().defaultPrevented).toBe(false);
  });
});
describe("fling", () => {
  it("advances and decays until stopped", () => {
    const f = frames();
    const { target, send } = setup();
    launch(send);
    expect(f.queue.size).toBe(1);
    f.next(16);
    expect(target.scrollLeft).toBe(72);
    expect(target.scrollTop).toBe(72);
    let time = 16;
    while (f.queue.size && time < 5000) {
      time += 16;
      f.next(time);
    }
    expect(f.queue.size).toBe(0);
  });
  it("stops at edges", () => {
    const f = frames();
    const { target, send } = setup();
    launch(send);
    Object.defineProperty(target, "scrollLeft", {
      get: () => 0,
      set: () => {},
    });
    Object.defineProperty(target, "scrollTop", { get: () => 0, set: () => {} });
    f.next(16);
    expect(f.queue.size).toBe(0);
  });
  it("skips reduced motion, unavailable matchMedia and paused releases", () => {
    let f = frames(true);
    let s = setup();
    launch(s.send);
    expect(f.queue.size).toBe(0);
    f = frames();
    vi.stubGlobal("requestAnimationFrame", undefined);
    s = setup();
    launch(s.send);
    expect(f.queue.size).toBe(0);
    f = frames();
    vi.stubGlobal("matchMedia", undefined);
    s = setup();
    launch(s.send);
    expect(f.queue.size).toBe(0);
    f = frames();
    s = setup();
    s.send(pointer("pointerdown"));
    s.send(pointer("pointermove", 20, 0, 40));
    s.send(pointer("pointerup", 20, 0, 121));
    expect(f.queue.size).toBe(0);
  });
  it.each(["pointerdown", "wheel", "keydown", "stop", "detach"])(
    "stops on %s",
    (trigger) => {
      const f = frames();
      const { target, handle, send } = setup();
      launch(send);
      const left = target.scrollLeft;
      if (trigger === "stop") handle.stopFling();
      else if (trigger === "detach") handle.detach();
      else if (trigger === "keydown")
        window.dispatchEvent(new Event("keydown"));
      else send(new Event(trigger));
      expect(f.cancel).toHaveBeenCalled();
      expect(f.queue.size).toBe(0);
      expect(target.scrollLeft).toBe(left);
    },
  );
  it("detaches listeners and clears a gesture", () => {
    const { target, handle, send } = setup();
    send(pointer("pointerdown"));
    send(pointer("pointermove", 20));
    handle.detach();
    expect(target.classList.contains(PREVIEW_PANNING_CLASS)).toBe(false);
    send(pointer("pointerdown"));
    send(pointer("pointermove", 40));
    expect(target.scrollLeft).toBe(80);
  });
});

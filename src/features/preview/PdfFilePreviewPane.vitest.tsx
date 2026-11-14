import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfFilePreviewPane, pdfPageAnchorScroll } from "./PdfFilePreviewPane";

const mocks = vi.hoisted(() => ({ load: vi.fn(), open: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: mocks.open }));
vi.mock("./pdfjs", () => ({ loadPdfDocument: mocks.load }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function fakeDocument(count: number) {
  const pages = Array.from({ length: count }, () => ({
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: 100 * scale,
      height: 200 * scale,
    })),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
    cleanup: vi.fn(),
  }));
  return {
    pages,
    numPages: count,
    getPage: vi.fn(async (number: number) => pages[number - 1]!),
  };
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

describe("PdfFilePreviewPane", () => {
  let dispose: VoidFunction | undefined;
  let handles: Array<
    ReturnType<typeof deferred<ReturnType<typeof fakeDocument>>> & {
      destroy: ReturnType<typeof vi.fn>;
    }
  >;
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    handles = [];
    mocks.load.mockReset().mockImplementation(() => {
      const handle = {
        ...deferred<ReturnType<typeof fakeDocument>>(),
        destroy: vi.fn().mockResolvedValue(undefined),
      };
      handles.push(handle);
      return handle;
    });
    mocks.open.mockReset().mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );
  });
  afterEach(() => {
    dispose?.();
    dispose = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });
  function mount(revision = () => "r1", generation = () => 0) {
    dispose = render(
      () => (
        <PdfFilePreviewPane
          fileName="report.pdf"
          path="/workspace/report.pdf"
          revision={revision()}
          localResourceGeneration={generation()}
        />
      ),
      document.getElementById("root")!,
    );
  }
  it("reloads on revision and generation changes and destroys on unmount", async () => {
    const [revision, setRevision] = createSignal("r1");
    const [generation, setGeneration] = createSignal(0);
    mount(revision, generation);
    expect(
      new URL(mocks.load.mock.calls[0]![0]).searchParams.get("revision"),
    ).toBe("r1");
    expect(
      new URL(mocks.load.mock.calls[0]![0]).searchParams.has("chilla_refresh"),
    ).toBe(false);
    setRevision("r2");
    expect(handles[0]!.destroy).toHaveBeenCalledOnce();
    expect(
      new URL(mocks.load.mock.calls[1]![0]).searchParams.get("revision"),
    ).toBe("r2");
    setGeneration(2);
    expect(handles[1]!.destroy).toHaveBeenCalledOnce();
    expect(
      new URL(mocks.load.mock.calls[2]![0]).searchParams.get("chilla_refresh"),
    ).toBe("2");
    dispose?.();
    dispose = undefined;
    expect(handles[2]!.destroy).toHaveBeenCalledOnce();
  });
  it("renders pages and zooms with keys and wheel without stealing focus", async () => {
    mount();
    const pdf = fakeDocument(3);
    handles[0]!.resolve(pdf);
    await flush();
    expect(document.querySelectorAll("canvas.preview-pdf-page")).toHaveLength(
      3,
    );
    expect(document.querySelector(".pane")?.textContent).toContain("3 pages");
    expect(
      document.querySelector("iframe, [tabindex], button, a[href], input"),
    ).toBeNull();
    expect(pdf.pages[0]!.render).toHaveBeenCalledTimes(1);
    const key = new KeyboardEvent("keydown", { key: "+", cancelable: true });
    window.dispatchEvent(key);
    await flush();
    expect(key.defaultPrevented).toBe(true);
    expect(document.querySelector(".preview__zoom")?.textContent).toBe("110%");
    expect(pdf.pages[0]!.getViewport).toHaveBeenCalledWith({
      scale: 1.1 * (window.devicePixelRatio || 1),
    });
    for (const page of pdf.pages) {
      expect(page.render).toHaveBeenCalledTimes(2);
      expect(page.render).toHaveBeenLastCalledWith(
        expect.objectContaining({
          viewport: {
            width: 100 * (1.1 * (window.devicePixelRatio || 1)),
            height: 200 * (1.1 * (window.devicePixelRatio || 1)),
          },
        }),
      );
    }
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "-", cancelable: true }),
    );
    await flush();
    expect(document.querySelector(".preview__zoom")?.textContent).toBe("100%");
    const input = document.createElement("input");
    document.body.append(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "+",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.querySelector(".preview__zoom")?.textContent).toBe("100%");
    const body = document.querySelector(".pane__body")!;
    const wheel = new WheelEvent("wheel", {
      altKey: true,
      deltaY: -1,
      cancelable: true,
    });
    body.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    expect(document.querySelector(".preview__zoom")?.textContent).toBe("100%");
    const ctrl = new WheelEvent("wheel", {
      ctrlKey: true,
      deltaY: -100,
      cancelable: true,
    });
    body.dispatchEvent(ctrl);
    expect(ctrl.defaultPrevented).toBe(true);
    expect(document.querySelector(".preview__zoom")?.textContent).toBe("116%");
    const plain = new WheelEvent("wheel", { deltaY: -1, cancelable: true });
    body.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
    expect(document.querySelector(".preview__zoom")?.textContent).toBe("116%");
    for (let i = 0; i < 30; i++)
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "+", cancelable: true }),
      );
    expect(document.querySelector(".preview__zoom")?.textContent).toBe("300%");
  });
  it("debounces wheel rendering and preserves page-local geometry", async () => {
    mount();
    const pdf = fakeDocument(2);
    for (const page of pdf.pages)
      page.getViewport.mockImplementation(({ scale }) => ({
        width: 1000 * scale,
        height: 1000 * scale,
      }));
    pdf.pages[1]!.getViewport.mockImplementation(({ scale }) => ({
      width: 500 * scale,
      height: 1000 * scale,
    }));
    handles[0]!.resolve(pdf);
    await flush();
    vi.useFakeTimers();
    const body = document.querySelector<HTMLDivElement>(".pane__body")!;
    const canvases = [
      ...document.querySelectorAll<HTMLCanvasElement>("canvas"),
    ];
    body.scrollTop = 1200;
    body.scrollLeft = 100;
    canvases.forEach((canvas, i) => {
      vi.spyOn(canvas, "getBoundingClientRect").mockImplementation(() => {
        const height = Number.parseFloat(canvas.style.height);
        const width = Number.parseFloat(canvas.style.width);
        const top =
          16 +
          (i ? Number.parseFloat(canvases[0]!.style.height) + 12 : 0) -
          body.scrollTop;
        const left = (i ? 200 : 0) + (1000 - width) / 2 - body.scrollLeft;
        return {
          top,
          left,
          width,
          height,
          bottom: top + height,
          right: left + width,
          x: left,
          y: top,
          toJSON: () => ({}),
        };
      });
    });
    expect(pdfPageAnchorScroll(1200, 200, 1028, 1000, 2028, 2000)).toBe(2572);
    body.dispatchEvent(
      new WheelEvent("wheel", {
        ctrlKey: true,
        deltaY: -Math.log(2) / 0.0015,
        clientX: 300,
        clientY: 200,
        cancelable: true,
      }),
    );
    expect(body.scrollTop).toBe(2572);
    expect(body.scrollLeft).toBe(-100);
    expect(canvases[1]!.style.height).toBe("2000px");
    expect(pdf.pages[0]!.render).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(20);
      body.dispatchEvent(
        new WheelEvent("wheel", {
          ctrlKey: true,
          deltaY: -10,
          clientX: 300,
          clientY: 200,
          cancelable: true,
        }),
      );
    }
    const top = body.scrollTop;
    const left = body.scrollLeft;
    const height = canvases[1]!.style.height;
    expect(pdf.pages[0]!.render).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(150);
    await flush();
    expect(pdf.pages[0]!.render).toHaveBeenCalledTimes(2);
    expect(body.scrollTop).toBe(top);
    expect(body.scrollLeft).toBe(left);
    expect(canvases[1]!.style.height).toBe(height);
    expect(pdfPageAnchorScroll(1000, 22, 16, 1000, 16, 2000)).toBe(1994);
  });
  it("pans and stops a fling and pending zoom on reload", async () => {
    const [revision, setRevision] = createSignal("a");
    mount(revision);
    const pdf = fakeDocument(1);
    handles[0]!.resolve(pdf);
    await flush();
    vi.useFakeTimers();
    const raf = vi.fn(() => 7);
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", cancel);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const body = document.querySelector<HTMLDivElement>(".pane__body")!;
    const pointer = (
      type: string,
      button: number,
      buttons: number,
      x: number,
    ) => {
      const e = new MouseEvent(type, {
        button,
        buttons,
        clientX: x,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(e, "pointerId", { value: 1 });
      body.dispatchEvent(e);
    };
    pointer("pointerdown", 2, 2, 100);
    pointer("pointermove", 2, 2, 80);
    expect(body.scrollLeft).toBe(20);
    pointer("pointerup", 2, 0, 80);
    const menu = new MouseEvent("contextmenu", { cancelable: true });
    body.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    pointer("pointerdown", 2, 2, 100);
    pointer("pointerup", 2, 0, 100);
    const plain = new MouseEvent("contextmenu", { cancelable: true });
    body.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(true);
    pointer("pointerdown", 1, 4, 100);
    vi.advanceTimersByTime(20);
    pointer("pointermove", 1, 4, 70);
    vi.advanceTimersByTime(10);
    pointer("pointerup", 1, 0, 70);
    expect(raf).toHaveBeenCalled();
    body.dispatchEvent(
      new WheelEvent("wheel", {
        ctrlKey: true,
        deltaY: -100,
        cancelable: true,
      }),
    );
    // Start another fling after the wheel stopped the first one.
    pointer("pointerdown", 1, 4, 100);
    vi.advanceTimersByTime(20);
    pointer("pointermove", 1, 4, 70);
    pointer("pointerup", 1, 0, 70);
    cancel.mockClear();
    setRevision("b");
    expect(cancel).toHaveBeenCalledWith(7);
    vi.advanceTimersByTime(150);
    await flush();
    expect(pdf.pages[0]!.render).toHaveBeenCalledTimes(1);
  });
  it("anchors a gap to the previous page and keeps live CSS during an older render", async () => {
    mount();
    const pdf = fakeDocument(2);
    const pending = deferred<void>();
    pdf.pages[0]!.render.mockReturnValueOnce({
      promise: pending.promise,
      cancel: vi.fn(),
    });
    handles[0]!.resolve(pdf);
    await flush();
    const body = document.querySelector<HTMLDivElement>(".pane__body")!;
    const canvases = [
      ...document.querySelectorAll<HTMLCanvasElement>("canvas"),
    ];
    // Give the not-yet-rendered second canvas its normal initial layout.
    canvases[1]!.style.height = "200px";
    canvases[1]!.style.width = "100px";
    canvases.forEach((canvas, i) =>
      vi.spyOn(canvas, "getBoundingClientRect").mockImplementation(() => {
        const height = Number.parseFloat(canvas.style.height);
        const width = Number.parseFloat(canvas.style.width);
        const top =
          16 +
          (i ? Number.parseFloat(canvases[0]!.style.height) + 12 : 0) -
          body.scrollTop;
        return {
          top,
          left: 0,
          width,
          height,
          bottom: top + height,
          right: width,
          x: 0,
          y: top,
          toJSON: () => ({}),
        };
      }),
    );
    body.scrollTop = 200;
    body.dispatchEvent(
      new WheelEvent("wheel", {
        ctrlKey: true,
        deltaY: -Math.log(2) / 0.0015,
        clientY: 22,
        cancelable: true,
      }),
    );
    expect(body.scrollTop).toBe(394);
    expect(canvases[1]!.style.height).toBe("400px");
    pending.resolve();
    await flush();
    expect(canvases[1]!.style.height).toBe("400px");
  });
  it("does not fling when reduced motion is requested", async () => {
    mount();
    handles[0]!.resolve(fakeDocument(1));
    await flush();
    vi.useFakeTimers();
    const raf = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const body = document.querySelector<HTMLDivElement>(".pane__body")!;
    const pointer = (type: string, buttons: number, x: number) => {
      const event = new MouseEvent(type, {
        button: 1,
        buttons,
        clientX: x,
        cancelable: true,
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      body.dispatchEvent(event);
    };
    pointer("pointerdown", 4, 100);
    vi.advanceTimersByTime(20);
    pointer("pointermove", 4, 70);
    pointer("pointerup", 0, 70);
    expect(body.scrollLeft).toBe(30);
    expect(raf).not.toHaveBeenCalled();
  });
  it("cancels in-flight rendering before reusing a canvas after rapid zoom", async () => {
    mount();
    const pdf = fakeDocument(1);
    const first = deferred<void>();
    const cancel = vi.fn();
    pdf.pages[0]!.render.mockReturnValueOnce({
      promise: first.promise,
      cancel,
    });
    handles[0]!.resolve(pdf);
    await flush();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    await flush();
    expect(cancel).toHaveBeenCalled();
    expect(pdf.pages[0]!.render).toHaveBeenCalledTimes(1);
    first.resolve();
    await flush();
    expect(pdf.pages[0]!.render).toHaveBeenCalledTimes(2);
    expect(document.querySelector(".preview__zoom")?.textContent).toBe("120%");
  });
  it("shows the error fallback when loading throws synchronously", () => {
    mocks.load.mockImplementationOnce(() => {
      throw new Error("worker failed");
    });
    mount();
    expect(
      document.querySelector(".preview-pdf__error")?.textContent,
    ).toContain("Unable to load PDF");
    document
      .querySelector<HTMLButtonElement>(".preview-pdf__error button")!
      .click();
    expect(mocks.open).toHaveBeenCalledWith("/workspace/report.pdf");
  });
  it("ignores stale loads and opens failures in the default app", async () => {
    const [revision, setRevision] = createSignal("a");
    mount(revision);
    setRevision("b");
    handles[1]!.resolve(fakeDocument(1));
    await flush();
    handles[0]!.resolve(fakeDocument(3));
    await flush();
    expect(document.querySelectorAll("canvas")).toHaveLength(1);
    setRevision("c");
    handles[2]!.reject(new Error("bad PDF"));
    await flush();
    expect(
      document.querySelector(".preview-pdf__error")?.textContent,
    ).toContain("Unable to load PDF");
    document
      .querySelector<HTMLButtonElement>(".preview-pdf__error button")!
      .click();
    expect(mocks.open).toHaveBeenCalledWith("/workspace/report.pdf");
  });
});

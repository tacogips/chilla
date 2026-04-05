import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import {
  EpubPreviewPane,
  EPUB_PAGINATION_STEP_EVENT,
} from "./EpubPreviewPane";

describe("EpubPreviewPane", () => {
  let dispose: VoidFunction | undefined;
  let resizeObserverCallback: ResizeObserverCallback | undefined;
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(performance.now()), 0);
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((handle: number) => {
      window.clearTimeout(handle);
    }) as typeof globalThis.cancelAnimationFrame;

    class MockResizeObserver implements ResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}

      constructor(callback: ResizeObserverCallback) {
        resizeObserverCallback = callback;
      }
    }

    globalThis.ResizeObserver = MockResizeObserver;
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    resizeObserverCallback = undefined;
    globalThis.ResizeObserver = originalResizeObserver;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    document.body.innerHTML = "";
  });

  it("splits EPUB content into pages and advances with pagination events", async () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <EpubPreviewPane
          colorScheme="light"
          documentPath={null}
          html={[
            '<section class="file-preview file-preview--epub">',
            '<article class="epub-preview"><h1>Sample EPUB</h1><p>Chapter one.</p></article>',
            "</section>",
          ].join("")}
          subtitle="File type: EPUB"
          visible={true}
        />
      ),
      root,
    );

    const viewport = document.querySelector(".epub-reader__viewport");
    const flow = document.querySelector(".file-preview--epub");

    if (!(viewport instanceof HTMLDivElement) || !(flow instanceof HTMLElement)) {
      throw new Error("missing EPUB pagination elements");
    }

    Object.defineProperty(viewport, "clientWidth", {
      configurable: true,
      get: () => 640,
    });
    Object.defineProperty(flow, "scrollWidth", {
      configurable: true,
      get: () => 1920,
    });

    const scrollTo = vi.fn(
      ({ left }: ScrollToOptions) => {
        viewport.scrollLeft = left ?? 0;
        viewport.dispatchEvent(new Event("scroll"));
      },
    );

    Object.defineProperty(viewport, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    resizeObserverCallback?.([], {} as ResizeObserver);

    await waitFor(() => {
      expect(document.body.textContent).toContain("Page 1 of 3");
    });

    const reader = document.querySelector(".epub-reader");

    if (!(reader instanceof HTMLElement)) {
      throw new Error("missing EPUB reader");
    }

    reader.dispatchEvent(
      new CustomEvent(EPUB_PAGINATION_STEP_EVENT, {
        detail: { step: 1 },
      }),
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain("Page 2 of 3");
    });

    expect(scrollTo).toHaveBeenCalled();
  });
});

async function waitFor(
  assertion: () => void,
  timeoutMs = 2_000,
): Promise<void> {
  const start = Date.now();

  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - start >= timeoutMs) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { EpubPreviewPane, EPUB_PAGINATION_STEP_EVENT } from "./EpubPreviewPane";

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
    localStorage.clear();
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
          selectedAnchorId={null}
          subtitle="File type: EPUB"
          toc={[]}
          visible={true}
        />
      ),
      root,
    );

    const viewport = document.querySelector(".epub-reader__viewport");
    const flow = document.querySelector(".file-preview--epub");

    if (
      !(viewport instanceof HTMLDivElement) ||
      !(flow instanceof HTMLElement)
    ) {
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

    const scrollTo = vi.fn(({ left }: ScrollToOptions) => {
      viewport.scrollLeft = left ?? 0;
      viewport.dispatchEvent(new Event("scroll"));
    });

    Object.defineProperty(viewport, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    resizeObserverCallback?.([], {} as ResizeObserver);

    await waitFor(() => {
      expect(document.body.textContent).toContain("Book Page 1 of 3");
      // Without `.epub-preview__chapter[data-epub-href]`, section span is not measured; UI stays 1 of 1.
      expect(document.body.textContent).toContain("Section Page 1 of 1");
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
      expect(document.body.textContent).toContain("Book Page 2 of 3");
      expect(document.body.textContent).toContain("Section Page 1 of 1");
    });

    expect(scrollTo).toHaveBeenCalled();
  });

  it("restores a stored EPUB location and reports the active toc anchor", async () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    const onRelocate = vi.fn();
    localStorage.setItem(
      "chilla-epub-location:/tmp/book.epub",
      JSON.stringify({
        href: "OEBPS/chapter.xhtml#details",
        progression: null,
        updatedAtUnixMs: 1,
      }),
    );

    dispose = render(
      () => (
        <EpubPreviewPane
          colorScheme="light"
          documentPath="/tmp/book.epub"
          html={[
            '<section class="file-preview file-preview--epub">',
            '<article class="epub-preview">',
            '<section class="epub-preview__chapter" data-epub-href="OEBPS/chapter.xhtml">',
            '<h1 id="epub-chapter-oebps-chapter-xhtml-frag-intro" data-epub-href="OEBPS/chapter.xhtml#intro">Intro</h1>',
            '<h2 id="epub-chapter-oebps-chapter-xhtml-frag-details" data-epub-href="OEBPS/chapter.xhtml#details">Details</h2>',
            "</section>",
            "</article>",
            "</section>",
          ].join("")}
          onRelocate={onRelocate}
          selectedAnchorId={null}
          subtitle="File type: EPUB"
          toc={[
            {
              label: "Intro",
              href: "OEBPS/chapter.xhtml#intro",
              anchor_id: "epub-chapter-oebps-chapter-xhtml-frag-intro",
              children: [
                {
                  label: "Details",
                  href: "OEBPS/chapter.xhtml#details",
                  anchor_id: "epub-chapter-oebps-chapter-xhtml-frag-details",
                  children: [],
                },
              ],
            },
          ]}
          visible={true}
        />
      ),
      root,
    );

    const viewport = document.querySelector(".epub-reader__viewport");
    const flow = document.querySelector(".file-preview--epub");
    const intro = document.getElementById(
      "epub-chapter-oebps-chapter-xhtml-frag-intro",
    );
    const details = document.getElementById(
      "epub-chapter-oebps-chapter-xhtml-frag-details",
    );
    const chapter = document.querySelector(".epub-preview__chapter");

    if (
      !(viewport instanceof HTMLDivElement) ||
      !(flow instanceof HTMLElement) ||
      !(intro instanceof HTMLElement) ||
      !(details instanceof HTMLElement) ||
      !(chapter instanceof HTMLElement)
    ) {
      throw new Error("missing EPUB restore elements");
    }

    Object.defineProperty(viewport, "clientWidth", {
      configurable: true,
      get: () => 640,
    });
    Object.defineProperty(flow, "scrollWidth", {
      configurable: true,
      get: () => 1280,
    });
    Object.defineProperty(viewport, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 640,
        bottom: 800,
        width: 640,
        height: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(chapter, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: -viewport.scrollLeft,
        top: 0,
        right: 640 - viewport.scrollLeft,
        bottom: 200,
        width: 640,
        height: 200,
        x: -viewport.scrollLeft,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(intro, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: -viewport.scrollLeft,
        top: 0,
        right: 200 - viewport.scrollLeft,
        bottom: 40,
        width: 200,
        height: 40,
        x: -viewport.scrollLeft,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(details, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 640 - viewport.scrollLeft,
        top: 0,
        right: 840 - viewport.scrollLeft,
        bottom: 40,
        width: 200,
        height: 40,
        x: 640 - viewport.scrollLeft,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    const scrollTo = vi.fn(({ left }: ScrollToOptions) => {
      viewport.scrollLeft = left ?? 0;
      viewport.dispatchEvent(new Event("scroll"));
    });

    Object.defineProperty(viewport, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    resizeObserverCallback?.([], {} as ResizeObserver);

    await waitFor(() => {
      expect(document.body.textContent).toContain("Book Page 2 of 2");
      expect(document.body.textContent).toContain("Section Page 2 of 2");
    });

    await waitFor(() => {
      expect(onRelocate).toHaveBeenCalledWith(
        "epub-chapter-oebps-chapter-xhtml-frag-details",
      );
    });
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

import { openUrl } from "@tauri-apps/plugin-opener";
import { createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import type { ColorScheme } from "../../lib/theme";
import { isDefaultBrowserUrl } from "./preview-assets";
import { enhancePreviewContent, previewThemeStyle } from "./PreviewPane";

export const EPUB_PAGINATION_STEP_EVENT = "chilla:epub-page-step";

interface EpubPreviewPaneProps {
  readonly html: string;
  readonly visible: boolean;
  readonly documentPath: string | null;
  readonly colorScheme: ColorScheme;
  readonly subtitle?: string;
}

interface EpubPageStepEventDetail {
  readonly step: number;
}

function clampPageIndex(pageIndex: number, pageCount: number): number {
  return Math.min(Math.max(pageIndex, 0), Math.max(pageCount - 1, 0));
}

function isPageStepEvent(event: Event): event is CustomEvent<EpubPageStepEventDetail> {
  return (
    event instanceof CustomEvent &&
    typeof (event.detail as Partial<EpubPageStepEventDetail>).step === "number"
  );
}

function scrollViewportToPage(
  viewport: HTMLDivElement,
  pageIndex: number,
  behavior: ScrollBehavior,
): void {
  const left = pageIndex * Math.max(1, viewport.clientWidth);

  if (typeof viewport.scrollTo === "function") {
    viewport.scrollTo({ left, top: 0, behavior });
    return;
  }

  viewport.scrollLeft = left;
}

export function EpubPreviewPane(props: EpubPreviewPaneProps) {
  let readerRef: HTMLElement | undefined;
  let viewportRef: HTMLDivElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let enhancementRunId = 0;
  let ignoreScrollEvent = false;
  let scheduledLayoutFrameId: number | undefined;

  const [currentPage, setCurrentPage] = createSignal(0);
  const [pageCount, setPageCount] = createSignal(1);

  const schedulePaginationLayout = (behavior: ScrollBehavior = "auto") => {
    if (scheduledLayoutFrameId !== undefined) {
      cancelAnimationFrame(scheduledLayoutFrameId);
    }

    scheduledLayoutFrameId = requestAnimationFrame(() => {
      scheduledLayoutFrameId = undefined;

      const viewport = viewportRef;
      const container = containerRef;

      if (!props.visible || viewport === undefined || container === undefined) {
        return;
      }

      const flow = container.querySelector<HTMLElement>(".file-preview--epub");

      if (!(flow instanceof HTMLElement)) {
        setCurrentPage(0);
        setPageCount(1);
        return;
      }

      const viewportWidth = Math.max(1, Math.floor(viewport.clientWidth));
      flow.style.setProperty("--epub-page-width", `${viewportWidth}px`);

      requestAnimationFrame(() => {
        const measuredPageCount = Math.max(
          1,
          Math.ceil(flow.scrollWidth / viewportWidth),
        );
        const nextPageIndex = clampPageIndex(currentPage(), measuredPageCount);

        setPageCount(measuredPageCount);
        setCurrentPage(nextPageIndex);

        ignoreScrollEvent = true;
        scrollViewportToPage(viewport, nextPageIndex, behavior);
        queueMicrotask(() => {
          ignoreScrollEvent = false;
        });
      });
    });
  };

  const goToPage = (pageIndex: number, behavior: ScrollBehavior = "smooth") => {
    const viewport = viewportRef;

    if (viewport === undefined) {
      return;
    }

    const nextPageIndex = clampPageIndex(pageIndex, pageCount());
    setCurrentPage(nextPageIndex);
    ignoreScrollEvent = true;
    scrollViewportToPage(viewport, nextPageIndex, behavior);
    queueMicrotask(() => {
      ignoreScrollEvent = false;
    });
  };

  onMount(() => {
    const reader = readerRef;
    const viewport = viewportRef;
    const container = containerRef;

    if (
      reader === undefined ||
      viewport === undefined ||
      container === undefined
    ) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const link = target.closest<HTMLAnchorElement>("a[href]");
      const href = link?.getAttribute("href");

      if (href === null || href === undefined || !isDefaultBrowserUrl(href)) {
        return;
      }

      event.preventDefault();
      void openUrl(href).catch(() => {
        // Leave the link inert if the desktop opener is unavailable.
      });
    };

    const handleScroll = () => {
      if (ignoreScrollEvent) {
        return;
      }

      const viewportWidth = Math.max(1, viewport.clientWidth);
      setCurrentPage(
        clampPageIndex(
          Math.round(viewport.scrollLeft / viewportWidth),
          pageCount(),
        ),
      );
    };

    const handlePageStep = (event: Event) => {
      if (!isPageStepEvent(event)) {
        return;
      }

      event.preventDefault();
      goToPage(currentPage() + Math.trunc(event.detail.step));
    };

    const handleEmbeddedLoad = () => {
      schedulePaginationLayout("auto");
    };

    const resizeObserver = new ResizeObserver(() => {
      schedulePaginationLayout("auto");
    });

    reader.addEventListener("click", handleClick);
    reader.addEventListener(EPUB_PAGINATION_STEP_EVENT, handlePageStep as EventListener);
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("load", handleEmbeddedLoad, true);
    resizeObserver.observe(viewport);
    resizeObserver.observe(container);

    onCleanup(() => {
      reader.removeEventListener("click", handleClick);
      reader.removeEventListener(
        EPUB_PAGINATION_STEP_EVENT,
        handlePageStep as EventListener,
      );
      viewport.removeEventListener("scroll", handleScroll);
      container.removeEventListener("load", handleEmbeddedLoad, true);
      resizeObserver.disconnect();
      if (scheduledLayoutFrameId !== undefined) {
        cancelAnimationFrame(scheduledLayoutFrameId);
      }
    });
  });

  createEffect(
    on(
      [
        () => props.visible,
        () => props.html,
        () => props.documentPath,
        () => props.colorScheme,
      ],
      ([visible, html, documentPath, colorScheme]) => {
        const container = containerRef;

        if (!visible || container === undefined) {
          return;
        }

        const currentRunId = ++enhancementRunId;
        container.innerHTML = html;
        schedulePaginationLayout("auto");

        void enhancePreviewContent(
          container,
          documentPath,
          colorScheme,
          () => currentRunId === enhancementRunId,
        )
          .catch(() => {
            // Leave the rendered markup intact if asset or Mermaid enhancement fails.
          })
          .finally(() => {
            if (currentRunId !== enhancementRunId) {
              return;
            }

            schedulePaginationLayout("auto");
          });
      },
    ),
  );

  onCleanup(() => {
    enhancementRunId += 1;
  });

  return (
    <section class={`pane${props.visible ? "" : " pane--hidden"}`}>
      <header class="pane__header">
        <span class="pane__title">Preview</span>
        <span>{props.subtitle ?? "Rendered HTML"}</span>
      </header>
      <div
        class="pane__body preview preview--embedded-epub"
        style={previewThemeStyle(props.colorScheme)}
      >
        <section class="epub-reader" ref={readerRef}>
          <div class="epub-reader__toolbar">
            <div class="epub-reader__pager">
              <button
                class="epub-reader__button"
                disabled={currentPage() <= 0}
                onClick={() => {
                  goToPage(currentPage() - 1);
                }}
                type="button"
              >
                Previous
              </button>
              <span class="epub-reader__page-label">
                Page {currentPage() + 1} of {pageCount()}
              </span>
              <button
                class="epub-reader__button"
                disabled={currentPage() >= pageCount() - 1}
                onClick={() => {
                  goToPage(currentPage() + 1);
                }}
                type="button"
              >
                Next
              </button>
            </div>
            <p class="epub-reader__hint">J/K, Arrow Up/Down, Ctrl+U/Ctrl+D</p>
          </div>
          <div class="epub-reader__viewport" ref={viewportRef}>
            <div
              class="preview__content epub-reader__content"
              ref={containerRef}
              style={previewThemeStyle(props.colorScheme)}
            />
          </div>
        </section>
      </div>
    </section>
  );
}

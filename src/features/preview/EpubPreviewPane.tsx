import { openUrl } from "@tauri-apps/plugin-opener";
import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
} from "solid-js";
import {
  loadStoredEpubLocation,
  saveStoredEpubLocation,
} from "../../lib/epub-location";
import type { ColorScheme } from "../../lib/theme";
import type { EpubNavigationItem } from "../../lib/tauri/document";
import { isDefaultBrowserUrl } from "./preview-assets";
import { enhancePreviewContent, previewThemeStyle } from "./PreviewPane";

export const EPUB_PAGINATION_STEP_EVENT = "chilla:epub-page-step";

interface EpubPreviewPaneProps {
  readonly html: string;
  readonly toc: readonly EpubNavigationItem[];
  readonly visible: boolean;
  readonly documentPath: string | null;
  readonly colorScheme: ColorScheme;
  readonly selectedAnchorId: string | null;
  readonly subtitle?: string;
  readonly onRelocate?: (anchorId: string | null) => void;
}

interface EpubPageStepEventDetail {
  readonly step: number;
}

interface FlatTocTarget {
  readonly anchorId: string;
}

const INTERACTIVE_CLICK_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[role='button']",
].join(", ");

function clampPageIndex(pageIndex: number, pageCount: number): number {
  return Math.min(Math.max(pageIndex, 0), Math.max(pageCount - 1, 0));
}

function clampProgression(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function isPageStepEvent(
  event: Event,
): event is CustomEvent<EpubPageStepEventDetail> {
  return (
    event instanceof CustomEvent &&
    typeof (event.detail as Partial<EpubPageStepEventDetail>).step === "number"
  );
}

function flattenTocTargets(
  items: readonly EpubNavigationItem[],
  accumulator: FlatTocTarget[] = [],
): readonly FlatTocTarget[] {
  for (const item of items) {
    if (item.anchor_id !== null) {
      accumulator.push({ anchorId: item.anchor_id });
    }
    flattenTocTargets(item.children, accumulator);
  }
  return accumulator;
}

function scrollViewportToLeft(
  viewport: HTMLDivElement,
  left: number,
  behavior: ScrollBehavior,
): void {
  if (typeof viewport.scrollTo === "function") {
    viewport.scrollTo({ left, top: 0, behavior });
    return;
  }

  viewport.scrollLeft = left;
}

function queryFlow(container: HTMLElement | undefined): HTMLElement | null {
  return container?.querySelector<HTMLElement>(".file-preview--epub") ?? null;
}

function queryElementById(
  container: HTMLElement | undefined,
  id: string,
): HTMLElement | null {
  if (container === undefined) {
    return null;
  }

  for (const element of container.querySelectorAll<HTMLElement>("[id]")) {
    if (element.id === id) {
      return element;
    }
  }

  return null;
}

function findElementByHref(
  container: HTMLElement | undefined,
  href: string,
): HTMLElement | null {
  if (container === undefined) {
    return null;
  }

  for (const element of container.querySelectorAll<HTMLElement>(
    "[data-epub-href]",
  )) {
    if (element.dataset["epubHref"] === href) {
      return element;
    }
  }

  return null;
}

function contentLeftForElement(
  viewport: HTMLDivElement,
  element: HTMLElement,
): number {
  const viewportRect = viewport.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  return Math.max(
    0,
    viewport.scrollLeft + elementRect.left - viewportRect.left,
  );
}

function findLastVisibleElement(
  viewport: HTMLDivElement,
  elements: readonly HTMLElement[],
): HTMLElement | null {
  const threshold = viewport.scrollLeft + 1;
  let current: HTMLElement | null = null;

  for (const element of elements) {
    const left = contentLeftForElement(viewport, element);
    if (left <= threshold) {
      current = element;
      continue;
    }
    break;
  }

  return current ?? elements[0] ?? null;
}

function isInteractiveClickTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(INTERACTIVE_CLICK_SELECTOR) !== null
  );
}

export function EpubPreviewPane(props: EpubPreviewPaneProps) {
  let readerRef: HTMLElement | undefined;
  let viewportRef: HTMLDivElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let enhancementRunId = 0;
  let scheduledLayoutFrameId: number | undefined;
  let pendingRestoreSelection = false;

  const [currentPage, setCurrentPage] = createSignal(0);
  const [pageCount, setPageCount] = createSignal(1);
  const [currentAnchorId, setCurrentAnchorId] = createSignal<string | null>(
    null,
  );
  const [currentSectionPage, setCurrentSectionPage] = createSignal(1);
  const [currentSectionPageCount, setCurrentSectionPageCount] = createSignal(1);

  const flatTocTargets = createMemo(() => flattenTocTargets(props.toc));

  const updateReaderLocation = () => {
    const viewport = viewportRef;
    const container = containerRef;
    const flow = queryFlow(container);

    if (viewport === undefined || container === undefined || flow === null) {
      return;
    }

    const viewportWidth = Math.max(1, viewport.clientWidth);
    const nextPageIndex = clampPageIndex(
      Math.round(viewport.scrollLeft / viewportWidth),
      pageCount(),
    );
    setCurrentPage(nextPageIndex);

    const chapterElements = Array.from(
      container.querySelectorAll<HTMLElement>(
        ".epub-preview__chapter[data-epub-href]",
      ),
    );
    const currentChapter = findLastVisibleElement(viewport, chapterElements);
    const chapterHref = currentChapter?.dataset["epubHref"] ?? null;

    let progression: number | null = null;
    if (currentChapter instanceof HTMLElement) {
      const currentIndex = chapterElements.findIndex(
        (element) => element === currentChapter,
      );
      const currentLeft = contentLeftForElement(viewport, currentChapter);
      const nextChapter =
        currentIndex >= 0 ? (chapterElements[currentIndex + 1] ?? null) : null;
      const nextLeft =
        nextChapter instanceof HTMLElement
          ? contentLeftForElement(viewport, nextChapter)
          : flow.scrollWidth;
      const span = Math.max(nextLeft - currentLeft, viewportWidth);
      const sectionPageCount = Math.max(1, Math.ceil(span / viewportWidth));
      const sectionStartPage = Math.max(
        0,
        Math.floor(currentLeft / viewportWidth),
      );
      const sectionPageIndex = clampPageIndex(
        nextPageIndex - sectionStartPage,
        sectionPageCount,
      );
      setCurrentSectionPage(sectionPageIndex + 1);
      setCurrentSectionPageCount(sectionPageCount);
      progression = clampProgression(
        (viewport.scrollLeft - currentLeft) / span,
      );
    } else {
      setCurrentSectionPage(1);
      setCurrentSectionPageCount(1);
    }

    const allTargets = Array.from(
      container.querySelectorAll<HTMLElement>("[data-epub-href]"),
    );
    const currentTarget = findLastVisibleElement(viewport, allTargets);
    const targetHref = currentTarget?.dataset["epubHref"] ?? chapterHref;

    const tocElements = flatTocTargets()
      .map((target) => queryElementById(container, target.anchorId))
      .filter(
        (element): element is HTMLElement => element instanceof HTMLElement,
      );
    const activeTocElement = findLastVisibleElement(viewport, tocElements);
    const nextAnchorId = activeTocElement?.id ?? null;

    if (currentAnchorId() !== nextAnchorId) {
      setCurrentAnchorId(nextAnchorId);
      props.onRelocate?.(nextAnchorId);
    }

    if (props.documentPath !== null && targetHref !== null) {
      saveStoredEpubLocation(props.documentPath, {
        href: targetHref,
        progression,
        updatedAtUnixMs: Date.now(),
      });
    }
  };

  const restoreStoredLocation = (behavior: ScrollBehavior = "auto") => {
    const viewport = viewportRef;
    const container = containerRef;
    const flow = queryFlow(container);

    if (
      props.documentPath === null ||
      viewport === undefined ||
      container === undefined ||
      flow === null
    ) {
      return;
    }

    const storedLocation = loadStoredEpubLocation(props.documentPath);
    if (storedLocation === null) {
      updateReaderLocation();
      return;
    }

    const exactTarget = findElementByHref(container, storedLocation.href);
    const chapterHref =
      storedLocation.href.split("#", 1)[0] ?? storedLocation.href;
    const chapterTarget =
      findElementByHref(container, chapterHref) ??
      container.querySelector<HTMLElement>(
        ".epub-preview__chapter[data-epub-href]",
      );

    const target = exactTarget ?? chapterTarget;
    if (!(target instanceof HTMLElement)) {
      scrollViewportToLeft(viewport, 0, behavior);
      updateReaderLocation();
      return;
    }

    let left = contentLeftForElement(viewport, target);

    if (
      storedLocation.progression !== null &&
      exactTarget === null &&
      chapterTarget instanceof HTMLElement
    ) {
      const chapterElements = Array.from(
        container.querySelectorAll<HTMLElement>(
          ".epub-preview__chapter[data-epub-href]",
        ),
      );
      const chapterIndex = chapterElements.findIndex(
        (element) => element === chapterTarget,
      );
      const nextChapter =
        chapterIndex >= 0 ? (chapterElements[chapterIndex + 1] ?? null) : null;
      const chapterLeft = contentLeftForElement(viewport, chapterTarget);
      const nextLeft =
        nextChapter instanceof HTMLElement
          ? contentLeftForElement(viewport, nextChapter)
          : flow.scrollWidth;
      left =
        chapterLeft +
        Math.max(nextLeft - chapterLeft, viewport.clientWidth) *
          clampProgression(storedLocation.progression);
    }

    scrollViewportToLeft(viewport, left, behavior);
    updateReaderLocation();
  };

  const schedulePaginationLayout = (behavior: ScrollBehavior = "auto") => {
    if (scheduledLayoutFrameId !== undefined) {
      cancelAnimationFrame(scheduledLayoutFrameId);
    }

    scheduledLayoutFrameId = requestAnimationFrame(() => {
      scheduledLayoutFrameId = undefined;

      const viewport = viewportRef;
      const container = containerRef;
      const flow = queryFlow(container);

      if (
        !props.visible ||
        viewport === undefined ||
        container === undefined ||
        flow === null
      ) {
        return;
      }

      const viewportWidth = Math.max(1, Math.floor(viewport.clientWidth));
      flow.style.setProperty("--epub-page-width", `${viewportWidth}px`);

      requestAnimationFrame(() => {
        const measuredPageCount = Math.max(
          1,
          Math.ceil(flow.scrollWidth / viewportWidth),
        );
        setPageCount(measuredPageCount);

        if (pendingRestoreSelection) {
          pendingRestoreSelection = false;
          restoreStoredLocation(behavior);
          return;
        }

        const nextPageIndex = clampPageIndex(currentPage(), measuredPageCount);
        scrollViewportToLeft(viewport, nextPageIndex * viewportWidth, behavior);
        updateReaderLocation();
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
    scrollViewportToLeft(
      viewport,
      nextPageIndex * Math.max(1, viewport.clientWidth),
      behavior,
    );
    updateReaderLocation();
  };

  const goToAnchor = (
    anchorId: string,
    behavior: ScrollBehavior = "smooth",
  ) => {
    const viewport = viewportRef;
    const container = containerRef;
    const flow = queryFlow(container);
    const target = queryElementById(container, anchorId);

    if (
      viewport === undefined ||
      container === undefined ||
      flow === null ||
      !(target instanceof HTMLElement)
    ) {
      return;
    }

    scrollViewportToLeft(
      viewport,
      contentLeftForElement(viewport, target),
      behavior,
    );
    updateReaderLocation();
  };

  const handleViewportClick = (event: MouseEvent) => {
    const viewport = viewportRef;

    if (viewport === undefined || isInteractiveClickTarget(event.target)) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    const relativeX = event.clientX - rect.left;
    const edgeThreshold = rect.width * 0.3;

    if (relativeX <= edgeThreshold) {
      goToPage(currentPage() - 1);
      return;
    }

    if (relativeX >= rect.width - edgeThreshold) {
      goToPage(currentPage() + 1);
    }
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
      updateReaderLocation();
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
      pendingRestoreSelection = true;
      schedulePaginationLayout("auto");
    });

    reader.addEventListener("click", handleClick);
    reader.addEventListener(
      EPUB_PAGINATION_STEP_EVENT,
      handlePageStep as EventListener,
    );
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
        setCurrentAnchorId(null);
        setCurrentPage(0);
        setPageCount(1);
        setCurrentSectionPage(1);
        setCurrentSectionPageCount(1);
        pendingRestoreSelection = documentPath !== null;
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

  createEffect(
    on(
      [() => props.visible, () => props.selectedAnchorId],
      ([visible, selectedAnchorId]) => {
        if (
          !visible ||
          selectedAnchorId === null ||
          selectedAnchorId === currentAnchorId()
        ) {
          return;
        }

        goToAnchor(selectedAnchorId);
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
          <div
            aria-label="EPUB paginated viewport"
            class="epub-reader__viewport"
            onClick={handleViewportClick}
            ref={viewportRef}
          >
            <div
              class="preview__content epub-reader__content"
              ref={containerRef}
              style={previewThemeStyle(props.colorScheme)}
            />
          </div>
          <footer class="epub-reader__footer">
            <span class="epub-reader__section-label">
              Section Page {currentSectionPage()} of {currentSectionPageCount()}
            </span>
            <span class="epub-reader__page-label">
              Book Page {currentPage() + 1} of {pageCount()}
            </span>
          </footer>
        </section>
      </div>
    </section>
  );
}

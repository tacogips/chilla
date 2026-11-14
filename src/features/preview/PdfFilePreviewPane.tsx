import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { isEditableKeyboardTarget } from "../../lib/keyboard";
import {
  loadPdfDocument,
  type PdfLoadHandle,
  type PdfPageLike,
  type PdfRenderTaskLike,
} from "./pdfjs";
import {
  applyWheelZoom,
  attachPreviewPan,
  measureAnchor,
} from "./previewPanZoom";
import { PreviewHeader } from "./PreviewHeader";
import { nextPreviewZoom, RENDERED_PREVIEW_ZOOM_MAX } from "./PreviewPane";

interface PdfFilePreviewPaneProps {
  readonly path: string;
  readonly fileName: string;
  readonly revision: string;
  readonly localResourceGeneration?: number | undefined;
}

export function pdfPageAnchorScroll(
  scroll: number,
  pointerOffset: number,
  originBefore: number,
  sizeBefore: number,
  originAfter: number,
  sizeAfter: number,
): number {
  const fraction =
    sizeBefore > 0
      ? Math.max(
          0,
          Math.min(1, (scroll + pointerOffset - originBefore) / sizeBefore),
        )
      : 0;
  return originAfter + fraction * sizeAfter - pointerOffset;
}

export function PdfFilePreviewPane(props: PdfFilePreviewPaneProps) {
  const [zoom, setZoom] = createSignal(100);
  const [renderZoom, setRenderZoom] = createSignal(100);
  let zoomTimer: ReturnType<typeof setTimeout> | undefined;
  let stopFling: (() => void) | undefined;
  const clearZoomTimer = () => {
    clearTimeout(zoomTimer);
    zoomTimer = undefined;
  };
  const [status, setStatus] = createSignal<"loading" | "ready" | "error">(
    "loading",
  );
  const [pages, setPages] = createSignal<PdfPageLike[]>([]);
  let body: HTMLDivElement | undefined;
  let generation = 0;
  let renderGeneration = 0;
  let handle: PdfLoadHandle | undefined;
  let tasks: PdfRenderTaskLike[] = [];
  let renderBarrier: Promise<unknown> = Promise.resolve();
  const canvases: HTMLCanvasElement[] = [];
  const cancel = () => {
    renderGeneration++;
    for (const task of tasks) task.cancel();
    renderBarrier = Promise.allSettled([
      renderBarrier,
      ...tasks.map((task) => task.promise),
    ]);
    tasks = [];
  };
  const pdfSrc = createMemo(() => {
    const url = new URL(convertFileSrc(props.path));
    url.searchParams.set("revision", props.revision);
    if ((props.localResourceGeneration ?? 0) > 0) {
      url.searchParams.set(
        "chilla_refresh",
        String(props.localResourceGeneration),
      );
    }
    return url.toString();
  });

  createEffect(
    on(pdfSrc, (url) => {
      clearZoomTimer();
      stopFling?.();
      setRenderZoom(zoom());
      const current = ++generation;
      cancel();
      if (handle) void handle.destroy().catch(() => {});
      setPages([]);
      canvases.length = 0;
      setStatus("loading");
      let next: PdfLoadHandle;
      try {
        next = loadPdfDocument(url);
      } catch {
        handle = undefined;
        setStatus("error");
        return;
      }
      handle = next;
      void (async () => {
        try {
          const document = await next.promise;
          const loaded: PdfPageLike[] = [];
          for (let number = 1; number <= document.numPages; number++) {
            if (current !== generation) return;
            loaded.push(await document.getPage(number));
          }
          if (current !== generation) return;
          setPages(loaded);
          setStatus("ready");
        } catch {
          if (current === generation) setStatus("error");
        }
      })();
    }),
  );
  createEffect(() => {
    const currentPages = pages();
    const scale = renderZoom() / 100;
    cancel();
    const current = renderGeneration;
    if (!currentPages.length) return;
    void (async () => {
      await renderBarrier;
      try {
        for (let i = 0; i < currentPages.length; i++) {
          if (current !== renderGeneration) return;
          const page = currentPages[i];
          const canvas = canvases[i];
          if (!page || !canvas) continue;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas context unavailable");
          const viewport = page.getViewport({
            scale: scale * (window.devicePixelRatio || 1),
          });
          const size = page.getViewport({ scale: zoom() / 100 });
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${size.width}px`;
          canvas.style.height = `${size.height}px`;
          const task = page.render({
            canvas,
            canvasContext: context,
            viewport,
          });
          tasks.push(task);
          await task.promise;
        }
      } catch (error) {
        if (
          current !== renderGeneration ||
          (error instanceof Error &&
            error.name === "RenderingCancelledException")
        )
          return;
        setStatus("error");
      }
    })();
  });
  onMount(() => {
    const hidden = () =>
      body?.closest(".pane--hidden, [hidden], [aria-hidden='true']") != null;
    const pan = body
      ? attachPreviewPan(body, { isActive: () => !hidden() })
      : undefined;
    stopFling = pan?.stopFling;
    const keydown = (event: KeyboardEvent) => {
      if (
        hidden() ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isEditableKeyboardTarget(event.target)
      )
        return;
      const direction =
        event.key === "+" ? "in" : event.key === "-" ? "out" : null;
      if (direction === null) return;
      event.preventDefault();
      clearZoomTimer();
      const next = nextPreviewZoom(
        zoom(),
        direction,
        RENDERED_PREVIEW_ZOOM_MAX,
      );
      setZoom(next);
      setRenderZoom(next);
    };
    const wheel = (event: WheelEvent) => {
      if (hidden() || !body) return;
      const next = applyWheelZoom(event, zoom(), RENDERED_PREVIEW_ZOOM_MAX);
      if (next === null) return;
      const rect = body.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const scrollLeft = body.scrollLeft;
      const scrollTop = body.scrollTop;
      let anchor = canvases[0];
      for (const canvas of canvases) {
        if (measureAnchor(body, canvas).originY <= scrollTop + y)
          anchor = canvas;
      }
      const before = anchor ? measureAnchor(body, anchor) : undefined;
      setZoom(next);
      pages().forEach((page, i) => {
        const canvas = canvases[i];
        if (!canvas) return;
        const size = page.getViewport({ scale: next / 100 });
        canvas.style.width = `${size.width}px`;
        canvas.style.height = `${size.height}px`;
      });
      if (anchor && before) {
        const after = measureAnchor(body, anchor);
        body.scrollLeft = pdfPageAnchorScroll(
          scrollLeft,
          x,
          before.originX,
          before.width,
          after.originX,
          after.width,
        );
        body.scrollTop = pdfPageAnchorScroll(
          scrollTop,
          y,
          before.originY,
          before.height,
          after.originY,
          after.height,
        );
      }
      clearZoomTimer();
      zoomTimer = setTimeout(() => {
        zoomTimer = undefined;
        setRenderZoom(zoom());
      }, 150);
    };
    window.addEventListener("keydown", keydown);
    body?.addEventListener("wheel", wheel, { passive: false });
    onCleanup(() => {
      pan?.detach();
      stopFling = undefined;
      clearZoomTimer();
      window.removeEventListener("keydown", keydown);
      body?.removeEventListener("wheel", wheel);
    });
  });
  onCleanup(() => {
    generation++;
    cancel();
    if (handle) void handle.destroy().catch(() => {});
  });
  return (
    <section class="pane">
      <PreviewHeader fileName={props.fileName}>
        <span>PDF</span>
        <Show when={status() === "ready"}>
          <span>{pages().length} pages</span>
        </Show>
        <span class="preview__zoom" aria-live="polite">
          {Math.round(zoom())}%
        </span>
      </PreviewHeader>
      <div ref={body} class="pane__body preview preview--pdf">
        <Show when={status() !== "error"}>
          <For each={pages()}>
            {(_page, index) => (
              <canvas
                class="preview-pdf-page"
                ref={(element) => {
                  canvases[index()] = element;
                }}
              />
            )}
          </For>
        </Show>
        <Show when={status() === "error"}>
          <div class="preview-pdf__error">
            Unable to load PDF.
            <button
              type="button"
              class="button"
              onClick={() => void openPath(props.path)}
            >
              Open in default app
            </button>
          </div>
        </Show>
      </div>
    </section>
  );
}

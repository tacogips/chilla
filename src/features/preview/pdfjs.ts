import { getDocument, PDFWorker } from "pdfjs-dist/legacy/build/pdf.mjs";
import PdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker";

export interface PdfRenderTaskLike {
  readonly promise: Promise<unknown>;
  cancel(): void;
}
export interface PdfViewportLike {
  readonly width: number;
  readonly height: number;
}
export interface PdfPageLike {
  getViewport(params: { scale: number }): PdfViewportLike;
  render(params: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewportLike;
  }): PdfRenderTaskLike;
  cleanup(): void;
}
export interface PdfDocumentLike {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
}
export interface PdfLoadHandle {
  readonly promise: Promise<PdfDocumentLike>;
  destroy(): Promise<void>;
}
export interface PdfDocumentParams {
  readonly url: string;
  readonly isEvalSupported: false;
  readonly enableXfa: false;
  readonly cMapUrl: string;
  readonly cMapPacked: true;
  readonly standardFontDataUrl: string;
  readonly wasmUrl: string;
  readonly useWasm: false;
}

export function buildPdfDocumentParams(
  url: string,
  baseHref = window.location.href,
): PdfDocumentParams {
  return {
    url,
    isEvalSupported: false,
    enableXfa: false,
    cMapUrl: new URL("/pdfjs/cmaps/", baseHref).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("/pdfjs/standard_fonts/", baseHref).href,
    wasmUrl: new URL("/pdfjs/wasm/", baseHref).href,
    useWasm: false,
  };
}

let worker: Worker | undefined;
let sharedPdfWorker: PDFWorker | undefined;
function ensurePdfWorker(): { port: Worker; pdfWorker: PDFWorker } {
  if (worker && sharedPdfWorker)
    return { port: worker, pdfWorker: sharedPdfWorker };
  let created: Worker | undefined;
  let wrapper: PDFWorker | undefined;
  try {
    created = new PdfWorker();
    const port = created;
    // The generated pdf.js declaration incorrectly restricts port to null.
    const PortPDFWorker = PDFWorker as unknown as new (params: {
      port: Worker;
    }) => PDFWorker;
    wrapper = new PortPDFWorker({ port });
    const pdfWorker = wrapper;
    port.addEventListener("error", () => {
      if (worker === port) {
        worker = undefined;
        sharedPdfWorker = undefined;
        pdfWorker.destroy();
        port.terminate();
      }
    });
    worker = port;
    sharedPdfWorker = pdfWorker;
    return { port, pdfWorker };
  } catch (error) {
    wrapper?.destroy();
    created?.terminate();
    worker = undefined;
    sharedPdfWorker = undefined;
    throw error;
  }
}

export function loadPdfDocument(url: string): PdfLoadHandle {
  let currentWorker: { port: Worker; pdfWorker: PDFWorker };
  try {
    currentWorker = ensurePdfWorker();
  } catch (error) {
    return { promise: Promise.reject(error), destroy: async () => {} };
  }
  const loadingTask = getDocument({
    ...buildPdfDocumentParams(url),
    worker: currentWorker.pdfWorker,
  });
  let onError: (event: Event) => void = () => {};
  const workerError = new Promise<never>((_resolve, reject) => {
    onError = () => reject(new Error("PDF worker failed"));
    currentWorker.port.addEventListener("error", onError, { once: true });
  });
  const promise = Promise.race([loadingTask.promise, workerError]).finally(() =>
    currentWorker.port.removeEventListener("error", onError),
  );
  return {
    promise: promise as unknown as Promise<PdfDocumentLike>,
    destroy: () => loadingTask.destroy(),
  };
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workers: [] as EventTarget[],
  failConstructor: false,
  failPdfConstructor: false,
  pdfWorkers: [] as { port: EventTarget; destroy: () => void }[],
  pdfDestroy: vi.fn(),
  workerOptions: { workerPort: null as EventTarget | null },
  destroy: vi.fn(async () => {}),
  getDocument: vi.fn(),
  terminate: vi.fn(),
}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: mocks.getDocument,
  GlobalWorkerOptions: mocks.workerOptions,
  PDFWorker: class {
    port: EventTarget;
    destroy = mocks.pdfDestroy;
    constructor({ port }: { port: EventTarget }) {
      if (mocks.failPdfConstructor)
        throw new Error("PDFWorker construction failed");
      this.port = port;
      mocks.pdfWorkers.push(this);
    }
  },
}));
vi.mock("pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker", () => ({
  default: class extends EventTarget {
    constructor() {
      super();
      if (mocks.failConstructor) throw new Error("worker construction failed");
      mocks.workers.push(this);
    }
    terminate = mocks.terminate;
  },
}));

beforeEach(() => {
  vi.resetModules();
  mocks.workers.length = 0;
  mocks.failConstructor = false;
  mocks.failPdfConstructor = false;
  mocks.pdfWorkers.length = 0;
  mocks.pdfDestroy.mockClear();
  mocks.workerOptions.workerPort = null;
  mocks.destroy.mockClear();
  mocks.terminate.mockClear();
  mocks.getDocument.mockReset();
  mocks.getDocument.mockReturnValue({
    promise: new Promise(() => {}),
    destroy: mocks.destroy,
  });
});

describe("pdfjs foundation", () => {
  it("builds local resource URLs and disables unsafe features", async () => {
    const { buildPdfDocumentParams } = await import("./pdfjs");
    expect(
      buildPdfDocumentParams(
        "asset://x.pdf?revision=1",
        "tauri://localhost/index.html",
      ),
    ).toEqual({
      url: "asset://x.pdf?revision=1",
      isEvalSupported: false,
      enableXfa: false,
      cMapUrl: "tauri://localhost/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "tauri://localhost/pdfjs/standard_fonts/",
      wasmUrl: "tauri://localhost/pdfjs/wasm/",
      useWasm: false,
    });
  });
  it("reuses the worker, passes all parameters and destroys only the task", async () => {
    const { loadPdfDocument, buildPdfDocumentParams } = await import("./pdfjs");
    const first = loadPdfDocument("asset://x.pdf");
    loadPdfDocument("asset://y.pdf");
    expect(mocks.workers).toHaveLength(1);
    expect(mocks.workerOptions.workerPort).toBeNull();
    expect(mocks.pdfWorkers).toHaveLength(1);
    expect(mocks.pdfWorkers[0]?.port).toBe(mocks.workers[0]);
    expect(mocks.workerOptions).not.toHaveProperty("workerSrc");
    expect(mocks.getDocument).toHaveBeenCalledWith({
      ...buildPdfDocumentParams("asset://x.pdf"),
      worker: mocks.pdfWorkers[0],
    });
    expect(mocks.getDocument).toHaveBeenNthCalledWith(2, {
      ...buildPdfDocumentParams("asset://y.pdf"),
      worker: mocks.pdfWorkers[0],
    });
    const destruction = first.destroy();
    expect(() => loadPdfDocument("asset://z.pdf")).not.toThrow();
    expect(mocks.getDocument).toHaveBeenNthCalledWith(3, {
      ...buildPdfDocumentParams("asset://z.pdf"),
      worker: mocks.pdfWorkers[0],
    });
    await destruction;
    expect(mocks.pdfDestroy).not.toHaveBeenCalled();
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(mocks.terminate).not.toHaveBeenCalled();
  });
  it("rejects on worker error and retries with a new worker", async () => {
    const { loadPdfDocument } = await import("./pdfjs");
    const first = loadPdfDocument("asset://x.pdf");
    mocks.workers[0]?.dispatchEvent(new Event("error"));
    await expect(first.promise).rejects.toThrow("PDF worker failed");
    expect(mocks.workerOptions.workerPort).toBeNull();
    expect(mocks.pdfDestroy).toHaveBeenCalledOnce();
    expect(mocks.terminate).toHaveBeenCalledOnce();
    loadPdfDocument("asset://y.pdf");
    expect(mocks.workers).toHaveLength(2);
    expect(mocks.pdfWorkers).toHaveLength(2);
  });
  it("rejects construction failure and retries", async () => {
    const { loadPdfDocument } = await import("./pdfjs");
    mocks.failConstructor = true;
    await expect(loadPdfDocument("asset://x.pdf").promise).rejects.toThrow(
      "worker construction failed",
    );
    mocks.failConstructor = false;
    loadPdfDocument("asset://y.pdf");
    expect(mocks.workers).toHaveLength(1);
  });
  it("cleans up a port when PDFWorker construction fails and retries", async () => {
    const { loadPdfDocument } = await import("./pdfjs");
    mocks.failPdfConstructor = true;
    await expect(loadPdfDocument("asset://x.pdf").promise).rejects.toThrow(
      "PDFWorker construction failed",
    );
    expect(mocks.terminate).toHaveBeenCalledOnce();
    mocks.failPdfConstructor = false;
    loadPdfDocument("asset://y.pdf");
    expect(mocks.workers).toHaveLength(2);
    expect(mocks.pdfWorkers).toHaveLength(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { PdfFilePreviewPane } from "./PdfFilePreviewPane";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc(path: string) {
    return `asset://${path}`;
  },
}));

describe("PdfFilePreviewPane", () => {
  let dispose: VoidFunction | undefined;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    dispose?.();
    document.body.innerHTML = "";
  });

  it("includes the backend revision in the iframe URL", () => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <PdfFilePreviewPane
          fileName="report.pdf"
          path="/workspace/report.pdf"
          revision="2026-08-17T01:02:03Z"
        />
      ),
      root,
    );

    const frame =
      document.querySelector<HTMLIFrameElement>(".preview-pdf-frame");
    expect(frame).not.toBeNull();
    expect(root.querySelector(".preview__file-name")?.textContent).toBe(
      "report.pdf",
    );
    expect(new URL(frame?.src ?? "").searchParams.get("revision")).toBe(
      "2026-08-17T01:02:03Z",
    );
  });

  it("refreshes the iframe when the modification marker is unchanged", () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");
    const [generation, setGeneration] = createSignal(0);
    dispose = render(
      () => (
        <PdfFilePreviewPane
          fileName="report.pdf"
          path="/workspace/report.pdf"
          revision="unchanged"
          localResourceGeneration={generation()}
        />
      ),
      root,
    );
    const frame = root.querySelector<HTMLIFrameElement>("iframe");
    const firstUrl = frame?.src;
    setGeneration(1);
    expect(frame?.src).not.toBe(firstUrl);
    expect(new URL(frame?.src ?? "").searchParams.get("chilla_refresh")).toBe(
      "1",
    );
  });
});

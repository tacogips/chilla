import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import {
  mermaidThemeVariables,
  nextPreviewZoom,
  PreviewPane,
} from "./PreviewPane";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc(path: string) {
    return `asset://${path}`;
  },
}));

vi.mock("@tauri-apps/api/path", () => ({
  async dirname(path: string) {
    return path.slice(0, path.lastIndexOf("/"));
  },
  async join(...paths: string[]) {
    return paths.join("/").replace(/\/{2,}/g, "/");
  },
  async normalize(path: string) {
    return path.replace(/\\/g, "/");
  },
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  async openPath() {
    return undefined;
  },
  async openUrl() {
    return undefined;
  },
}));

let dispose: VoidFunction | undefined;

describe("PreviewPane", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    const rootStyle = document.documentElement.style;
    rootStyle.removeProperty("--markdown-surface");
    rootStyle.removeProperty("--markdown-pre-bg");
    rootStyle.removeProperty("--markdown-fg");
    rootStyle.removeProperty("--markdown-heading");
    rootStyle.removeProperty("--markdown-muted");
    rootStyle.removeProperty("--markdown-border");
    rootStyle.removeProperty("--font-sans");
    document.body.innerHTML = "";
  });

  it("upgrades asciinema poster links into embedded players", async () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <PreviewPane
          colorScheme="dark"
          documentPath={null}
          html={[
            "<p>",
            '<a href="https://asciinema.org/a/542159">',
            '<img src="https://asciinema.org/a/542159.svg" alt="asciicast" />',
            "</a>",
            "</p>",
          ].join("")}
          selectedAnchorId={null}
          visible={true}
        />
      ),
      root,
    );

    await waitFor(() => {
      const script = document.querySelector<HTMLScriptElement>(
        'script[src="https://asciinema.org/a/542159.js"]',
      );
      expect(script).not.toBeNull();
      expect(document.body.textContent).toContain("Open recording in browser");
    });
  });

  it("renders KaTeX markup for pulldown-cmark math spans", async () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--markdown-surface", "#ffffff");
    rootStyle.setProperty("--markdown-pre-bg", "#f6f8fa");
    rootStyle.setProperty("--markdown-fg", "#1f2328");
    rootStyle.setProperty("--markdown-heading", "#0f172a");
    rootStyle.setProperty("--markdown-muted", "#59636e");
    rootStyle.setProperty("--markdown-border", "#d0d7de");

    dispose = render(
      () => (
        <PreviewPane
          colorScheme="dark"
          documentPath={null}
          html={[
            '<p>Inline <span class="math math-inline">x^2</span> and block</p>',
            '<p><span class="math math-display">\\sum_{i=1}^n i</span></p>',
          ].join("")}
          selectedAnchorId={null}
          visible={true}
        />
      ),
      root,
    );

    await waitFor(() => {
      const roots = document.querySelectorAll(".preview__content .katex");
      expect(roots.length).toBe(2);
    });

    const preview = document.querySelector(".preview__content");
    expect(preview).not.toBeNull();

    const inlineMath = preview?.querySelector(".math.math-inline .katex");
    expect(inlineMath).not.toBeNull();
    expect(inlineMath?.classList.contains("katex-display")).toBe(false);

    expect(preview?.querySelector(".katex-display")).not.toBeNull();
  });

  it("leaves ordinary linked images unchanged", async () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <PreviewPane
          colorScheme="dark"
          documentPath={null}
          html={[
            "<p>",
            '<a href="https://example.com/demo">',
            '<img src="https://example.com/demo.svg" alt="demo" />',
            "</a>",
            "</p>",
          ].join("")}
          selectedAnchorId={null}
          visible={true}
        />
      ),
      root,
    );

    await waitFor(() => {
      expect(document.querySelector(".preview-media--asciinema")).toBeNull();
      expect(
        document.querySelector('a[href="https://example.com/demo"]'),
      ).not.toBeNull();
    });
  });

  it("shows an open-path fallback when a local HEIC image fails to load", async () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <PreviewPane
          colorScheme="dark"
          documentPath="/docs/notes/guide.md"
          html='<p><img src="./images/photo.heic" alt="photo" /></p>'
          selectedAnchorId={null}
          visible={true}
        />
      ),
      root,
    );

    const image = await waitForElement<HTMLImageElement>(
      'img[src="asset:///docs/notes/./images/photo.heic"]',
    );
    image.dispatchEvent(new Event("error"));

    await waitFor(() => {
      expect(document.body.textContent).toContain(
        "Image preview is not available.",
      );
      expect(document.body.textContent).toContain("./images/photo.heic");
      expect(document.body.textContent).toContain("Open in default app");
    });
  });

  it("maps Mermaid theme colors from the active preview element", () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    const rootStyle = document.documentElement.style;

    rootStyle.setProperty("--markdown-surface", "#ffffff");
    rootStyle.setProperty("--markdown-pre-bg", "#f6f8fa");
    rootStyle.setProperty("--markdown-fg", "#1f2328");
    rootStyle.setProperty("--markdown-heading", "#0f172a");
    rootStyle.setProperty("--markdown-muted", "#59636e");
    rootStyle.setProperty("--markdown-border", "#d0d7de");
    rootStyle.setProperty("--font-sans", '"Segoe UI", sans-serif');

    dispose = render(
      () => (
        <PreviewPane
          colorScheme="dark"
          documentPath={null}
          html="<p>Mermaid theme probe</p>"
          selectedAnchorId={null}
          visible={true}
        />
      ),
      root,
    );

    const preview = document.querySelector(".preview__content");

    if (!(preview instanceof HTMLElement)) {
      throw new Error("missing preview content element");
    }

    expect(mermaidThemeVariables(preview)).toEqual({
      background: "#0d1117",
      primaryColor: "#161b22",
      primaryTextColor: "#c9d1d9",
      primaryBorderColor: "#30363d",
      secondaryColor: "#161b22",
      secondaryTextColor: "#c9d1d9",
      secondaryBorderColor: "#30363d",
      tertiaryColor: "#161b22",
      tertiaryTextColor: "#c9d1d9",
      tertiaryBorderColor: "#30363d",
      noteBkgColor: "#161b22",
      noteTextColor: "#c9d1d9",
      noteBorderColor: "#30363d",
      lineColor: "#30363d",
      textColor: "#c9d1d9",
      mainBkg: "#161b22",
      nodeBkg: "#161b22",
      nodeBorder: "#30363d",
      clusterBkg: "#161b22",
      clusterBorder: "#30363d",
      defaultLinkColor: "#8b949e",
      titleColor: "#f0f6fc",
      edgeLabelBackground: "#0d1117",
      nodeTextColor: "#c9d1d9",
      fontFamily: '"Segoe UI", sans-serif',
      fontSize: "16px",
    });
  });

  it("renders a custom subtitle when provided", () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <PreviewPane
          colorScheme="dark"
          documentPath={null}
          html="<p>Plain text preview</p>"
          selectedAnchorId={null}
          subtitle="File type: text/plain | File size: 10 B"
          visible={true}
        />
      ),
      root,
    );

    expect(document.body.textContent).toContain(
      "File type: text/plain | File size: 10 B",
    );
    expect(document.body.textContent).not.toContain("Rendered HTML");
  });

  it("zooms with plus and minus keyboard shortcuts", () => {
    renderPreview();

    expect(previewZoomText()).toBe("100%");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    expect(previewZoomText()).toBe("110%");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "-" }));
    expect(previewZoomText()).toBe("100%");
  });

  it("ignores preview zoom shortcuts from editable targets", () => {
    renderPreview();
    const input = document.createElement("input");
    document.body.append(input);

    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "+" }),
    );

    expect(previewZoomText()).toBe("100%");
  });

  it("handles Ctrl+wheel over the preview without changing ordinary wheel behavior", () => {
    renderPreview();
    const preview = document.querySelector<HTMLElement>(".pane__body.preview");

    if (preview === null) {
      throw new Error("missing preview body");
    }

    const zoomIn = new WheelEvent("wheel", {
      cancelable: true,
      ctrlKey: true,
      deltaY: -1,
    });
    preview.dispatchEvent(zoomIn);
    expect(zoomIn.defaultPrevented).toBe(true);
    expect(previewZoomText()).toBe("110%");

    const zoomOut = new WheelEvent("wheel", {
      cancelable: true,
      ctrlKey: true,
      deltaY: 1,
    });
    preview.dispatchEvent(zoomOut);
    expect(zoomOut.defaultPrevented).toBe(true);
    expect(previewZoomText()).toBe("100%");

    const ordinaryWheel = new WheelEvent("wheel", {
      cancelable: true,
      deltaY: -1,
    });
    preview.dispatchEvent(ordinaryWheel);
    expect(ordinaryWheel.defaultPrevented).toBe(false);
    expect(previewZoomText()).toBe("100%");
  });

  it("clamps zoom and scales the whole rendered content surface", () => {
    renderPreview('<p>Text</p><img src="https://example.com/image.png" />');

    for (let step = 0; step < 30; step += 1) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    }
    expect(previewZoomText()).toBe("300%");

    const surface = document.querySelector<HTMLElement>(
      ".preview__zoom-surface",
    );
    expect(surface?.style.getPropertyValue("--preview-zoom-scale")).toBe("3");
    expect(surface?.querySelector("img")).not.toBeNull();

    for (let step = 0; step < 30; step += 1) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "-" }));
    }
    expect(previewZoomText()).toBe("50%");

    expect(nextPreviewZoom(300, "in")).toBe(300);
    expect(nextPreviewZoom(50, "out")).toBe(50);
  });
});

function renderPreview(html = "<p>Preview content</p>"): void {
  const root = document.getElementById("root");

  if (root === null) {
    throw new Error("missing test root");
  }

  dispose = render(
    () => (
      <PreviewPane
        colorScheme="dark"
        documentPath={null}
        html={html}
        selectedAnchorId={null}
        visible={true}
      />
    ),
    root,
  );
}

function previewZoomText(): string | null {
  return document.querySelector(".preview__zoom")?.textContent ?? null;
}

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

async function waitForElement<T extends Element>(
  selector: string,
  timeoutMs = 2_000,
): Promise<T> {
  let element: T | null = null;

  await waitFor(() => {
    element = document.querySelector<T>(selector);
    expect(element).not.toBeNull();
  }, timeoutMs);

  if (element === null) {
    throw new Error(`missing element for selector: ${selector}`);
  }

  return element;
}

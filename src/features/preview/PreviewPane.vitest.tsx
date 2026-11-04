import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { readFileSync } from "node:fs";
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it("gives source one inset code scroll area and keeps metadata outside zoom", () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");
    const css = readFileSync("src/app/App.css", "utf8");
    const sourceCss = css.slice(
      css.indexOf(".pane__body.preview--source {"),
      css.indexOf("\n.empty {"),
    );
    const style = document.createElement("style");
    style.textContent = sourceCss;
    root.append(style);
    dispose = render(
      () => (
        <PreviewPane
          colorScheme="dark"
          documentPath={null}
          fileName="sample.py"
          layout="source"
          subtitle="Redundant metadata"
          selectedAnchorId={null}
          visible={true}
          html={
            '<section class="file-preview file-preview--text"><pre>print(&quot;hello&quot;)\n</pre><footer class="file-preview__meta" aria-label="File information">Python · 15 B</footer></section>'
          }
        />
      ),
      root,
    );
    const body = root.querySelector<HTMLElement>(".preview--source");
    const content = root.querySelector<HTMLElement>(".preview__source-content");
    const pre = root.querySelector("pre");
    const footer = root.querySelector("footer");
    if (body === null || content === null || pre === null || footer === null)
      throw new Error("missing source layout");
    expect(getComputedStyle(body).padding).toBe("0px");
    expect(getComputedStyle(body).overflow).toBe("hidden");
    expect(getComputedStyle(pre).padding).toBe("8px");
    expect(getComputedStyle(pre).overflow).toBe("auto");
    expect(getComputedStyle(pre).whiteSpace).toBe("pre");
    expect(getComputedStyle(footer).fontSize).toBe("12px");
    expect(pre.nextElementSibling).toBe(footer);
    expect(pre.textContent).toBe('print("hello")\n');
    expect(root.querySelector(".preview__zoom-surface")).toBeNull();
    expect(root.querySelector(".markdown-body")).toBeNull();
    expect(root.querySelector(".pane__header")?.textContent).not.toContain(
      "Redundant metadata",
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    expect(content.style.getPropertyValue("--preview-zoom-scale")).toBe("1.1");
    expect(getComputedStyle(footer).fontSize).toBe("12px");
    expect(sourceCss).toContain(
      "font-size: calc(14px * var(--preview-zoom-scale))",
    );
  });

  it("inserts source HTML only once per content update", () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");
    const initial =
      '<section class="file-preview--text"><pre>first</pre><footer>Python</footer></section>';
    const updated =
      '<section class="file-preview--text"><pre>second</pre><footer>JSON</footer></section>';
    const setter = vi.spyOn(Element.prototype, "innerHTML", "set");
    try {
      const [html, setHtml] = createSignal(initial);
      dispose = render(
        () => (
          <PreviewPane
            colorScheme="dark"
            documentPath={null}
            fileName="sample"
            layout="source"
            selectedAnchorId={null}
            visible={true}
            html={html()}
          />
        ),
        root,
      );
      expect(
        setter.mock.calls.filter(([value]) => value === initial),
      ).toHaveLength(1);
      setHtml(updated);
      expect(
        setter.mock.calls.filter(([value]) => value === updated),
      ).toHaveLength(1);
      expect(root.querySelector("pre")?.textContent).toBe("second");
    } finally {
      setter.mockRestore();
    }
  });

  it("switches source layout off for rendered content without losing zoom", () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");
    const [layout, setLayout] = createSignal<"source" | "rendered">("source");
    dispose = render(
      () => (
        <PreviewPane
          colorScheme="light"
          documentPath={null}
          fileName="sample"
          layout={layout()}
          selectedAnchorId={null}
          visible={true}
          html="<pre></pre>"
        />
      ),
      root,
    );
    expect(root.querySelector(".preview--source")).not.toBeNull();
    setLayout("rendered");
    expect(root.querySelector(".preview--source")).toBeNull();
    expect(
      root.querySelector(".preview__zoom-surface.markdown-body"),
    ).not.toBeNull();
    expect(root.querySelector(".pane__header")?.textContent).toContain(
      "Rendered HTML",
    );
  });

  it("shows the selected basename and updates it reactively", () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    const [fileName, setFileName] = createSignal("first-note.md");
    dispose = render(
      () => (
        <PreviewPane
          colorScheme="dark"
          documentPath="/workspace/first-note.md"
          fileName={fileName()}
          html="<p>Preview content</p>"
          selectedAnchorId={null}
          visible={true}
        />
      ),
      root,
    );

    const headerFileName = root.querySelector(".preview__file-name");
    expect(headerFileName?.textContent).toBe("first-note.md");
    expect(headerFileName?.getAttribute("title")).toBe("first-note.md");
    expect(root.querySelector(".pane__header")?.textContent).not.toContain(
      "/workspace/",
    );

    setFileName("renamed-note-with-a-long-basename.md");

    expect(headerFileName?.textContent).toBe(
      "renamed-note-with-a-long-basename.md",
    );
    expect(headerFileName?.getAttribute("title")).toBe(
      "renamed-note-with-a-long-basename.md",
    );
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
          fileName="sample.md"
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
          fileName="sample.md"
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
          fileName="sample.md"
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
          fileName="guide.md"
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

  it("changes only a direct SVG image URL when its revision changes", async () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");
    const [revision, setRevision] = createSignal("2026-01-01T00:00:00Z");
    dispose = render(
      () => (
        <PreviewPane
          colorScheme="dark"
          documentPath="/docs/chart.svg"
          fileName="chart.svg"
          html='<figure><img src="/docs/chart.svg" alt="chart" /></figure>'
          imageRevision={revision()}
          selectedAnchorId={null}
          visible={true}
        />
      ),
      root,
    );
    const image = await waitForElement<HTMLImageElement>(
      'img[src*="chilla_revision="]',
    );
    const firstUrl = image.src;
    expect(new URL(firstUrl).searchParams.get("chilla_revision")).toBe(
      "2026-01-01T00:00:00Z",
    );

    setRevision("2026-01-02T00:00:00Z");
    await waitFor(() => {
      const refreshed = root.querySelector<HTMLImageElement>("img");
      expect(refreshed?.src).not.toBe(firstUrl);
      expect(
        new URL(refreshed?.src ?? "").searchParams.get("chilla_revision"),
      ).toBe("2026-01-02T00:00:00Z");
    });
  });

  it("refreshes a direct image when its modification marker is unchanged", async () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");
    const [generation, setGeneration] = createSignal(0);
    dispose = render(
      () => (
        <PreviewPane
          colorScheme="dark"
          documentPath="/docs/chart.svg"
          fileName="chart.svg"
          html='<figure><img src="/docs/chart.svg" alt="chart" /></figure>'
          imageRevision="unchanged"
          localResourceGeneration={generation()}
          selectedAnchorId={null}
          visible={true}
        />
      ),
      root,
    );
    const image = await waitForElement<HTMLImageElement>('img[alt="chart"]');
    await waitFor(() => expect(image.src).toContain("chilla_revision="));
    const firstUrl = image.src;
    setGeneration(1);
    await waitFor(() => {
      const refreshed =
        root.querySelector<HTMLImageElement>('img[alt="chart"]');
      expect(refreshed?.src).not.toBe(firstUrl);
      expect(
        new URL(refreshed?.src ?? "").searchParams.get("chilla_refresh"),
      ).toBe("1");
      expect(
        new URL(refreshed?.src ?? "").searchParams.get("chilla_revision"),
      ).toBe("unchanged");
    });
  });

  it("leaves embedded Markdown image URLs without a document revision", async () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");
    dispose = render(
      () => (
        <PreviewPane
          colorScheme="dark"
          documentPath="/docs/notes.md"
          fileName="notes.md"
          html='<p><img src="./chart.svg" alt="chart" /></p>'
          selectedAnchorId={null}
          visible={true}
        />
      ),
      root,
    );
    const image = await waitForElement<HTMLImageElement>(
      'img[src="asset:///docs/./chart.svg"]',
    );
    expect(image.src).not.toContain("chilla_revision");
  });

  it("refreshes unchanged local assets without changing remote URLs", async () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");
    const [generation, setGeneration] = createSignal(0);
    dispose = render(
      () => (
        <PreviewPane
          colorScheme="dark"
          documentPath="/docs/notes.md"
          fileName="notes.md"
          html={
            '<img src="./chart.svg?size=small" alt="local" /><audio src="./note.mp3"></audio><img src="https://example.com/chart.svg" alt="remote" />'
          }
          localResourceGeneration={generation()}
          selectedAnchorId={null}
          visible={true}
        />
      ),
      root,
    );
    const localImage =
      await waitForElement<HTMLImageElement>('img[alt="local"]');
    await waitFor(() => expect(localImage.src).toContain("asset:///docs/"));
    const firstUrl = localImage.src;

    setGeneration(1);
    await waitFor(() => {
      const refreshed =
        root.querySelector<HTMLImageElement>('img[alt="local"]');
      expect(refreshed?.src).not.toBe(firstUrl);
      const url = new URL(refreshed?.src ?? "");
      expect(url.searchParams.get("size")).toBe("small");
      expect(url.searchParams.get("chilla_refresh")).toBe("1");
      expect(url.searchParams.has("chilla_revision")).toBe(false);
      expect(
        new URL(
          root.querySelector<HTMLAudioElement>("audio")?.src ?? "",
        ).searchParams.get("chilla_refresh"),
      ).toBe("1");
      expect(
        root.querySelector<HTMLImageElement>('img[alt="remote"]')?.src,
      ).toBe("https://example.com/chart.svg");
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
          fileName="sample.md"
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
          fileName="sample.txt"
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
      deltaY: -100,
    });
    preview.dispatchEvent(zoomIn);
    expect(zoomIn.defaultPrevented).toBe(true);
    expect(previewZoomText()).toBe("116%");

    const zoomOut = new WheelEvent("wheel", {
      cancelable: true,
      ctrlKey: true,
      deltaY: 100,
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

  it("ignores plain and Alt wheel, smoothly zooms with Ctrl or Meta, and clamps", () => {
    renderPreview();
    const preview = previewBodyWithPointerCapture();
    const wheel = (options: WheelEventInit) => {
      const event = new WheelEvent("wheel", { ...options, cancelable: true });
      preview.dispatchEvent(event);
      return event;
    };
    expect(wheel({ altKey: true, deltaY: -100 }).defaultPrevented).toBe(false);
    expect(wheel({ deltaY: -100 }).defaultPrevented).toBe(false);
    expect(previewZoomText()).toBe("100%");
    expect(wheel({ ctrlKey: true, deltaY: -100 }).defaultPrevented).toBe(true);
    expect(previewZoomText()).toBe("116%");
    expect(wheel({ metaKey: true, deltaY: -100 }).defaultPrevented).toBe(true);
    expect(previewZoomText()).toBe("135%");
    expect(wheel({ ctrlKey: true, deltaY: 0 }).defaultPrevented).toBe(false);
    wheel({ ctrlKey: true, deltaY: -10000 });
    expect(previewZoomText()).toBe("300%");
    wheel({ ctrlKey: true, deltaY: 10000 });
    expect(previewZoomText()).toBe("50%");
  });

  it("ignores Ctrl wheel on a hidden pane", () => {
    renderPreview(undefined, false, false);
    const preview = previewBodyWithPointerCapture();
    const event = new WheelEvent("wheel", {
      ctrlKey: true,
      cancelable: true,
      deltaY: -100,
    });
    preview.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(previewZoomText()).toBe("100%");
  });

  it("clamps ordinary rendered content at 300% and scales the whole surface", () => {
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

  it("lets direct raster image previews reach and clamp at 800%", () => {
    renderPreview('<img src="https://example.com/image.png" />', true);
    const preview = document.querySelector<HTMLElement>(".pane__body.preview");

    if (preview === null) {
      throw new Error("missing preview body");
    }

    for (let step = 0; step < 70; step += 1) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    }
    expect(previewZoomText()).toBe("800%");

    preview.dispatchEvent(ctrlWheelUp());
    expect(previewZoomText()).toBe("800%");
    expect(nextPreviewZoom(800, "in", 800)).toBe(800);
  });

  it("lets direct SVG previews reach and clamp at 800%", () => {
    renderPreview('<svg viewBox="0 0 10 10"></svg>', true);
    const preview = document.querySelector<HTMLElement>(".pane__body.preview");

    if (preview === null) {
      throw new Error("missing preview body");
    }

    for (let step = 0; step < 1500; step += 1) {
      preview.dispatchEvent(ctrlWheelUp());
    }
    expect(previewZoomText()).toBe("800%");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    expect(previewZoomText()).toBe("800%");
    expect(nextPreviewZoom(800, "in", 800)).toBe(800);
  });

  it("pans a direct image in the same direction as a left-button drag", () => {
    renderPreview('<img src="https://example.com/image.png" />', true);
    const preview = previewBodyWithPointerCapture();
    preview.scrollLeft = 100;
    preview.scrollTop = 80;

    const pointerDown = pointerEvent("pointerdown", 7, 20, 30);
    preview.dispatchEvent(pointerDown);
    expect(pointerDown.defaultPrevented).toBe(true);

    const pointerMove = pointerEvent("pointermove", 7, 45, 55);
    preview.dispatchEvent(pointerMove);
    expect(pointerMove.defaultPrevented).toBe(true);
    expect(preview.scrollLeft).toBe(75);
    expect(preview.scrollTop).toBe(55);

    preview.dispatchEvent(pointerEvent("pointerup", 7, 45, 55));
    preview.dispatchEvent(pointerEvent("pointermove", 7, 70, 80));
    expect(preview.scrollLeft).toBe(75);
    expect(preview.scrollTop).toBe(55);
  });

  it("does not drag-pan ordinary rendered content", () => {
    renderPreview('<p id="selectable">Selectable text</p>');
    const preview = previewBodyWithPointerCapture();
    preview.scrollLeft = 100;
    preview.scrollTop = 80;

    const pointerDown = pointerEvent("pointerdown", 3, 20, 30);
    preview.dispatchEvent(pointerDown);
    preview.dispatchEvent(pointerEvent("pointermove", 3, 45, 55));

    expect(pointerDown.defaultPrevented).toBe(false);
    expect(preview.scrollLeft).toBe(100);
    expect(preview.scrollTop).toBe(80);
  });

  it("pans a direct image with the right button", () => {
    renderPreview('<img src="https://example.com/image.png" />', true);
    const preview = previewBodyWithPointerCapture();
    preview.scrollLeft = 100;
    preview.scrollTop = 80;

    const pointerDown = pointerEvent("pointerdown", 8, 20, 30, 2);
    preview.dispatchEvent(pointerDown);
    const pointerMove = pointerEvent("pointermove", 8, 45, 55, 2);
    preview.dispatchEvent(pointerMove);

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(pointerMove.defaultPrevented).toBe(true);
    expect(preview.scrollLeft).toBe(75);
    expect(preview.scrollTop).toBe(55);
  });

  it("pans rendered content with right and middle buttons and suppresses only moved right menus", () => {
    renderPreview();
    const preview = previewBodyWithPointerCapture();
    preview.scrollTop = 100;
    preview.dispatchEvent(pointerEvent("pointerdown", 1, 0, 0, 2));
    preview.dispatchEvent(pointerEvent("pointermove", 1, 0, 10, 2));
    preview.dispatchEvent(pointerEvent("pointerup", 1, 0, 10, 2));
    expect(preview.scrollTop).toBe(90);
    const menu = new MouseEvent("contextmenu", { cancelable: true });
    preview.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    preview.dispatchEvent(pointerEvent("pointerdown", 2, 0, 0, 2));
    preview.dispatchEvent(pointerEvent("pointerup", 2, 0, 0, 2));
    const plain = new MouseEvent("contextmenu", { cancelable: true });
    preview.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
    preview.dispatchEvent(pointerEvent("pointerdown", 3, 0, 0, 1));
    preview.dispatchEvent(pointerEvent("pointermove", 3, 0, 10, 1));
    preview.dispatchEvent(pointerEvent("pointerup", 3, 0, 10, 1));
    expect(preview.scrollTop).toBe(80);
    const middle = new MouseEvent("contextmenu", { cancelable: true });
    preview.dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(false);
  });

  it("ends a chorded right drag when the right button is released", () => {
    renderPreview();
    const preview = previewBodyWithPointerCapture();
    preview.scrollTop = 100;
    preview.dispatchEvent(pointerEvent("pointerdown", 1, 0, 0, 2, 2));
    preview.dispatchEvent(pointerEvent("pointermove", 1, 0, 10, 2, 2));
    preview.dispatchEvent(pointerEvent("pointermove", 1, 0, 20, 2, 3));
    const released = pointerEvent("pointermove", 1, 0, 30, 2, 1);
    preview.dispatchEvent(released);
    expect(released.defaultPrevented).toBe(false);
    expect(preview.scrollTop).toBe(80);
    const menu = new MouseEvent("contextmenu", { cancelable: true });
    preview.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    preview.dispatchEvent(pointerEvent("pointerdown", 2, 0, 0, 2));
    preview.dispatchEvent(pointerEvent("pointermove", 2, 0, 10, 2));
    expect(preview.scrollTop).toBe(70);
  });

  it("does not pan a hidden pane", () => {
    renderPreview(undefined, false, false);
    const preview = previewBodyWithPointerCapture();
    preview.dispatchEvent(pointerEvent("pointerdown", 1, 0, 0, 2));
    preview.dispatchEvent(pointerEvent("pointermove", 1, 0, 10, 2));
    expect(preview.scrollTop).toBe(0);
  });

  it("anchors source zoom and pans the inner pre exactly once", () => {
    const root = document.getElementById("root");
    if (!root) throw new Error("missing root");
    dispose = render(
      () => (
        <PreviewPane
          colorScheme="dark"
          documentPath={null}
          fileName="a"
          layout="source"
          selectedAnchorId={null}
          visible={true}
          html={
            '<section class="file-preview--text"><pre style="padding:8px">test</pre><footer style="font-size:12px">meta</footer></section>'
          }
        />
      ),
      root,
    );
    const preview = previewBodyWithPointerCapture();
    const pre = root.querySelector("pre");
    if (!pre) throw new Error("missing pre");
    pre.scrollTop = 100;
    pre.scrollLeft = 100;
    preview.dispatchEvent(pointerEvent("pointerdown", 1, 0, 0, 2));
    preview.dispatchEvent(pointerEvent("pointermove", 1, 10, 10, 2));
    preview.dispatchEvent(pointerEvent("pointerup", 1, 10, 10, 2));
    expect(pre.scrollTop).toBe(90);
    expect(pre.scrollLeft).toBe(90);
    expect(preview.scrollTop).toBe(0);
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -100,
      clientY: 200,
    });
    pre.dispatchEvent(event);
    expect(previewZoomText()).toBe("116%");
    expect(pre.scrollTop).toBeCloseTo(
      8 + (90 + 200 - 8) * Math.exp(0.15) - 200,
    );
    expect(pre.nextElementSibling?.tagName).toBe("FOOTER");
    expect(
      getComputedStyle(pre.nextElementSibling as HTMLElement).fontSize,
    ).toBe("12px");
  });

  it("anchors rendered zoom to the pointer", () => {
    renderPreview();
    const preview = previewBodyWithPointerCapture();
    const surface = preview.querySelector<HTMLElement>(
      ".preview__zoom-surface",
    );
    if (!surface) throw new Error("missing surface");
    preview.scrollTop = 100;
    preview.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
    surface.getBoundingClientRect = () => {
      const scale = Number(
        surface.style.getPropertyValue("--preview-zoom-scale"),
      );
      return {
        left: 0,
        top: 20 - preview.scrollTop,
        width: 100 * scale,
        height: 100 * scale,
      } as DOMRect;
    };
    preview.dispatchEvent(
      new WheelEvent("wheel", {
        ctrlKey: true,
        deltaY: -100,
        clientY: 200,
        cancelable: true,
      }),
    );
    expect(preview.scrollTop).toBeCloseTo(
      20 + (100 + 200 - 20) * Math.exp(0.15) - 200,
    );
  });

  it("flings a left-dragged image and respects reduced motion", () => {
    const f = previewFrames(false);
    renderPreview("<img />", true);
    const preview = previewBodyWithPointerCapture();
    preview.scrollTop = 100;
    preview.dispatchEvent(pointerEvent("pointerdown", 1, 0, 0, 0, 1, 0));
    preview.dispatchEvent(pointerEvent("pointermove", 1, 0, 20, 0, 1, 40));
    preview.dispatchEvent(pointerEvent("pointerup", 1, 0, 20, 0, 0, 40));
    expect(f.queue.size).toBe(1);
    f.next(16);
    expect(preview.scrollTop).toBeLessThan(80);
    for (let t = 32; f.queue.size && t < 5000; t += 16) f.next(t);
    expect(f.queue.size).toBe(0);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    preview.dispatchEvent(pointerEvent("pointerdown", 2, 0, 0, 0, 1, 0));
    preview.dispatchEvent(pointerEvent("pointermove", 2, 0, 20, 0, 1, 40));
    preview.dispatchEvent(pointerEvent("pointerup", 2, 0, 20, 0, 0, 40));
    expect(f.queue.size).toBe(0);
  });

  it("stops a source fling when its HTML replaces the pre", () => {
    const f = previewFrames(false);
    const root = document.getElementById("root");
    if (!root) throw new Error("missing root");
    const [html, setHtml] = createSignal(
      '<section class="file-preview--text"><pre>old</pre></section>',
    );
    dispose = render(
      () => (
        <PreviewPane
          colorScheme="dark"
          documentPath={null}
          fileName="a"
          layout="source"
          selectedAnchorId={null}
          visible={true}
          html={html()}
        />
      ),
      root,
    );
    const preview = previewBodyWithPointerCapture();
    const old = root.querySelector("pre");
    if (!old) throw new Error("missing pre");
    old.scrollTop = 100;
    preview.dispatchEvent(pointerEvent("pointerdown", 1, 0, 0, 2, 2, 0));
    preview.dispatchEvent(pointerEvent("pointermove", 1, 0, 20, 2, 2, 40));
    preview.dispatchEvent(pointerEvent("pointerup", 1, 0, 20, 2, 0, 40));
    expect(f.queue.size).toBe(1);
    const queued = [...f.queue.values()][0];
    setHtml('<section class="file-preview--text"><pre>new</pre></section>');
    const replacement = root.querySelector("pre");
    expect(replacement).not.toBe(old);
    expect(f.queue.size).toBe(0);
    expect(old.scrollTop).toBe(80);
    expect(replacement?.scrollTop).toBe(0);
    expect(queued).toBeDefined();
  });

  it("ends image dragging on cancel and lost pointer capture", () => {
    renderPreview('<img src="https://example.com/image.png" />', true);
    const preview = previewBodyWithPointerCapture();

    preview.dispatchEvent(pointerEvent("pointerdown", 4, 10, 10));
    preview.dispatchEvent(pointerEvent("pointercancel", 4, 10, 10));
    preview.dispatchEvent(pointerEvent("pointermove", 4, 30, 30));
    expect(preview.scrollLeft).toBe(0);
    expect(preview.scrollTop).toBe(0);

    preview.dispatchEvent(pointerEvent("pointerdown", 5, 10, 10));
    preview.dispatchEvent(pointerEvent("lostpointercapture", 5, 10, 10));
    preview.dispatchEvent(pointerEvent("pointermove", 5, 30, 30));
    expect(preview.scrollLeft).toBe(0);
    expect(preview.scrollTop).toBe(0);
  });
});

function renderPreview(
  html = "<p>Preview content</p>",
  dragPanEnabled = false,
  visible = true,
): void {
  const root = document.getElementById("root");

  if (root === null) {
    throw new Error("missing test root");
  }

  dispose = render(
    () => (
      <PreviewPane
        colorScheme="dark"
        fileName="sample.md"
        documentPath={null}
        dragPanEnabled={dragPanEnabled}
        html={html}
        selectedAnchorId={null}
        visible={visible}
      />
    ),
    root,
  );
}

function pointerEvent(
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
  button = 0,
  buttons = type === "pointerup" ? 0 : button === 2 ? 2 : button === 1 ? 4 : 1,
  timeStamp = 0,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: button },
    buttons: { value: buttons },
    timeStamp: { value: timeStamp },
    clientX: { value: clientX },
    clientY: { value: clientY },
    isPrimary: { value: true },
    pointerId: { value: pointerId },
  });
  return event;
}

function previewBodyWithPointerCapture(): HTMLElement {
  const preview = document.querySelector<HTMLElement>(".pane__body.preview");
  if (preview === null) {
    throw new Error("missing preview body");
  }

  const capturedPointers = new Set<number>();
  preview.setPointerCapture = (pointerId: number) => {
    capturedPointers.add(pointerId);
  };
  preview.hasPointerCapture = (pointerId: number) =>
    capturedPointers.has(pointerId);
  preview.releasePointerCapture = (pointerId: number) => {
    capturedPointers.delete(pointerId);
  };
  return preview;
}

function previewZoomText(): string | null {
  return document.querySelector(".preview__zoom")?.textContent ?? null;
}

function ctrlWheelUp(): WheelEvent {
  return new WheelEvent("wheel", {
    cancelable: true,
    ctrlKey: true,
    deltaY: -1,
  });
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

function previewFrames(reduced: boolean) {
  const queue = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queue.set(++id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) =>
    queue.delete(handle),
  );
  vi.spyOn(performance, "now").mockReturnValue(0);
  return {
    queue,
    next(time: number) {
      const first = queue.entries().next().value;
      if (!first) throw new Error("missing frame");
      queue.delete(first[0]);
      first[1](time);
    },
  };
}

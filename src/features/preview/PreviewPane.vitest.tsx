import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { mermaidThemeVariables, PreviewPane } from "./PreviewPane";

describe("PreviewPane", () => {
  let dispose: VoidFunction | undefined;

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

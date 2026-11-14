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

  it("maps Mermaid theme colors from the active CSS custom properties", () => {
    const rootStyle = document.documentElement.style;

    rootStyle.setProperty("--markdown-surface", "#ffffff");
    rootStyle.setProperty("--markdown-pre-bg", "#f6f8fa");
    rootStyle.setProperty("--markdown-fg", "#1f2328");
    rootStyle.setProperty("--markdown-heading", "#0f172a");
    rootStyle.setProperty("--markdown-muted", "#59636e");
    rootStyle.setProperty("--markdown-border", "#d0d7de");

    expect(mermaidThemeVariables()).toEqual({
      background: "#ffffff",
      primaryColor: "#f6f8fa",
      primaryTextColor: "#1f2328",
      primaryBorderColor: "#d0d7de",
      secondaryColor: "#f6f8fa",
      secondaryTextColor: "#1f2328",
      secondaryBorderColor: "#d0d7de",
      tertiaryColor: "#f6f8fa",
      tertiaryTextColor: "#1f2328",
      tertiaryBorderColor: "#d0d7de",
      noteBkgColor: "#f6f8fa",
      noteTextColor: "#1f2328",
      noteBorderColor: "#d0d7de",
      lineColor: "#d0d7de",
      textColor: "#1f2328",
      mainBkg: "#f6f8fa",
      nodeBkg: "#f6f8fa",
      nodeBorder: "#d0d7de",
      clusterBkg: "#f6f8fa",
      clusterBorder: "#d0d7de",
      defaultLinkColor: "#59636e",
      titleColor: "#0f172a",
      edgeLabelBackground: "#ffffff",
      nodeTextColor: "#1f2328",
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

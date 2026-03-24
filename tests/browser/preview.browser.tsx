import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "solid-js/web";
import "../../src/app/App.css";
import { PreviewPane } from "../../src/features/preview/PreviewPane";

describe("PreviewPane browser styles", () => {
  let dispose: VoidFunction | undefined;

  beforeEach(() => {
    vi.stubGlobal("matchMedia", createMatchMedia(false));
    document.documentElement.setAttribute("data-theme", "light");
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-theme");
  });

  test("keeps the markdown surface dark in dark mode", async () => {
    document.documentElement.setAttribute("data-theme", "dark");

    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing browser test root");
    }

    dispose = render(
      () => (
        <PreviewPane
          colorScheme="dark"
          documentPath={null}
          html="<h1>Preview</h1><p>Dark mode body</p>"
          selectedAnchorId={null}
          visible={true}
        />
      ),
      root,
    );

    const preview = document.querySelector<HTMLElement>(
      ".preview__content.markdown-body",
    );

    if (preview === null) {
      throw new Error("missing preview content");
    }

    await expect
      .poll(() => {
        const styles = getComputedStyle(preview);
        return {
          backgroundColor: styles.backgroundColor,
          colorScheme: styles.colorScheme,
        };
      })
      .toEqual({
        backgroundColor: "rgb(13, 17, 23)",
        colorScheme: "dark",
      });

    // github-markdown.css is loaded via normal Vite import, no dynamic style element needed.
  });
});

function createMatchMedia(matches: boolean): typeof window.matchMedia {
  return ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  })) as typeof window.matchMedia;
}

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "solid-js/web";
import App from "../../src/app/App";

describe("App markdown file view in dark mode", () => {
  let dispose: VoidFunction | undefined;

  beforeEach(() => {
    vi.stubGlobal("matchMedia", createMatchMedia(false));
    window.history.replaceState({}, "", "/?browser_mock=1");
    localStorage.clear();
    localStorage.setItem("chilla-color-scheme", "dark");
    document.documentElement.setAttribute("data-theme", "dark");
    document.body.innerHTML = '<div id="root"></div>';

    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing app test root");
    }

    dispose = render(() => <App />, root);
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
  });

  test("renders README.md with dark markdown colors", async () => {
    const filterInput = await waitForElement<HTMLInputElement>(() =>
      document.querySelector(".file-browser__filter"),
    );

    filterInput.value = "README";
    filterInput.dispatchEvent(new Event("input", { bubbles: true }));

    const readmeButton = await waitForElement<HTMLButtonElement>(() =>
      document.querySelector('button[aria-label="README.md"]'),
    );

    readmeButton.click();

    const preview = await waitForElement<HTMLElement>(() =>
      document.querySelector(".preview__content.markdown-body"),
    );

    await waitFor(() => {
      expect(preview.textContent).toContain(
        "This document is served by the browser mock adapter.",
      );
    });

    await waitFor(() => {
      const styles = getComputedStyle(preview);
      expect(styles.backgroundColor).toBe("rgb(13, 17, 23)");
      expect(styles.color).toBe("rgb(201, 209, 217)");
      expect(styles.colorScheme).toBe("dark");
    });

    // github-markdown.css is loaded via normal Vite import, no dynamic style element needed.
  });
});

async function waitForElement<T extends Element>(
  findElement: () => T | null,
  timeoutMs = 2_000,
): Promise<T> {
  const start = Date.now();

  while (true) {
    const element = findElement();

    if (element !== null) {
      return element;
    }

    if (Date.now() - start >= timeoutMs) {
      throw new Error("timed out waiting for element");
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
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

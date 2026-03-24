import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { WorkspaceShell } from "./WorkspaceShell";

declare global {
  interface Window {
    ResizeObserver: typeof ResizeObserver;
  }
}

class ResizeObserverMock {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

beforeAll(() => {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;

  if (typeof HTMLElement !== "undefined") {
    HTMLElement.prototype.scrollIntoView = () => {};
  }
});

describe("WorkspaceShell startup", () => {
  let dispose: VoidFunction | undefined;

  beforeEach(() => {
    window.history.replaceState({}, "", "/?browser_mock=1");
    localStorage.clear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  it("loads the mocked directory tree and clears the loading state", async () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(() => <WorkspaceShell />, root);

    await waitFor(() => {
      expect(document.body.textContent).toContain("/mock/workspace");
      expect(document.body.textContent).toContain("README.md");
      expect(document.body.textContent).not.toContain("Loading directory...");
    });
  });

  it("keeps filter focus while typing multiple characters", async () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(() => <WorkspaceShell />, root);

    await waitFor(() => {
      expect(document.body.textContent).toContain("/mock/workspace");
    });

    const filterInput = document.querySelector<HTMLInputElement>(
      ".file-browser__filter",
    );

    if (filterInput === null) {
      throw new Error("missing file browser filter");
    }

    filterInput.focus();
    updateInputValue(filterInput, "n");

    await waitFor(() => {
      expect(document.activeElement).toBe(filterInput);
      expect(filterInput.value).toBe("n");
    });

    updateInputValue(filterInput, "no");

    await waitFor(() => {
      expect(document.activeElement).toBe(filterInput);
      expect(filterInput.value).toBe("no");
    });
  });

  it("finds entries beyond the first page through server-side filtering", async () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(() => <WorkspaceShell />, root);

    await waitFor(() => {
      expect(document.body.textContent).toContain("/mock/workspace");
    });

    const filterInput = document.querySelector<HTMLInputElement>(
      ".file-browser__filter",
    );

    if (filterInput === null) {
      throw new Error("missing file browser filter");
    }

    filterInput.focus();
    updateInputValue(filterInput, "notes-220");

    await waitFor(() => {
      expect(document.activeElement).toBe(filterInput);
      expect(document.body.textContent).toContain("notes-220.md");
    });
  });
});

function updateInputValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
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

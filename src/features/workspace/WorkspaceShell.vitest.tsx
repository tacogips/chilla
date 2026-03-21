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
});

async function waitFor(assertion: () => void, timeoutMs = 2_000): Promise<void> {
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

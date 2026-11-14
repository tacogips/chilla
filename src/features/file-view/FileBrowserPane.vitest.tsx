import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { FileBrowserPane } from "./FileBrowserPane";

class MockResizeObserver implements ResizeObserver {
  static instances: MockResizeObserver[] = [];

  private readonly targets = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
  }

  trigger(): void {
    const entries = Array.from(this.targets, (target) => {
      return { target } as ResizeObserverEntry;
    });
    this.callback(entries, this);
  }

  static triggerAll(): void {
    for (const observer of MockResizeObserver.instances) {
      observer.trigger();
    }
  }

  static reset(): void {
    MockResizeObserver.instances = [];
  }
}

describe("FileBrowserPane", () => {
  let dispose: VoidFunction | undefined;
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    globalThis.ResizeObserver = MockResizeObserver;
    MockResizeObserver.reset();
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    globalThis.ResizeObserver = originalResizeObserver;
    MockResizeObserver.reset();
    document.body.innerHTML = "";
  });

  it("marks overflowing names and exposes marquee scroll metrics in-row", async () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <FileBrowserPane
          active={true}
          directory={{
            current_directory_path: "/workspace",
            parent_directory_path: "/",
            entries: [
              {
                path: "/workspace/very-long-file-name-for-scroll-behavior.md",
                canonical_path:
                  "/workspace/very-long-file-name-for-scroll-behavior.md",
                name: "very-long-file-name-for-scroll-behavior.md",
                is_directory: false,
                size_bytes: 42,
                modified_at_unix_ms: 0,
              },
            ],
            total_entry_count: 1,
          }}
          sort={{ field: "name", direction: "asc" }}
          query=""
          selectedPath="/workspace/very-long-file-name-for-scroll-behavior.md"
          canLoadMore={false}
          isLoadingMore={false}
          onChangeQuery={() => {}}
          onChangeSort={() => {}}
          onLoadMore={() => {}}
          onSelectEntry={() => {}}
          onConfirmEntry={() => {}}
          onNavigateToParent={() => {}}
        />
      ),
      root,
    );

    const name = document.querySelector<HTMLElement>(".file-browser__name");
    const marquee = document.querySelector<HTMLElement>(
      ".file-browser__name-marquee",
    );

    if (name === null || marquee === null) {
      throw new Error("missing file browser name elements");
    }

    Object.defineProperty(name, "clientWidth", {
      configurable: true,
      value: 72,
    });
    Object.defineProperty(marquee, "scrollWidth", {
      configurable: true,
      value: 196,
    });

    MockResizeObserver.triggerAll();
    await flushMicrotasks();

    expect(name.dataset["overflowing"]).toBe("true");
    expect(
      name.style.getPropertyValue("--file-browser-name-scroll-distance"),
    ).toBe("124px");
    expect(
      name.style.getPropertyValue("--file-browser-name-scroll-duration"),
    ).toBe("4.43s");
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
});

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

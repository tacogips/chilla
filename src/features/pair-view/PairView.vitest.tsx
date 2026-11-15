import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import type { FileOpenOptions, FilePreview } from "../../lib/tauri/document";
import { PairView } from "./PairView";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

let dispose: VoidFunction | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
});

const options = { csv_first_row_as_header: true };
const leftPath = "/a/before.png";
const rightPath = "/b/after.png";
function preview(path: string, content = path): FilePreview {
  return {
    kind: "image",
    path,
    file_name: path.slice(path.lastIndexOf("/") + 1),
    mime_type: "image/png",
    last_modified: "now",
    html: `<section class="file-preview"><span>${content}</span></section>`,
  };
}
function button(root: HTMLElement, label: string): HTMLButtonElement {
  const result = root.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (result === null) throw new Error(`Missing button: ${label}`);
  return result;
}
function mount(
  loadPreview: (path: string, options: FileOpenOptions) => Promise<FilePreview>,
  onReloadReady?: (reload: (() => Promise<void>) | null) => void,
): HTMLElement {
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(
    () => (
      <PairView
        leftPath={leftPath}
        rightPath={rightPath}
        colorScheme="dark"
        fileOpenOptions={options}
        loadPreview={loadPreview}
        {...(onReloadReady ? { onReloadReady } : {})}
      />
    ),
    root,
  );
  return root;
}
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("PairView", () => {
  it("loads both previews in order and preserves each mounted pane through symmetric hide and restore", async () => {
    const load = vi.fn(async (path: string) => preview(path));
    const root = mount(load);
    await flush();
    expect(load.mock.calls).toEqual([
      [leftPath, options],
      [rightPath, options],
    ]);
    const panes = root.querySelectorAll<HTMLElement>("section[data-pair-pane]");
    expect(Array.from(panes, (pane) => pane.dataset["pairPane"])).toEqual([
      "left",
      "right",
    ]);
    const left = panes[0];
    const right = panes[1];
    if (!left || !right) throw new Error("missing pane");
    expect(left.textContent).toContain("before.png");
    expect(right.textContent).toContain("after.png");
    expect(button(root, "Hide left pane").getAttribute("aria-pressed")).toBe(
      "true",
    );
    for (const [hidden, visible, hiddenPane, visiblePane] of [
      ["left", "right", left, right],
      ["right", "left", right, left],
    ] as const) {
      button(root, `Hide ${hidden} pane`).click();
      expect(hiddenPane.hidden).toBe(true);
      expect(
        root.querySelector(`[data-pair-restore="${hidden}"]`),
      ).not.toBeNull();
      expect(
        button(root, `Show ${hidden} pane`).getAttribute("aria-pressed"),
      ).toBe("false");
      expect(
        button(root, `Hide ${visible} pane`).getAttribute("aria-disabled"),
      ).toBe("true");
      button(root, `Hide ${visible} pane`).click();
      expect(visiblePane.hidden).toBe(false);
      expect(
        root.querySelector(`[data-pair-restore="${hidden}"]`),
      ).not.toBeNull();
      button(root, `Show ${hidden} pane`).click();
      expect(hiddenPane.hidden).toBe(false);
      expect(root.querySelector("[data-pair-restore]")).toBeNull();
      expect(root.querySelector(`section[data-pair-pane="${hidden}"]`)).toBe(
        hiddenPane,
      );
    }
  });

  it("isolates a failed load from the other pane", async () => {
    const load = vi.fn(async (path: string) => {
      if (path === leftPath) throw new Error("left failed");
      return preview(path, "right content");
    });
    const root = mount(load);
    await flush();
    expect(
      root.querySelector('[data-pair-pane="left"]')?.textContent,
    ).toContain("left failed");
    expect(
      root.querySelector('[data-pair-pane="right"]')?.textContent,
    ).toContain("right content");
  });

  it("registers reload, reloads both paths, and clears the callback on unmount", async () => {
    const load = vi.fn(async (path: string) => preview(path));
    const ready = vi.fn();
    mount(load, ready);
    await flush();
    const reload = ready.mock.calls[0]?.[0] as
      | (() => Promise<void>)
      | undefined;
    expect(typeof reload).toBe("function");
    await reload?.();
    expect(load.mock.calls).toEqual([
      [leftPath, options],
      [rightPath, options],
      [leftPath, options],
      [rightPath, options],
    ]);
    dispose?.();
    dispose = undefined;
    expect(ready).toHaveBeenLastCalledWith(null);
  });

  it("ignores stale results after a newer reload completes", async () => {
    const pending: Array<(value: FilePreview) => void> = [];
    const load = vi.fn(
      (_path: string) =>
        new Promise<FilePreview>((resolve) => pending.push(resolve)),
    );
    const ready = vi.fn();
    const root = mount(load, ready);
    const reload = ready.mock.calls[0]?.[0] as
      | (() => Promise<void>)
      | undefined;
    if (!reload) throw new Error("reload not registered");
    const reloading = reload();
    expect(pending).toHaveLength(4);
    pending[2]?.(preview(leftPath, "new left"));
    pending[3]?.(preview(rightPath, "new right"));
    await reloading;
    pending[0]?.(preview(leftPath, "old left"));
    pending[1]?.(preview(rightPath, "old right"));
    await flush();
    expect(root.textContent).toContain("new left");
    expect(root.textContent).toContain("new right");
    expect(root.textContent).not.toContain("old left");
    expect(root.textContent).not.toContain("old right");
  });
});

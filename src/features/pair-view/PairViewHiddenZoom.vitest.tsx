import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FilePreview } from "../../lib/tauri/document";
import { PairView } from "./PairView";
import type { PairPaneVisibility } from "./pairPaneVisibility";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

let dispose: VoidFunction | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
});

type PreviewKind = "image" | "markdown";
type Side = "left" | "right";

function preview(kind: PreviewKind, path: string): FilePreview {
  const file_name = path.slice(path.lastIndexOf("/") + 1);
  if (kind === "image") {
    return {
      kind,
      path,
      file_name,
      mime_type: "image/png",
      last_modified: "now",
      html: '<section class="file-preview"><span>image</span></section>',
    };
  }
  return {
    kind,
    path,
    file_name,
    mime_type: "text/markdown",
    source_text: "# Example",
    source_html: "<h1>Example</h1>",
    html: "<h1>Example</h1>",
    headings: [],
    revision_token: "rev-1",
    last_modified: "now",
  };
}

async function mount(kind: PreviewKind): Promise<HTMLElement> {
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => {
    const [visibility, setVisibility] =
      createSignal<PairPaneVisibility>("both");
    return (
      <PairView
        leftPath="/before"
        rightPath="/after"
        visibility={visibility()}
        onChangeVisibility={setVisibility}
        colorScheme="dark"
        fileOpenOptions={{ csv_first_row_as_header: true }}
        loadPreview={async (path) => preview(kind, path)}
      />
    );
  }, root);
  await vi.waitFor(() => {
    expect(root.querySelectorAll(".preview__zoom-surface")).toHaveLength(2);
    expect(root.textContent).not.toContain("Loading...");
  });
  return root;
}

function surface(root: HTMLElement, side: Side, hidden = false): HTMLElement {
  const selector = `section[data-pair-pane="${side}"]${hidden ? "[hidden]" : ""} .preview__zoom-surface`;
  const result = root.querySelector<HTMLElement>(selector);
  if (result === null) throw new Error(`Missing preview: ${selector}`);
  return result;
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const result = root.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (result === null) throw new Error(`Missing button: ${label}`);
  return result;
}

function zoom(element: HTMLElement): string {
  return element.style.getPropertyValue("--preview-zoom-scale");
}

function key(value: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: value }));
}

describe.each(["image", "markdown"] as const)(
  "%s pair preview zoom",
  (kind) => {
    it("zooms both visible panes", async () => {
      const root = await mount(kind);
      key("+");
      expect(zoom(surface(root, "left"))).toBe("1.1");
      expect(zoom(surface(root, "right"))).toBe("1.1");
    });

    it.each([
      ["left", "right"],
      ["right", "left"],
    ] as const)(
      "preserves hidden %s pane while zooming %s",
      async (hidden, visible) => {
        const root = await mount(kind);
        key("+");
        const before = zoom(surface(root, hidden));
        expect(before).toBe("1.1");
        button(root, `Hide ${hidden} pane`).click();
        const hiddenSurface = surface(root, hidden, true);
        key("+");
        key("-");
        key("+");
        expect(zoom(hiddenSurface)).toBe(before);
        expect(zoom(surface(root, visible))).toBe("1.2");
        button(root, `Show ${hidden} pane`).click();
        expect(surface(root, hidden)).toBe(hiddenSurface);
        expect(zoom(surface(root, hidden))).toBe(before);
      },
    );
  },
);

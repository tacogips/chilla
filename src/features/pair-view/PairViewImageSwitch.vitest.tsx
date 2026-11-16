import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, expect, it, vi } from "vitest";
import type { FilePreview } from "../../lib/tauri/document";
import { PairView } from "./PairView";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));
vi.mock("@tauri-apps/api/path", () => ({
  dirname: async (path: string) => path.slice(0, path.lastIndexOf("/")),
  join: async (...paths: string[]) => paths.join("/").replace(/\/{2,}/g, "/"),
  normalize: async (path: string) => path,
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: async () => undefined,
  openUrl: async () => undefined,
}));

let dispose: VoidFunction | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
});

function imagePreview(path: string): FilePreview {
  return {
    kind: "image",
    path,
    file_name: path.slice(path.lastIndexOf("/") + 1),
    mime_type: "image/png",
    last_modified: "now",
    html: `<figure class="preview-media preview-media--image"><img src="${path}" alt="" /></figure>`,
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function imageSources(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll("img"), (image) =>
    (image.getAttribute("src") ?? "").replace(/\?.*$/, ""),
  );
}

it("resolves local image sources again after the shown pair changes", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const [left, setLeft] = createSignal("/a/before.png");
  const [right, setRight] = createSignal("/a/after.png");
  dispose = render(
    () => (
      <PairView
        leftPath={left()}
        rightPath={right()}
        visibility="both"
        onChangeVisibility={() => {}}
        colorScheme="dark"
        fileOpenOptions={{ csv_first_row_as_header: false }}
        loadPreview={async (path) => imagePreview(path)}
      />
    ),
    root,
  );
  await settle();
  expect(imageSources(root)).toEqual([
    "asset:///a/before.png",
    "asset:///a/after.png",
  ]);

  setLeft("/b/second-before.png");
  setRight("/b/second-after.png");
  await settle();
  expect(imageSources(root)).toEqual([
    "asset:///b/second-before.png",
    "asset:///b/second-after.png",
  ]);
});

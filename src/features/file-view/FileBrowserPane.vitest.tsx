import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { FileBrowserPane } from "./FileBrowserPane";

describe("FileBrowserPane", () => {
  let dispose: VoidFunction | undefined;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.innerHTML = "";
  });

  it("renders file names as stable ellipsized text without marquee DOM", () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    const fileName = "very-long-file-name-for-scroll-behavior.md";

    dispose = render(
      () => (
        <FileBrowserPane
          active={true}
          listingKind="directory"
          directory={{
            current_directory_path: "/workspace",
            parent_directory_path: "/",
            entries: [
              {
                path: `/workspace/${fileName}`,
                canonical_path: `/workspace/${fileName}`,
                name: fileName,
                directory_hint: "",
                is_directory: false,
                size_bytes: 42,
                modified_at_unix_ms: 0,
              },
            ],
            total_entry_count: 1,
          }}
          sort={{ field: "name", direction: "asc" }}
          query=""
          selectedPath={`/workspace/${fileName}`}
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

    if (name === null) {
      throw new Error("missing file browser name element");
    }

    expect(name.textContent).toBe(fileName);
    expect(name.title).toBe(fileName);
    expect(document.querySelector(".file-browser__name-marquee")).toBeNull();
    expect(name.dataset["overflowing"]).toBeUndefined();
  });
});

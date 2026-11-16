import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PairListPane } from "./PairListPane";

const pairs = [
  { left_file_path: "/x/a.png", right_file_path: "/y/b.png" },
  { left_file_path: "/x/c.png", right_file_path: "/y/d.png" },
];

describe("PairListPane", () => {
  let dispose: VoidFunction | undefined;
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });
  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.innerHTML = "";
  });

  it("renders ordered pairs, selection, counts and collapse control", () => {
    const root = document.getElementById("root") as HTMLElement;
    const select = vi.fn();
    const collapse = vi.fn();
    const [index, setIndex] = createSignal(1);
    dispose = render(
      () => (
        <PairListPane
          pairs={pairs}
          selectedIndex={index()}
          onSelect={select}
          onCollapse={collapse}
        />
      ),
      root,
    );
    const options = Array.from(
      root.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
    expect(options.map((option) => option.textContent)).toEqual([
      "a.png <-> b.png",
      "c.png <-> d.png",
    ]);
    expect(options[0]?.title).toBe("/x/a.png <-> /y/b.png");
    expect(
      options.map((option) => option.getAttribute("aria-selected")),
    ).toEqual(["false", "true"]);
    expect(options.map((option) => option.tabIndex)).toEqual([-1, 0]);
    expect(root.textContent).toContain("2 pairs");
    options[1]?.click();
    expect(select).toHaveBeenCalledWith(1);
    root
      .querySelector<HTMLButtonElement>('[aria-label="Collapse left pane"]')
      ?.click();
    expect(collapse).toHaveBeenCalledOnce();
    options[1]?.focus();
    setIndex(0);
    expect(document.activeElement).toBe(options[0]);
  });

  it("navigates without wrapping and ignores unrelated shortcuts", () => {
    const root = document.getElementById("root") as HTMLElement;
    const select = vi.fn();
    const [index, setIndex] = createSignal(0);
    dispose = render(
      () => (
        <PairListPane
          pairs={pairs}
          selectedIndex={index()}
          onSelect={select}
          onCollapse={() => {}}
        />
      ),
      root,
    );
    const key = (value: string) =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: value, bubbles: true }),
      );
    key("k");
    expect(select).not.toHaveBeenCalled();
    key("j");
    expect(select).toHaveBeenCalledWith(1);
    select.mockClear();
    setIndex(1);
    key("j");
    expect(select).not.toHaveBeenCalled();
    key("Enter");
    expect(select).toHaveBeenCalledWith(1);
    select.mockClear();
    key("h");
    key("/");
    key(",");
    key("a");
    expect(select).not.toHaveBeenCalled();
  });

  it("renders singular count", () => {
    const root = document.getElementById("root") as HTMLElement;
    dispose = render(
      () => (
        <PairListPane
          pairs={pairs.slice(0, 1)}
          selectedIndex={0}
          onSelect={() => {}}
          onCollapse={() => {}}
        />
      ),
      root,
    );
    expect(root.textContent).toContain("1 pair");
  });
});

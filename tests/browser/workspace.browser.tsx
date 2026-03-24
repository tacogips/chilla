import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render } from "solid-js/web";
import { WorkspaceShell } from "../../src/features/workspace/WorkspaceShell";

describe("WorkspaceShell browser mock", () => {
  let dispose: VoidFunction | undefined;

  beforeEach(() => {
    window.history.replaceState({}, "", "/?browser_mock=1");
    localStorage.clear();
    document.body.innerHTML = '<div id="root"></div>';

    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing browser test root");
    }

    dispose = render(() => <WorkspaceShell />, root);
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  test("renders the file tree in a normal browser", async () => {
    await expect.element(page.getByText("/mock/workspace")).toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "docs" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "README.md" }))
      .toBeInTheDocument();
  });

  test("lazy-loads additional file tree entries after scrolling", async () => {
    await expect
      .element(page.getByRole("button", { name: "notes-220.md" }))
      .not.toBeInTheDocument();

    const browserPane = document.querySelector<HTMLElement>(
      ".pane__body.file-browser",
    );

    if (browserPane === null) {
      throw new Error("missing file browser pane");
    }

    browserPane.scrollTop = browserPane.scrollHeight;
    browserPane.dispatchEvent(new Event("scroll"));

    await expect
      .element(page.getByRole("button", { name: "notes-220.md" }))
      .toBeInTheDocument();
  });

  test("keeps the filter input focused while typing multiple characters", async () => {
    await expect.element(page.getByText("/mock/workspace")).toBeInTheDocument();

    const filterInput = document.querySelector<HTMLInputElement>(
      ".file-browser__filter",
    );

    if (filterInput === null) {
      throw new Error("missing file browser filter");
    }

    filterInput.focus();
    updateInputValue(filterInput, "n");

    await expect
      .poll(() => ({
        value: filterInput.value,
        isFocused: document.activeElement === filterInput,
      }))
      .toEqual({
        value: "n",
        isFocused: true,
      });

    updateInputValue(filterInput, "no");

    await expect
      .poll(() => ({
        value: filterInput.value,
        isFocused: document.activeElement === filterInput,
      }))
      .toEqual({
        value: "no",
        isFocused: true,
      });
  });

  test("finds entries beyond the first page through server-side filtering", async () => {
    await expect.element(page.getByText("/mock/workspace")).toBeInTheDocument();

    const filterInput = document.querySelector<HTMLInputElement>(
      ".file-browser__filter",
    );

    if (filterInput === null) {
      throw new Error("missing file browser filter");
    }

    filterInput.focus();
    updateInputValue(filterInput, "notes-220");

    await expect
      .poll(() => ({
        value: filterInput.value,
        hasMatch: document.body.textContent?.includes("notes-220.md") ?? false,
      }))
      .toEqual({
        value: "notes-220",
        hasMatch: true,
      });
  });
});

function updateInputValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

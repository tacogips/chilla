import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal, type ComponentProps } from "solid-js";
import { render } from "solid-js/web";
import { WorkspaceHeader } from "./WorkspaceHeader";

let dispose: VoidFunction | undefined;
afterEach(() => {
  dispose?.();
  document.body.innerHTML = "";
});

function headerProps(): ComponentProps<typeof WorkspaceHeader> {
  return {
    isFileTreeOpen: true,
    onToggleFileTree: vi.fn(),
    markdownOpen: false,
    markdownPane: "preview",
    csvPreview: null,
    csvPaneMode: "raw",
    activeGitDiff: false,
    canOpenGitDiff: true,
    hasTocDocument: false,
    isTocOpen: false,
    canReloadCurrent: false,
    colorScheme: "dark",
    appWindow: null,
    onSelectMarkdownPane: vi.fn(),
    onSelectCsvPaneMode: vi.fn(),
    onOpenGitDiff: vi.fn(),
    onCloseGitDiff: vi.fn(),
    onOpenFiles: vi.fn(),
    onToggleToc: vi.fn(),
    onReloadCurrent: vi.fn(),
    onCycleColorScheme: vi.fn(),
  };
}

function iconButton(label: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (button === null) throw new Error(`Missing button: ${label}`);
  expect(button.textContent?.trim()).toBe("");
  expect(button.classList.contains("workspace__icon-button")).toBe(true);
  expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  return button;
}

describe("compact workspace toolbar", () => {
  it("keeps accessible labels, shortcut tooltips and click handlers for icons", () => {
    const props = headerProps();
    dispose = render(() => <WorkspaceHeader {...props} />, document.body);
    const open = iconButton("Open one or more files");
    expect(open.title).toContain("Open files (");
    open.click();
    expect(props.onOpenFiles).toHaveBeenCalledOnce();
    const diff = iconButton("Open Git diff mode");
    expect(diff.title).toBe("Open Git diff mode");
    diff.click();
    expect(props.onOpenGitDiff).toHaveBeenCalledOnce();
  });

  it("shows the return icon in diff mode and respects diff availability", () => {
    const props = headerProps();
    const [active, setActive] = createSignal(true);
    const [available, setAvailable] = createSignal(false);
    dispose = render(
      () => (
        <WorkspaceHeader
          {...props}
          activeGitDiff={active()}
          canOpenGitDiff={available()}
        />
      ),
      document.body,
    );
    const back = iconButton("Return to file view");
    expect(back.title).toBe("Return to file view");
    back.click();
    expect(props.onCloseGitDiff).toHaveBeenCalledOnce();
    expect(
      document.querySelector('[aria-label="Open Git diff mode"]'),
    ).toBeNull();
    setActive(false);
    expect(
      document.querySelector('[aria-label="Return to file view"]'),
    ).toBeNull();
    expect(
      document.querySelector('[aria-label="Open Git diff mode"]'),
    ).toBeNull();
    setAvailable(true);
    iconButton("Open Git diff mode");
  });
});

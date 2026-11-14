import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import type {
  DirectoryPage,
  DocumentSnapshot,
  FilePreview,
  StartupContext,
} from "../../lib/tauri/document";

const documentMocks = vi.hoisted(() => ({
  getStartupContext: vi.fn(),
  listDirectory: vi.fn(),
  openDocument: vi.fn(),
  openFilePreview: vi.fn(),
  listenDocumentRefreshed: vi.fn(),
  stopDocumentWatch: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  async invoke() {
    return undefined;
  },
  convertFileSrc(path: string) {
    return `asset://${path}`;
  },
}));

vi.mock("@tauri-apps/api/event", () => ({
  async listen() {
    return () => {};
  },
}));

vi.mock("@tauri-apps/api/path", () => ({
  async dirname(path: string) {
    return path.slice(0, path.lastIndexOf("/"));
  },
  async join(...paths: readonly string[]) {
    return paths.join("/").replace(/\/{2,}/g, "/");
  },
  async normalize(path: string) {
    return path.replace(/\\/g, "/");
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow() {
    return {
      close: vi.fn().mockResolvedValue(undefined),
      minimize: vi.fn().mockResolvedValue(undefined),
      toggleMaximize: vi.fn().mockResolvedValue(undefined),
    };
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  async openPath() {
    return undefined;
  },
  async openUrl() {
    return undefined;
  },
}));

vi.mock("../../lib/tauri/document", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../lib/tauri/document")>();

  return {
    ...actual,
    getStartupContext: documentMocks.getStartupContext,
    listDirectory: documentMocks.listDirectory,
    openDocument: documentMocks.openDocument,
    openFilePreview: documentMocks.openFilePreview,
    listenDocumentRefreshed: documentMocks.listenDocumentRefreshed,
    stopDocumentWatch: documentMocks.stopDocumentWatch,
  };
});

import { WorkspaceShell } from "./WorkspaceShell";

async function waitFor(assertion: () => void): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 1000) {
    try {
      assertion();
      return;
    } catch (error: unknown) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

function renderWorkspace(): VoidFunction {
  const root = document.getElementById("root");
  if (root === null) {
    throw new Error("missing test root");
  }

  return render(() => <WorkspaceShell />, root);
}

function directoryStartupContext(
  selectedFilePath: string | null,
): StartupContext {
  return {
    initial_mode: "file_view",
    browser_root: {
      kind: "directory",
      current_directory_path: "/workspace",
      selected_file_path: selectedFilePath,
    },
  };
}

function directoryPage(filePath: string): DirectoryPage {
  const fileName = filePath.slice(filePath.lastIndexOf("/") + 1);
  return {
    current_directory_path: "/workspace",
    parent_directory_path: "/",
    entries: [
      {
        path: filePath,
        canonical_path: filePath,
        name: fileName,
        directory_hint: "",
        is_directory: false,
        size_bytes: 24,
        modified_at_unix_ms: 0,
      },
    ],
    total_entry_count: 1,
    offset: 0,
    limit: 200,
    has_more: false,
  };
}

function markdownSnapshot(): DocumentSnapshot {
  return {
    path: "/workspace/note.md",
    file_name: "note.md",
    source_text: "# Note\n\nBody",
    source_html:
      '<section class="file-preview file-preview--text"><pre># Note</pre></section>',
    html: '<h1 id="note">Note</h1><p>Body</p>',
    headings: [
      {
        level: 1,
        title: "Note",
        anchor_id: "note",
        line_start: 1,
        children: [],
      },
    ],
    revision_token: "rev-1",
    last_modified: "2026-06-04T00:00:00Z",
  };
}

function csvPreview(
  overrides: Partial<Extract<FilePreview, { kind: "csv" }>> = {},
): Extract<FilePreview, { kind: "csv" }> {
  return {
    kind: "csv",
    path: "/workspace/data.csv",
    file_name: "data.csv",
    mime_type: "text/csv",
    raw_html:
      '<section class="file-preview file-preview--text"><pre>name,count</pre></section>',
    rows: [["name", "count"]],
    column_count: 2,
    displayed_row_count: 1,
    total_row_count: 1,
    truncated: false,
    formatted_available: true,
    parse_error: null,
    size_bytes: 24,
    last_modified: "2026-06-04T00:00:00Z",
    ...overrides,
  };
}

function modeButton(ariaLabel: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${ariaLabel}"]`,
  );

  if (button === null) {
    throw new Error(`missing button ${ariaLabel}`);
  }

  return button;
}

function expectActiveMode(ariaLabel: string): void {
  expect(
    modeButton(ariaLabel).classList.contains("workspace__mode--active"),
  ).toBe(true);
}

describe("WorkspaceShell numeric view shortcuts", () => {
  let dispose: VoidFunction | undefined;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    documentMocks.getStartupContext.mockReset();
    documentMocks.listDirectory.mockReset();
    documentMocks.openDocument.mockReset();
    documentMocks.openFilePreview.mockReset();
    documentMocks.listenDocumentRefreshed.mockReset();
    documentMocks.stopDocumentWatch.mockReset();
    documentMocks.listenDocumentRefreshed.mockResolvedValue(() => {});
    documentMocks.stopDocumentWatch.mockResolvedValue(undefined);
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.innerHTML = "";
  });

  it("switches Markdown raw and preview modes with 1 and 2", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext("/workspace/note.md"),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/note.md"),
    );
    documentMocks.openDocument.mockResolvedValue(markdownSnapshot());

    dispose = renderWorkspace();

    await waitFor(() => {
      expectActiveMode("Markdown preview");
    });

    expect(modeButton("Raw Markdown source").title).toBe(
      "Raw source (1; Shift+P toggles)",
    );
    expect(modeButton("Markdown preview").title).toBe(
      "Preview (2; Shift+P toggles)",
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    await waitFor(() => {
      expectActiveMode("Raw Markdown source");
      expect(document.querySelector(".markdown-source-editor")).not.toBeNull();
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" }));
    await waitFor(() => {
      expectActiveMode("Markdown preview");
      expect(document.body.textContent).toContain("Body");
    });
  });

  it("does not switch Markdown modes while typing in editable controls", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext("/workspace/note.md"),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/note.md"),
    );
    documentMocks.openDocument.mockResolvedValue(markdownSnapshot());

    dispose = renderWorkspace();

    await waitFor(() => {
      expectActiveMode("Markdown preview");
    });

    const editableInput = document.createElement("input");
    document.body.append(editableInput);

    editableInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "1", bubbles: true }),
    );

    await waitFor(() => {
      expectActiveMode("Markdown preview");
      expect(document.querySelector(".markdown-source-editor")).toBeNull();
    });
  });

  it("switches available CSV raw and formatted modes with 1 and 2", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext("/workspace/data.csv"),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/data.csv"),
    );
    documentMocks.openFilePreview.mockResolvedValue(csvPreview());

    dispose = renderWorkspace();

    await waitFor(() => {
      expectActiveMode("Formatted CSV table");
      expect(document.body.textContent).toContain("Formatted CSV");
    });

    expect(modeButton("Raw CSV source").title).toBe("Raw (1; Shift+P toggles)");
    expect(modeButton("Formatted CSV table").title).toBe(
      "Formatted (2; Shift+P toggles)",
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    await waitFor(() => {
      expectActiveMode("Raw CSV source");
      expect(document.body.textContent).toContain("name,count");
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" }));
    await waitFor(() => {
      expectActiveMode("Formatted CSV table");
      expect(document.body.textContent).toContain("Formatted CSV");
    });
  });

  it("leaves unavailable CSV formatted mode unchanged when 2 is pressed", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext("/workspace/data.csv"),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/data.csv"),
    );
    documentMocks.openFilePreview.mockResolvedValue(
      csvPreview({
        rows: [],
        column_count: 0,
        displayed_row_count: 0,
        total_row_count: null,
        formatted_available: false,
        parse_error: "CSV parse failed",
      }),
    );

    dispose = renderWorkspace();

    await waitFor(() => {
      expectActiveMode("Raw CSV source");
      expect(modeButton("Formatted CSV table").disabled).toBe(true);
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" }));

    await waitFor(() => {
      expectActiveMode("Raw CSV source");
      expect(
        modeButton("Formatted CSV table").classList.contains(
          "workspace__mode--active",
        ),
      ).toBe(false);
      expect(document.body.textContent).toContain("name,count");
      expect(document.body.textContent).not.toContain("Formatted CSV");
    });
  });

  it("shows direct numeric selectors in shortcut help", async () => {
    documentMocks.getStartupContext.mockResolvedValue(
      directoryStartupContext(null),
    );
    documentMocks.listDirectory.mockResolvedValue(
      directoryPage("/workspace/note.md"),
    );

    dispose = renderWorkspace();

    await waitFor(() => {
      expect(document.body.textContent).toContain("Please select a file.");
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "?", shiftKey: true }),
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain(
        "Toggle Raw / Preview (Markdown) or Raw / Formatted (CSV)",
      );
      expect(document.body.textContent).toContain(
        "Select Raw view (Markdown / CSV)",
      );
      expect(document.body.textContent).toContain(
        "Select Preview view (Markdown) or Formatted view (CSV)",
      );
    });
  });
});

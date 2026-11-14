import { describe, expect, it } from "vitest";

import {
  classifyDialogSelection,
  normalizeDialogSelection,
  startupContextForPickedTarget,
} from "./openFiles";
import { inferDirectoryPath } from "../../lib/tauri/document";

describe("openFiles", () => {
  it("deduplicates dialog selections while preserving first-seen order", () => {
    expect(
      normalizeDialogSelection([
        "/workspace/a.md",
        "/workspace/b.md",
        "/workspace/a.md",
        "   /workspace/c.md   ",
      ]),
    ).toEqual(["/workspace/a.md", "/workspace/b.md", "/workspace/c.md"]);
  });

  it("infers Windows drive-root directories", () => {
    expect(inferDirectoryPath("C:\\notes.md")).toBe("C:/");
  });

  it("classifies a single picked file", () => {
    expect(classifyDialogSelection("/workspace/notes.md")).toEqual({
      kind: "single_file",
      filePath: "/workspace/notes.md",
      directoryPath: "/workspace",
    });
  });

  it("classifies multiple picked files as an explicit file set", () => {
    expect(
      classifyDialogSelection([
        "/workspace/a.md",
        "/workspace/b.md",
        "/workspace/a.md",
      ]),
    ).toEqual({
      kind: "file_set",
      selectedFilePath: "/workspace/a.md",
      filePaths: ["/workspace/a.md", "/workspace/b.md"],
    });
  });

  it("builds directory startup context from a single picked file", () => {
    expect(
      startupContextForPickedTarget({
        kind: "single_file",
        filePath: "/workspace/notes.md",
        directoryPath: "/workspace",
      }),
    ).toEqual({
      initial_mode: "file_view",
      browser_root: {
        kind: "directory",
        current_directory_path: "/workspace",
        selected_file_path: "/workspace/notes.md",
      },
    });
  });

  it("returns null when the dialog is canceled", () => {
    expect(classifyDialogSelection(null)).toBeNull();
  });

  it("builds explicit-file-set startup context from a picked target", () => {
    expect(
      startupContextForPickedTarget({
        kind: "file_set",
        selectedFilePath: "/workspace/a.md",
        filePaths: ["/workspace/a.md", "/workspace/b.md"],
      }),
    ).toEqual({
      initial_mode: "file_view",
      browser_root: {
        kind: "explicit_file_set",
        file_count: 2,
        selected_file_path: "/workspace/a.md",
        source_order_paths: ["/workspace/a.md", "/workspace/b.md"],
      },
    });
  });
});

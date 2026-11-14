import { describe, expect, it } from "vitest";
import { normalizeStartupContextPayload } from "./document";

describe("normalizeStartupContextPayload", () => {
  it("accepts snake_case directory startup payloads", () => {
    expect(
      normalizeStartupContextPayload({
        initial_mode: "file_view",
        browser_root: {
          kind: "directory",
          current_directory_path: "/workspace",
          selected_file_path: "/workspace/dummy.csv",
        },
      }),
    ).toEqual({
      initial_mode: "file_view",
      browser_root: {
        kind: "directory",
        current_directory_path: "/workspace",
        selected_file_path: "/workspace/dummy.csv",
      },
    });
  });

  it("accepts camelCase directory startup payloads", () => {
    expect(
      normalizeStartupContextPayload({
        initialMode: "file_view",
        browserRoot: {
          kind: "directory",
          currentDirectoryPath: "/workspace",
          selectedFilePath: "/workspace/dummy.csv",
        },
      }),
    ).toEqual({
      initial_mode: "file_view",
      browser_root: {
        kind: "directory",
        current_directory_path: "/workspace",
        selected_file_path: "/workspace/dummy.csv",
      },
    });
  });

  it("accepts camelCase explicit file-set startup payloads", () => {
    expect(
      normalizeStartupContextPayload({
        initialMode: "file_view",
        browserRoot: {
          kind: "explicitFileSet",
          fileCount: 2,
          selectedFilePath: "/workspace/a.csv",
          sourceOrderPaths: ["/workspace/a.csv", "/workspace/b.csv"],
        },
      }),
    ).toEqual({
      initial_mode: "file_view",
      browser_root: {
        kind: "explicit_file_set",
        file_count: 2,
        selected_file_path: "/workspace/a.csv",
        source_order_paths: ["/workspace/a.csv", "/workspace/b.csv"],
      },
    });
  });

  it("infers the directory path from a selected file when needed", () => {
    expect(
      normalizeStartupContextPayload({
        initial_mode: "file_view",
        browser_root: {
          kind: "directory",
          selected_file_path: "/workspace/dummy.csv",
        },
      }),
    ).toEqual({
      initial_mode: "file_view",
      browser_root: {
        kind: "directory",
        current_directory_path: "/workspace",
        selected_file_path: "/workspace/dummy.csv",
      },
    });
  });

  it("maps file-style startup payloads to a directory selection", () => {
    expect(
      normalizeStartupContextPayload({
        initial_mode: "file_view",
        browser_root: {
          kind: "file",
          selected_file_path: "/workspace/dummy.csv",
        },
      }),
    ).toEqual({
      initial_mode: "file_view",
      browser_root: {
        kind: "directory",
        current_directory_path: "/workspace",
        selected_file_path: "/workspace/dummy.csv",
      },
    });
  });

  it("infers Windows drive-root directories from selected files", () => {
    expect(
      normalizeStartupContextPayload({
        initialMode: "file_view",
        browserRoot: {
          kind: "file",
          selectedFilePath: "C:\\dummy.csv",
        },
      }),
    ).toEqual({
      initial_mode: "file_view",
      browser_root: {
        kind: "directory",
        current_directory_path: "C:/",
        selected_file_path: "C:\\dummy.csv",
      },
    });
  });

  it("rejects invalid explicit file-set counts", () => {
    expect(() =>
      normalizeStartupContextPayload({
        initialMode: "file_view",
        browserRoot: {
          kind: "explicitFileSet",
          fileCount: Number.NaN,
          selectedFilePath: "/workspace/a.csv",
          sourceOrderPaths: ["/workspace/a.csv"],
        },
      }),
    ).toThrow("Startup file-set payload is missing required paths");
  });

  it("rejects inconsistent explicit file-set payloads", () => {
    expect(() =>
      normalizeStartupContextPayload({
        initialMode: "file_view",
        browserRoot: {
          kind: "explicitFileSet",
          fileCount: 2,
          selectedFilePath: "/workspace/missing.csv",
          sourceOrderPaths: ["/workspace/a.csv"],
        },
      }),
    ).toThrow("Startup file-set payload contains inconsistent paths");
  });

  it("copies explicit file-set source paths when normalizing", () => {
    const sourceOrderPaths = ["/workspace/a.csv"];
    const context = normalizeStartupContextPayload({
      initialMode: "file_view",
      browserRoot: {
        kind: "explicitFileSet",
        fileCount: 1,
        selectedFilePath: "/workspace/a.csv",
        sourceOrderPaths,
      },
    });

    sourceOrderPaths[0] = "/workspace/changed.csv";

    expect(context.browser_root).toEqual({
      kind: "explicit_file_set",
      file_count: 1,
      selected_file_path: "/workspace/a.csv",
      source_order_paths: ["/workspace/a.csv"],
    });
  });
});

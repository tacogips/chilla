import {
  inferDirectoryPath,
  type StartupContext,
} from "../../lib/tauri/document";

export type DialogSelection = string | readonly string[] | null;

export type PickedOpenTarget =
  | {
      readonly kind: "single_file";
      readonly filePath: string;
      readonly directoryPath: string;
    }
  | {
      readonly kind: "file_set";
      readonly selectedFilePath: string;
      readonly filePaths: readonly string[];
    };

export function normalizeDialogSelection(
  selection: DialogSelection,
): readonly string[] {
  const rawPaths =
    selection === null
      ? []
      : Array.isArray(selection)
        ? selection
        : [selection];
  const uniquePaths: string[] = [];
  const seenPaths = new Set<string>();

  for (const rawPath of rawPaths) {
    const path = rawPath.trim();
    if (path.length === 0 || seenPaths.has(path)) {
      continue;
    }

    seenPaths.add(path);
    uniquePaths.push(path);
  }

  return uniquePaths;
}

export function classifyDialogSelection(
  selection: DialogSelection,
): PickedOpenTarget | null {
  const paths = normalizeDialogSelection(selection);
  if (paths.length === 0) {
    return null;
  }

  if (paths.length === 1) {
    const filePath = paths[0];
    if (filePath === undefined) {
      throw new Error(
        "Single-file dialog selection unexpectedly resolved empty",
      );
    }
    const directoryPath = inferDirectoryPath(filePath);
    if (directoryPath === null) {
      throw new Error(
        `Could not determine the parent directory for ${filePath}`,
      );
    }

    return {
      kind: "single_file",
      filePath,
      directoryPath,
    };
  }

  const selectedFilePath = paths[0];
  if (selectedFilePath === undefined) {
    throw new Error("File-set dialog selection unexpectedly resolved empty");
  }

  return {
    kind: "file_set",
    selectedFilePath,
    filePaths: paths,
  };
}

export function startupContextForPickedTarget(
  target: PickedOpenTarget,
): StartupContext {
  if (target.kind === "single_file") {
    return {
      initial_mode: "file_view",
      browser_root: {
        kind: "directory",
        current_directory_path: target.directoryPath,
        selected_file_path: target.filePath,
      },
    };
  }

  return {
    initial_mode: "file_view",
    browser_root: {
      kind: "explicit_file_set",
      file_count: target.filePaths.length,
      selected_file_path: target.selectedFilePath,
      source_order_paths: [...target.filePaths],
    },
  };
}

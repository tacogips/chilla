import type {
  DirectoryEntry,
  DirectoryListSort,
} from "../../lib/tauri/document";

export interface LoadedDirectoryState {
  readonly listingKind: "directory" | "explicit_file_set";
  readonly current_directory_path: string;
  readonly parent_directory_path: string | null;
  readonly explicit_source_paths: readonly string[] | null;
  readonly entries: readonly DirectoryEntry[];
  readonly total_entry_count: number;
  readonly next_offset: number;
  readonly sort: DirectoryListSort;
  readonly query: string;
}

function defaultFocusedEntryPath(
  entries: readonly DirectoryEntry[],
): string | null {
  const preferred = entries.find((entry) => !entry.is_directory) ?? entries[0];
  return preferred?.path ?? null;
}

export function resolveSelectedPath(
  listingKind: "directory" | "explicit_file_set",
  currentDirectoryPath: string,
  entries: readonly DirectoryEntry[],
  requestedPath: string | null,
): string | null {
  if (
    requestedPath === null ||
    (listingKind === "directory" && requestedPath === currentDirectoryPath)
  ) {
    return defaultFocusedEntryPath(entries);
  }

  const matched = entries.find(
    (entry) =>
      entry.path === requestedPath || entry.canonical_path === requestedPath,
  );

  return matched?.path ?? defaultFocusedEntryPath(entries);
}

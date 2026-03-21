import type { DirectoryEntry } from "../../lib/tauri/document";

export type FileTreeSortField = "name" | "mtime" | "size" | "extension";
export type FileTreeSortDirection = "asc" | "desc";

export interface FileTreeSortState {
  readonly field: FileTreeSortField;
  readonly direction: FileTreeSortDirection;
}

export const DEFAULT_FILE_TREE_SORT: FileTreeSortState = {
  field: "name",
  direction: "asc",
};

export function describeFileTreeSort(sort: FileTreeSortState): string {
  switch (sort.field) {
    case "name":
      return sort.direction === "asc" ? "Sort: name A-Z" : "Sort: name Z-A";
    case "mtime":
      return sort.direction === "asc"
        ? "Sort: mtime old-new"
        : "Sort: mtime new-old";
    case "size":
      return sort.direction === "asc"
        ? "Sort: size small-large"
        : "Sort: size large-small";
    case "extension":
      return sort.direction === "asc"
        ? "Sort: extension A-Z"
        : "Sort: extension Z-A";
  }
}

export function sortDirectoryEntries(
  entries: readonly DirectoryEntry[],
  sort: FileTreeSortState,
): DirectoryEntry[] {
  return [...entries].sort((left, right) =>
    compareDirectoryEntries(left, right, sort),
  );
}

function compareDirectoryEntries(
  left: DirectoryEntry,
  right: DirectoryEntry,
  sort: FileTreeSortState,
): number {
  return (
    compareDirectoryPriority(left, right) ||
    compareByRequestedField(left, right, sort) ||
    compareNames(left, right, "asc") ||
    left.path.localeCompare(right.path)
  );
}

function compareDirectoryPriority(
  left: DirectoryEntry,
  right: DirectoryEntry,
): number {
  if (left.is_directory === right.is_directory) {
    return 0;
  }

  return left.is_directory ? -1 : 1;
}

function compareByRequestedField(
  left: DirectoryEntry,
  right: DirectoryEntry,
  sort: FileTreeSortState,
): number {
  switch (sort.field) {
    case "name":
      return compareNames(left, right, sort.direction);
    case "mtime":
      return compareNumbers(
        left.modified_at_unix_ms,
        right.modified_at_unix_ms,
        sort.direction,
      );
    case "size":
      return compareNumbers(left.size_bytes, right.size_bytes, sort.direction);
    case "extension":
      return compareExtensions(left, right, sort.direction);
  }
}

function compareNames(
  left: DirectoryEntry,
  right: DirectoryEntry,
  direction: FileTreeSortDirection,
): number {
  const normalized =
    left.name.localeCompare(right.name, undefined, { sensitivity: "accent" }) ||
    left.name.localeCompare(right.name);

  return direction === "asc" ? normalized : -normalized;
}

function compareNumbers(
  left: number,
  right: number,
  direction: FileTreeSortDirection,
): number {
  if (left === right) {
    return 0;
  }

  return direction === "asc" ? left - right : right - left;
}

function compareExtensions(
  left: DirectoryEntry,
  right: DirectoryEntry,
  direction: FileTreeSortDirection,
): number {
  const normalized =
    fileExtension(left.name).localeCompare(fileExtension(right.name)) ||
    left.name.localeCompare(right.name, undefined, { sensitivity: "accent" }) ||
    left.name.localeCompare(right.name);

  return direction === "asc" ? normalized : -normalized;
}

function fileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");

  if (lastDot <= 0 || lastDot === name.length - 1) {
    return "";
  }

  return name.slice(lastDot + 1).toLocaleLowerCase();
}

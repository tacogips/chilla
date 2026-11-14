import type { DirectorySort as FileTreeSortState } from "../../lib/tauri/document";

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

export type { FileTreeSortState };

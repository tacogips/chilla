import type { DirectoryListSort } from "../../lib/tauri/document";

export const DIRECTORY_PAGE_SIZE = 200;

export const DEFAULT_FILE_TREE_SORT: DirectoryListSort = {
  field: "name",
  direction: "asc",
};

export function describeFileTreeSort(sort: DirectoryListSort): string {
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

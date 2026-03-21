import { describe, expect, it } from "bun:test";
import {
  DEFAULT_FILE_TREE_SORT,
  describeFileTreeSort,
  type FileTreeSortState,
} from "./sort";

describe("file tree sort helpers", () => {
  it("uses name ascending as the default sort", () => {
    expect(DEFAULT_FILE_TREE_SORT).toEqual({
      field: "name",
      direction: "asc",
    });
    expect(describeFileTreeSort(DEFAULT_FILE_TREE_SORT)).toBe("Sort: name A-Z");
  });

  it.each([
    [{ field: "name", direction: "desc" }, "Sort: name Z-A"],
    [{ field: "mtime", direction: "asc" }, "Sort: mtime old-new"],
    [{ field: "mtime", direction: "desc" }, "Sort: mtime new-old"],
    [{ field: "size", direction: "asc" }, "Sort: size small-large"],
    [{ field: "size", direction: "desc" }, "Sort: size large-small"],
    [{ field: "extension", direction: "asc" }, "Sort: extension A-Z"],
    [{ field: "extension", direction: "desc" }, "Sort: extension Z-A"],
  ] as const)(
    "describes %j",
    (sort: FileTreeSortState, expectedLabel: string) => {
      expect(describeFileTreeSort(sort)).toBe(expectedLabel);
    },
  );
});

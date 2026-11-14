import { describe, expect, it } from "bun:test";
import {
  DIRECTORY_PAGE_SIZE,
  DEFAULT_FILE_TREE_SORT,
  describeFileTreeSort,
} from "./sort";

describe("file tree sort helpers", () => {
  it("uses name ascending as the default sort and page size", () => {
    expect(DEFAULT_FILE_TREE_SORT).toEqual({
      field: "name",
      direction: "asc",
    });
    expect(DIRECTORY_PAGE_SIZE).toBe(200);
    expect(describeFileTreeSort(DEFAULT_FILE_TREE_SORT)).toBe("Sort: name A-Z");
  });

  it("describes the supported sort modes", () => {
    expect(describeFileTreeSort({ field: "name", direction: "desc" })).toBe(
      "Sort: name Z-A",
    );
    expect(describeFileTreeSort({ field: "mtime", direction: "asc" })).toBe(
      "Sort: mtime old-new",
    );
    expect(describeFileTreeSort({ field: "size", direction: "desc" })).toBe(
      "Sort: size large-small",
    );
    expect(describeFileTreeSort({ field: "extension", direction: "asc" })).toBe(
      "Sort: extension A-Z",
    );
  });
});

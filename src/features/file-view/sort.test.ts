import { describe, expect, it } from "bun:test";
import type { DirectoryEntry } from "../../lib/tauri/document";
import {
  DEFAULT_FILE_TREE_SORT,
  describeFileTreeSort,
  sortDirectoryEntries,
  type FileTreeSortState,
} from "./sort";

function entry(
  name: string,
  options: {
    readonly isDirectory?: boolean;
    readonly sizeBytes?: number;
    readonly modifiedAtUnixMs?: number;
  } = {},
): DirectoryEntry {
  return {
    path: `/tmp/${name}`,
    name,
    is_directory: options.isDirectory ?? false,
    size_bytes: options.sizeBytes ?? 0,
    modified_at_unix_ms: options.modifiedAtUnixMs ?? 0,
  };
}

function sortNames(
  entries: readonly DirectoryEntry[],
  sort: FileTreeSortState,
): string[] {
  return sortDirectoryEntries(entries, sort).map((item) => item.name);
}

describe("file tree sort helpers", () => {
  it("uses name ascending as the default sort", () => {
    expect(DEFAULT_FILE_TREE_SORT).toEqual({
      field: "name",
      direction: "asc",
    });
    expect(describeFileTreeSort(DEFAULT_FILE_TREE_SORT)).toBe("Sort: name A-Z");
  });

  it("keeps directories before files for name sorting", () => {
    expect(
      sortNames(
        [
          entry("zeta.txt"),
          entry("beta", { isDirectory: true }),
          entry("Alpha", { isDirectory: true }),
          entry("Bravo.txt"),
        ],
        { field: "name", direction: "asc" },
      ),
    ).toEqual(["Alpha", "beta", "Bravo.txt", "zeta.txt"]);
  });

  it("sorts by modified time within the directory and file groups", () => {
    expect(
      sortNames(
        [
          entry("older-dir", { isDirectory: true, modifiedAtUnixMs: 1 }),
          entry("newer.txt", { modifiedAtUnixMs: 50 }),
          entry("older.txt", { modifiedAtUnixMs: 10 }),
          entry("newer-dir", { isDirectory: true, modifiedAtUnixMs: 100 }),
        ],
        { field: "mtime", direction: "desc" },
      ),
    ).toEqual(["newer-dir", "older-dir", "newer.txt", "older.txt"]);
  });

  it("sorts by size within the directory and file groups", () => {
    expect(
      sortNames(
        [
          entry("tiny.txt", { sizeBytes: 1 }),
          entry("large.txt", { sizeBytes: 20 }),
          entry("dir-b", { isDirectory: true, sizeBytes: 3 }),
          entry("dir-a", { isDirectory: true, sizeBytes: 1 }),
        ],
        { field: "size", direction: "asc" },
      ),
    ).toEqual(["dir-a", "dir-b", "tiny.txt", "large.txt"]);
  });

  it("sorts by extension within the directory and file groups", () => {
    expect(
      sortNames(
        [
          entry("zeta.txt"),
          entry("alpha.md"),
          entry("folder.toml", { isDirectory: true }),
          entry("archive", { isDirectory: true }),
          entry("beta.json"),
        ],
        { field: "extension", direction: "asc" },
      ),
    ).toEqual(["archive", "folder.toml", "beta.json", "alpha.md", "zeta.txt"]);
  });
});

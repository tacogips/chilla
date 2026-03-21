import { createMemo, createSignal } from "solid-js";
import type {
  DirectoryEntry,
  DirectorySnapshot,
  DirectorySort,
} from "../../lib/tauri/document";
import { FileBrowserPane } from "./FileBrowserPane";

const BASE_ENTRIES: readonly DirectoryEntry[] = [
  {
    path: "/workspace/alpha",
    name: "alpha",
    is_directory: true,
    size_bytes: 0,
    modified_at_unix_ms: 10,
  },
  {
    path: "/workspace/bravo.md",
    name: "bravo.md",
    is_directory: false,
    size_bytes: 10,
    modified_at_unix_ms: 20,
  },
  {
    path: "/workspace/charlie",
    name: "charlie",
    is_directory: true,
    size_bytes: 0,
    modified_at_unix_ms: 30,
  },
  {
    path: "/workspace/delta.md",
    name: "delta.md",
    is_directory: false,
    size_bytes: 10,
    modified_at_unix_ms: 40,
  },
  {
    path: "/workspace/echo.txt",
    name: "echo.txt",
    is_directory: false,
    size_bytes: 10,
    modified_at_unix_ms: 50,
  },
];

function compareBySort(
  left: DirectoryEntry,
  right: DirectoryEntry,
  sort: DirectorySort,
): number {
  if (left.is_directory !== right.is_directory) {
    return left.is_directory ? -1 : 1;
  }

  const normalizeName = (value: string) => value.toLowerCase();
  const compareName = () =>
    normalizeName(left.name).localeCompare(normalizeName(right.name)) ||
    left.name.localeCompare(right.name);
  const compareNumber = (a: number, b: number) => a - b;
  const extensionOf = (name: string) => {
    const parts = name.split(".");
    return parts.length > 1 ? (parts[parts.length - 1] ?? "").toLowerCase() : "";
  };

  let result = 0;

  switch (sort.field) {
    case "name":
      result = compareName();
      break;
    case "mtime":
      result = compareNumber(left.modified_at_unix_ms, right.modified_at_unix_ms);
      break;
    case "size":
      result = compareNumber(left.size_bytes, right.size_bytes);
      break;
    case "extension":
      result =
        extensionOf(left.name).localeCompare(extensionOf(right.name)) ||
        compareName();
      break;
  }

  return sort.direction === "asc" ? result : -result;
}

export function FileBrowserHarness() {
  const [query, setQuery] = createSignal("");
  const [sort, setSort] = createSignal<DirectorySort>({
    field: "name",
    direction: "asc",
  });
  const [selectedPath, setSelectedPath] = createSignal<string | null>(
    "/workspace/bravo.md",
  );
  const [selectedIndex, setSelectedIndex] = createSignal<number | null>(2);
  const [lastConfirmedPath, setLastConfirmedPath] = createSignal<string | null>(
    null,
  );
  const [parentNavigationCount, setParentNavigationCount] = createSignal(0);

  const entries = createMemo(() => {
    const loweredQuery = query().trim().toLowerCase();
    return BASE_ENTRIES
      .filter((entry) =>
        loweredQuery === "" || entry.name.toLowerCase().includes(loweredQuery)
      )
      .slice()
      .sort((left, right) => compareBySort(left, right, sort()));
  });

  const snapshot = createMemo<DirectorySnapshot>(() => ({
    current_directory_path: "/workspace",
    parent_directory_path: "/",
    entries: entries(),
    total_entries: entries().length,
    offset: 0,
    limit: entries().length,
    query: query(),
    sort: sort(),
  }));

  return (
    <main data-testid="file-browser-harness">
      <div data-testid="selected-path">{selectedPath() ?? ""}</div>
      <div data-testid="selected-index">{selectedIndex()?.toString() ?? ""}</div>
      <div data-testid="confirmed-path">{lastConfirmedPath() ?? ""}</div>
      <div data-testid="parent-count">{parentNavigationCount().toString()}</div>
      <FileBrowserPane
        active={true}
        directory={snapshot()}
        selectedPath={selectedPath()}
        selectedIndex={selectedIndex()}
        query={query()}
        sort={sort()}
        isLoading={false}
        onChangeQuery={(value) => {
          setQuery(value);
          setSelectedIndex(0);
          const first = entries()[0];
          setSelectedPath(first?.path ?? null);
        }}
        onChangeSort={(value) => {
          setSort(value);
          setSelectedIndex(0);
          const first = entries()[0];
          setSelectedPath(first?.path ?? null);
        }}
        onSelectEntry={(entry) => {
          const nextIndex = entries().findIndex((candidate) =>
            candidate.path === entry.path
          );
          setSelectedPath(entry.path);
          setSelectedIndex(nextIndex === -1 ? null : nextIndex);
        }}
        onSelectIndex={(index) => {
          const entry = entries()[index];
          setSelectedIndex(index);
          setSelectedPath(entry?.path ?? null);
        }}
        onConfirmEntry={(entry) => {
          setLastConfirmedPath(entry.path);
        }}
        onCopyPath={() => {}}
        onNavigateToParent={() => {
          setParentNavigationCount((count) => count + 1);
        }}
      />
    </main>
  );
}

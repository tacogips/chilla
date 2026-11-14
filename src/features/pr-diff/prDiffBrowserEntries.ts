import type { PrDiffFile } from "../../lib/tauri/document";

export type BrowserEntry =
  | {
      readonly kind: "directory";
      readonly name: string;
      readonly path: string;
      readonly fileCount: number;
      readonly additions: number;
      readonly deletions: number;
    }
  | {
      readonly kind: "file";
      readonly name: string;
      readonly path: string;
      readonly file: PrDiffFile;
    };
function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export function basename(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

export function parentDir(path: string): string | null {
  if (path.length === 0) {
    return null;
  }

  return dirname(path);
}
export function buildDirectoryEntries(
  files: readonly PrDiffFile[],
  currentDir: string,
  query: string,
): readonly BrowserEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  const directories = new Map<
    string,
    {
      name: string;
      path: string;
      fileCount: number;
      additions: number;
      deletions: number;
    }
  >();
  const directFiles: PrDiffFile[] = [];
  const prefix = currentDir.length === 0 ? "" : `${currentDir}/`;

  for (const file of files) {
    if (!file.path.startsWith(prefix)) {
      continue;
    }

    const relative = file.path.slice(prefix.length);
    if (relative.length === 0) {
      continue;
    }

    const separatorIndex = relative.indexOf("/");
    if (separatorIndex === -1) {
      directFiles.push(file);
      continue;
    }

    const name = relative.slice(0, separatorIndex);
    const path = currentDir.length === 0 ? name : `${currentDir}/${name}`;
    const previous = directories.get(path);
    directories.set(path, {
      name,
      path,
      fileCount: (previous?.fileCount ?? 0) + 1,
      additions: (previous?.additions ?? 0) + file.additions,
      deletions: (previous?.deletions ?? 0) + file.deletions,
    });
  }

  const directoryEntries: BrowserEntry[] = [...directories.values()].map(
    (entry) => ({
      kind: "directory",
      ...entry,
    }),
  );
  const fileEntries: BrowserEntry[] = directFiles.map((file) => ({
    kind: "file",
    name: basename(file.path),
    path: file.path,
    file,
  }));

  return [...directoryEntries, ...fileEntries]
    .filter((entry) => {
      if (normalizedQuery.length === 0) {
        return true;
      }

      if (entry.kind === "directory") {
        const directoryPrefix = `${entry.path}/`;
        return files.some(
          (file) =>
            file.path.startsWith(directoryPrefix) &&
            file.path.toLowerCase().includes(normalizedQuery),
        );
      }

      return (
        entry.name.toLowerCase().includes(normalizedQuery) ||
        entry.path.toLowerCase().includes(normalizedQuery)
      );
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "directory" ? -1 : 1;
      }

      return left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
}

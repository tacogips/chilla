interface AbsolutePath {
  readonly root: string;
  readonly components: readonly string[];
}

function absolutePath(path: string): AbsolutePath | null {
  const drive = path.match(/^([A-Za-z]:)[\\/]/)?.[1];
  // Do not interpret backslashes in POSIX file names as separators.
  const normalized = drive === undefined ? path : path.replace(/\\/g, "/");
  const root = drive?.toUpperCase() ?? (path.startsWith("/") ? "/" : null);
  if (root === null || normalized.startsWith("//")) {
    return null;
  }
  const components = normalized.slice(root.length).split("/").filter(Boolean);
  if (components.some((component) => component === "." || component === "..")) {
    return null;
  }
  return { root, components };
}

/** Formats canonical destinations for display only; never resolves against the process cwd. */
export function relativeTargetPath(directory: string, target: string): string {
  const base = absolutePath(directory);
  const destination = absolutePath(target);
  if (base === null || destination === null || base.root !== destination.root) {
    return target;
  }

  let shared = 0;
  while (
    shared < base.components.length &&
    shared < destination.components.length &&
    base.components[shared] === destination.components[shared]
  ) {
    shared += 1;
  }

  return (
    [
      ...base.components.slice(shared).map(() => ".."),
      ...destination.components.slice(shared),
    ].join("/") || "."
  );
}

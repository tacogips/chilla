import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
} from "solid-js";
import {
  listDirectory,
  type DirectoryEntry,
  type DirectoryListSort,
} from "../../lib/tauri/document";

interface Branch {
  readonly entries: readonly DirectoryEntry[];
  readonly loading: boolean;
  readonly hasMore: boolean;
  readonly error: string | null;
  readonly nextOffset: number;
}

/** A directory page already loaded by List view, including its filtering identity. */
export interface DirectoryTreeSeed {
  readonly root: string;
  readonly entries: readonly DirectoryEntry[];
  readonly nextOffset: number;
  readonly hasMore: boolean;
  readonly sort: DirectoryListSort;
  readonly query: string;
  readonly hideGitIgnored: boolean;
}

export interface DirectoryTreeRow {
  readonly entry: DirectoryEntry;
  readonly depth: number;
  readonly parent: string;
}

/** Lazily lists branches, retaining folders while filtering so descendants remain reachable. */
export function createDirectoryTree(options: {
  readonly root: () => string | null;
  readonly enabled: () => boolean;
  readonly sort: () => DirectoryListSort;
  readonly hideGitIgnored: () => boolean;
  readonly query: () => string;
  readonly refresh: () => unknown;
  readonly seed?: () => DirectoryTreeSeed | null;
}) {
  const [branches, setBranches] = createSignal<ReadonlyMap<string, Branch>>(
    new Map(),
  );
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set());
  let generation = 0;
  let previousRoot: string | null = null;
  const [initializedRoot, setInitializedRoot] = createSignal<string | null>(
    null,
  );
  const update = (path: string, branch: Branch): void => {
    setBranches((previous) => new Map(previous).set(path, branch));
  };
  const reuseSeed = (): void => {
    const seed = options.seed?.();
    if (
      seed == null ||
      seed.root !== options.root() ||
      seed.query.trim() !== "" ||
      seed.sort.field !== options.sort().field ||
      seed.sort.direction !== options.sort().direction ||
      seed.hideGitIgnored !== options.hideGitIgnored()
    )
      return;
    const cached = branches().get(seed.root);
    if (
      cached !== undefined &&
      (cached.loading || cached.nextOffset >= seed.nextOffset)
    )
      return;
    update(seed.root, {
      entries: seed.entries,
      nextOffset: seed.nextOffset,
      hasMore: seed.hasMore,
      loading: false,
      error: null,
    });
  };
  const load = async (path: string): Promise<void> => {
    const previous = branches().get(path);
    if (
      previous?.loading ||
      (previous !== undefined && !previous.hasMore && previous.error === null)
    )
      return;
    const requestGeneration = generation;
    const entries = previous?.entries ?? [];
    const nextOffset = previous?.nextOffset ?? 0;
    update(path, {
      entries,
      nextOffset,
      loading: true,
      hasMore: true,
      error: null,
    });
    try {
      const page = await listDirectory(
        path,
        options.sort(),
        "",
        options.hideGitIgnored(),
        nextOffset,
        200,
      );
      if (requestGeneration !== generation) return;
      update(path, {
        entries: [
          ...entries,
          ...page.entries.map((entry) => ({
            ...entry,
            path: `${path.replace(/\/$/, "")}/${entry.name}`,
          })),
        ],
        loading: false,
        hasMore: page.has_more,
        error: null,
        nextOffset: page.offset + page.entries.length,
      });
    } catch (error: unknown) {
      if (requestGeneration !== generation) return;
      update(path, {
        entries,
        nextOffset,
        loading: false,
        hasMore: true,
        error:
          error instanceof Error ? error.message : "Failed to load directory",
      });
    }
  };
  createEffect(
    on(
      () =>
        [
          options.root(),
          options.sort().field,
          options.sort().direction,
          options.hideGitIgnored(),
          options.refresh(),
        ] as const,
      ([root]) => {
        generation += 1;
        setBranches(new Map());
        const retained = root === previousRoot ? expanded() : new Set<string>();
        previousRoot = root;
        setInitializedRoot(root);
        setExpanded(retained);
        reuseSeed();
      },
    ),
  );
  createEffect(() => {
    if (options.enabled()) reuseSeed();
  });
  onCleanup(() => {
    generation += 1;
  });
  const toggle = (path: string): void => {
    const next = new Set(expanded());
    if (next.has(path)) next.delete(path);
    else {
      next.add(path);
    }
    setExpanded(next);
  };
  const rows = createMemo(() => {
    const result: DirectoryTreeRow[] = [];
    const query = options.query().trim().toLocaleLowerCase();
    const visit = (parent: string, depth: number): void => {
      for (const entry of branches().get(parent)?.entries ?? []) {
        if (
          !entry.is_directory &&
          !entry.name.toLocaleLowerCase().includes(query)
        )
          continue;
        result.push({ entry, depth, parent });
        if (entry.is_directory && expanded().has(entry.path))
          visit(entry.path, depth + 1);
      }
    };
    const root = options.root();
    if (root !== null) visit(root, 0);
    return result;
  });
  createEffect(() => {
    if (!options.enabled()) return;
    const root = options.root();
    if (root !== initializedRoot()) return;
    if (root !== null && !branches().has(root)) void load(root);
    // Rows include only descendants of expanded ancestors. Loading a parent
    // makes its expanded children reachable on the next reactive pass.
    for (const row of rows()) {
      if (
        row.entry.is_directory &&
        expanded().has(row.entry.path) &&
        !branches().has(row.entry.path)
      )
        void load(row.entry.path);
    }
  });
  return { rows, branches, expanded, toggle, load };
}

import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  on,
  onCleanup,
  onMount,
} from "solid-js";
import { Portal } from "solid-js/web";
import {
  KeymapPopup,
  useKeymapController,
  type KeymapActions,
} from "../keymap/KeymapProvider";
import type {
  DirectoryEntry,
  DirectoryListSort,
} from "../../lib/tauri/document";
import { PaneResizeHandle } from "./PaneResizeHandle";
import { DirectorySearchPanel } from "./DirectorySearchPanel";
import type { DirectorySearchKind } from "../../lib/tauri/directory-search";
import {
  BrowserFilterGlyph,
  BrowserContentSearchGlyph,
  BrowserFileSearchGlyph,
  BrowserListGlyph,
  BrowserTreeGlyph,
} from "./browser-toolbar-glyphs";
import { createDirectoryTree, type DirectoryTreeSeed } from "./directory-tree";
import type { PaneWidthBounds } from "./paneResize";
import { relativeTargetPath } from "./relative-target-path";
import { DEFAULT_FILE_TREE_SORT, describeFileTreeSort } from "./sort";

/** Optional drag-to-resize wiring for the pane's right edge. */
export interface PaneResizeConfig {
  readonly getBounds: () => PaneWidthBounds;
  readonly onResize: (widthPx: number) => void;
  readonly onResizeEnd?: (() => void) | undefined;
  readonly label?: string | undefined;
}

function FolderGlyph() {
  return (
    <svg class="file-browser__glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2 6.5h4.25l1-1.5H14a.75.75 0 01.75.75v7a.75.75 0 01-.75.75H2a.75.75 0 01-.75-.75v-5.5A.75.75 0 012 6.5z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function FileGlyph() {
  return (
    <svg class="file-browser__glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4.5 2.25h4.25L12 5.5v8.25a.75.75 0 01-.75.75H4.5a.75.75 0 01-.75-.75v-11a.75.75 0 01.75-.75z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linejoin="round"
      />
      <path
        d="M8.75 2.25V6H12"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function SymlinkGlyph() {
  return (
    <svg
      class="file-browser__glyph file-browser__glyph--symlink"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d="M6.25 5.25l1.5-1.5a2.475 2.475 0 013.5 3.5l-2 2a2.475 2.475 0 01-3.5 0"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
      />
      <path
        d="M9.75 10.75l-1.5 1.5a2.475 2.475 0 01-3.5-3.5l2-2a2.475 2.475 0 013.5 0"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
      />
    </svg>
  );
}

function GitIgnoredVisibilityGlyph() {
  return (
    <svg class="file-browser__glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.25 8a5.75 5.75 0 0111.5 0 5.75 5.75 0 01-11.5 0z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
      />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      <path
        d="M2 2l12 12"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
  );
}

export interface FileBrowserSelectOptions {
  /** Skip selection debounce and open the preview immediately (Enter / Ctrl+M from filter). */
  readonly immediatePreview?: boolean;
  /** Request playback after the preview opens when the selected entry is a video file. */
  readonly playVideo?: boolean;
}

interface FileBrowserPaneProps {
  readonly listingKind: "directory" | "explicit_file_set";
  readonly active: boolean;
  readonly directory: {
    readonly current_directory_path: string;
    readonly parent_directory_path: string | null;
    readonly entries: readonly DirectoryEntry[];
    readonly total_entry_count: number;
  } | null;
  readonly sort: DirectoryListSort;
  readonly query: string;
  readonly hideGitIgnored: boolean;
  readonly selectedPath: string | null;
  readonly canLoadMore: boolean;
  readonly isLoadingMore: boolean;
  readonly onChangeQuery: (nextQuery: string) => void;
  readonly onChangeSort: (nextSort: DirectoryListSort) => void;
  readonly onLoadMore: () => void;
  readonly onSelectEntry: (
    entry: DirectoryEntry,
    options?: FileBrowserSelectOptions,
  ) => void;
  readonly onConfirmEntry: (
    entry: DirectoryEntry,
    options?: FileBrowserSelectOptions,
  ) => void;
  readonly onNavigateToParent: () => void;
  readonly onToggleGitIgnored: VoidFunction;
  readonly treeRootSeed?: DirectoryTreeSeed | null;
  readonly treeRefreshToken?: number;
  readonly viewMode?: "list" | "tree";
  readonly onChangeViewMode?: (mode: "list" | "tree") => void;
  /** When provided, renders a drag handle on the pane's right edge. */
  readonly resizeHandle?: PaneResizeConfig | undefined;
}

function FileBrowserEntryName(props: { readonly name: string }) {
  return (
    <span class="file-browser__name" title={props.name}>
      {props.name}
    </span>
  );
}

const DIRECTORY_PATH_COMPACTION_LENGTH = 20;

export interface CompactDirectoryPathRows {
  readonly leading: string;
  readonly trailing: string;
}

/** Splits a long directory path into two Unicode-safe display rows. */
export function compactDirectoryPathRows(
  path: string,
): CompactDirectoryPathRows | null {
  const characters = Array.from(path);
  const maximumLength = DIRECTORY_PATH_COMPACTION_LENGTH * 2;

  if (characters.length <= maximumLength) {
    return null;
  }

  return {
    leading: `${characters.slice(0, DIRECTORY_PATH_COMPACTION_LENGTH).join("")}…`,
    trailing: characters.slice(-DIRECTORY_PATH_COMPACTION_LENGTH).join(""),
  };
}

/** Keeps a directory path recognizable without splitting Unicode code points. */
export function compactDirectoryPath(path: string): string {
  const rows = compactDirectoryPathRows(path);

  return rows === null ? path : `${rows.leading}${rows.trailing}`;
}

/** Builds a root-to-leaf display tree for an absolute directory path. */
export function directoryPathComponents(path: string): readonly string[] {
  const normalizedPath = path.replace(/\\/g, "/");
  const hasPosixRoot = normalizedPath.startsWith("/");
  const windowsRoot = normalizedPath.match(/^[A-Za-z]:\//)?.[0];
  const root = hasPosixRoot ? "/" : windowsRoot;
  const remainder =
    root === undefined ? normalizedPath : normalizedPath.slice(root.length);
  const components = remainder
    .split("/")
    .filter((component: string) => component !== "");

  return root === undefined ? components : [root, ...components];
}

/** Ctrl/Cmd+M when the file list (or filter field) handles the shortcut. */
function isModifierM(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
    return false;
  }

  if (event.code === "KeyM") {
    return true;
  }

  const key = event.key;

  if (key === "m" || key === "M") {
    return true;
  }

  return event.keyCode === 77;
}

function focusListButtonForPath(
  list: HTMLUListElement | undefined,
  selectedPath: string | null,
): boolean {
  if (list === undefined) {
    return false;
  }

  const buttons = list.querySelectorAll<HTMLButtonElement>(
    ".file-browser__button",
  );

  if (selectedPath !== null) {
    for (const button of buttons) {
      if (button.getAttribute("data-path") === selectedPath) {
        focusListButton(button);
        return true;
      }
    }
  }

  const first = buttons.item(0);

  if (first !== null) {
    focusListButton(first);
    return true;
  }

  return false;
}

function focusListButton(button: HTMLButtonElement): void {
  button.focus({ preventScroll: true });

  if (typeof button.scrollIntoView === "function") {
    button.scrollIntoView({ block: "nearest" });
  }
}

export function FileBrowserPane(props: FileBrowserPaneProps) {
  const { controller: keymap, standalone: standaloneKeymap } =
    useKeymapController();
  let entriesViewportEl: HTMLDivElement | undefined;
  let listEl: HTMLUListElement | undefined;
  let directoryInformationDialogEl: HTMLElement | undefined;
  let directoryInformationReturnFocusEl: HTMLElement | null = null;
  const filterInputId = createUniqueId();
  let filterToggleEl: HTMLButtonElement | undefined;
  let searchReturnFocus: HTMLButtonElement | undefined;
  let paneBody: HTMLDivElement | undefined;
  const [searchKind, setSearchKind] = createSignal<DirectorySearchKind | null>(
    null,
  );
  createEffect(() => {
    if (props.listingKind !== "directory") setSearchKind(null);
  });
  const closeSearch = (): void => {
    setSearchKind(null);
    queueMicrotask(() => searchReturnFocus?.focus());
  };
  const openSearch = (
    kind: DirectorySearchKind,
    trigger: HTMLButtonElement,
  ): void => {
    searchReturnFocus = trigger;
    setSearchKind(kind);
    queueMicrotask(() =>
      paneBody
        ?.querySelector<HTMLInputElement>(".directory-search__input")
        ?.focus(),
    );
  };
  const [isFilterOpen, setFilterOpen] = createSignal(false);
  const showFilter = () => isFilterOpen() || props.query.length > 0;
  const revealFilter = (): void => {
    setSearchKind(null);
    setFilterOpen(true);
    queueMicrotask(() => {
      const input = filterInputFromDom();
      input?.focus();
      input?.select();
    });
  };
  const directoryInformationTitleId = createUniqueId();
  const [isDirectoryInformationOpen, setDirectoryInformationOpen] =
    createSignal(false);
  const [viewMode, setViewMode] = createSignal<"list" | "tree">("list");
  const isTree = () =>
    props.listingKind === "directory" &&
    (props.viewMode ?? viewMode()) === "tree";
  const changeViewMode = (mode: "list" | "tree"): void => {
    setSearchKind(null);
    setViewMode(mode);
    props.onChangeViewMode?.(mode);
  };
  const tree = createDirectoryTree({
    root: () => props.directory?.current_directory_path ?? null,
    enabled: () => isTree() && searchKind() === null,
    sort: () => props.sort,
    hideGitIgnored: () => props.hideGitIgnored,
    query: () => props.query,
    refresh: () => props.treeRefreshToken ?? props.directory?.entries,
    seed: () => props.treeRootSeed ?? null,
  });
  const treeRowsByPath = createMemo(
    () => new Map(tree.rows().map((row) => [row.entry.path, row])),
  );
  const confirmEntry = (
    entry: DirectoryEntry,
    options?: FileBrowserSelectOptions,
  ): void => {
    if (isTree() && entry.is_directory) {
      props.onSelectEntry(entry);
      tree.toggle(entry.path);
    } else if (options === undefined) props.onConfirmEntry(entry);
    else props.onConfirmEntry(entry, options);
  };

  const filterInputFromDom = (): HTMLInputElement | null =>
    document.getElementById(filterInputId) as HTMLInputElement | null;

  const blurFilterInput = (): void => {
    filterInputFromDom()?.blur();
  };

  const isFilterInputFocused = (): boolean => {
    const filterInput = filterInputFromDom();

    return filterInput !== null && document.activeElement === filterInput;
  };

  const resolveFileBrowserListEl = (): HTMLUListElement | undefined => {
    return (
      (listEl?.isConnected ? listEl : undefined) ??
      filterInputFromDom()
        ?.closest(".file-browser")
        ?.querySelector<HTMLUListElement>("ul.file-browser__list") ??
      undefined
    );
  };

  const filteredEntries = createMemo(() =>
    isTree()
      ? tree.rows().map((row) => row.entry)
      : (props.directory?.entries ?? []),
  );

  const loadedEntryCount = createMemo(() =>
    isTree() ? tree.rows().length : (props.directory?.entries.length ?? 0),
  );
  const totalEntryCount = createMemo(() =>
    isTree() ? tree.rows().length : (props.directory?.total_entry_count ?? 0),
  );

  const filterSummary = createMemo(() => {
    const loaded = loadedEntryCount();
    const total = totalEntryCount();
    const shown = filteredEntries().length;
    const trimmed = props.query.trim();

    if (total === 0) {
      return "0 entries";
    }

    if (trimmed === "") {
      if (loaded === total) {
        return `${total} ${total === 1 ? "entry" : "entries"}`;
      }

      return `${loaded} of ${total} loaded`;
    }

    return `${shown} of ${loaded} loaded (${total} total)`;
  });

  const sortSummary = createMemo(() => describeFileTreeSort(props.sort));

  const filterPlaceholder = (): string =>
    props.listingKind === "explicit_file_set"
      ? "Filter by name or path..."
      : "Filter by name...";

  const pathLinePrimary = (): string => {
    if (props.directory === null) {
      return "Loading...";
    }

    return props.listingKind === "explicit_file_set"
      ? "Opened from CLI selection"
      : props.directory.current_directory_path;
  };

  const currentDirectoryPath = createMemo(() => {
    if (props.listingKind !== "directory" || props.directory === null) {
      return null;
    }

    return props.directory.current_directory_path;
  });

  const compactCurrentDirectoryPathRows = createMemo(() => {
    const directoryPath = currentDirectoryPath();

    return directoryPath === null
      ? null
      : compactDirectoryPathRows(directoryPath);
  });

  const openDirectoryInformation = (): void => {
    directoryInformationReturnFocusEl =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDirectoryInformationOpen(true);
  };

  const closeDirectoryInformation = (): void => {
    if (!isDirectoryInformationOpen()) {
      return;
    }

    const returnFocusEl = directoryInformationReturnFocusEl;
    directoryInformationReturnFocusEl = null;
    setDirectoryInformationOpen(false);

    queueMicrotask(() => {
      if (returnFocusEl?.isConnected) {
        returnFocusEl.focus({ preventScroll: true });
        return;
      }

      focusListButtonForPath(resolveFileBrowserListEl(), props.selectedPath);
    });
  };

  const handleDirectoryInformationKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryInformation();
      return;
    }

    if (event.key !== "Tab") {
      event.stopPropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const dialog = directoryInformationDialogEl;
    if (dialog === undefined) {
      return;
    }

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusableElements.length === 0) {
      dialog.focus({ preventScroll: true });
      return;
    }

    const activeElement = document.activeElement;
    const activeIndex =
      activeElement instanceof HTMLElement
        ? focusableElements.indexOf(activeElement)
        : -1;
    const nextIndex = event.shiftKey
      ? activeIndex <= 0
        ? focusableElements.length - 1
        : activeIndex - 1
      : activeIndex === -1 || activeIndex === focusableElements.length - 1
        ? 0
        : activeIndex + 1;

    focusableElements[nextIndex]?.focus({ preventScroll: true });
  };

  const isFileBrowserShortcutTarget = (target: EventTarget | null): boolean => {
    return (
      target instanceof HTMLElement && target.closest(".file-browser") !== null
    );
  };

  const requestMoreEntriesIfNeeded = (): void => {
    if (
      searchKind() !== null ||
      isTree() ||
      !props.canLoadMore ||
      props.isLoadingMore ||
      entriesViewportEl === undefined
    ) {
      return;
    }

    const remaining =
      entriesViewportEl.scrollHeight -
      entriesViewportEl.scrollTop -
      entriesViewportEl.clientHeight;

    if (remaining <= 240) {
      props.onLoadMore();
    }
  };

  const focusFirstListButton = (
    entries: readonly DirectoryEntry[],
    options?: FileBrowserSelectOptions,
  ) => {
    const first = entries[0];

    if (first === undefined) {
      return;
    }

    const pathToFocus = first.path;

    blurFilterInput();
    props.onSelectEntry(first, options);

    const tryFocus = () =>
      focusListButtonForPath(resolveFileBrowserListEl(), pathToFocus);

    if (tryFocus()) {
      return;
    }

    queueMicrotask(() => {
      if (tryFocus()) {
        return;
      }

      requestAnimationFrame(() => {
        if (!tryFocus()) {
          blurFilterInput();
        }
      });
    });
  };

  const leaveFilterForList = (
    clearFilter: boolean,
    immediatePreview?: boolean,
  ) => {
    if (clearFilter) {
      props.onChangeQuery("");
    }

    const entries = filteredEntries();

    if (entries.length === 0) {
      blurFilterInput();
      return;
    }

    focusFirstListButton(
      entries,
      immediatePreview === true
        ? { immediatePreview: true, playVideo: true }
        : undefined,
    );
  };

  createEffect(
    on(
      () =>
        props.active
          ? {
              listingKind: props.listingKind,
              cwd: props.directory?.current_directory_path ?? null,
              selectedPath: props.selectedPath,
            }
          : null,
      (state) => {
        if (state === null || state.cwd === null) {
          return;
        }

        if (isFilterInputFocused()) {
          return;
        }

        queueMicrotask(() => {
          requestAnimationFrame(() => {
            if (isFilterInputFocused() || searchKind() !== null) return;
            focusListButtonForPath(
              resolveFileBrowserListEl(),
              state.selectedPath,
            );
          });
        });
      },
    ),
  );

  createEffect(
    on(
      () =>
        props.active ? (props.directory?.current_directory_path ?? null) : null,
      () => {
        if (entriesViewportEl !== undefined) {
          entriesViewportEl.scrollTop = 0;
        }
      },
    ),
  );

  createEffect(
    on(
      () => ({
        loaded: loadedEntryCount(),
        total: totalEntryCount(),
        selectedPath: props.selectedPath,
        query: props.query,
      }),
      () => {
        queueMicrotask(() => {
          requestAnimationFrame(() => {
            requestMoreEntriesIfNeeded();
          });
        });
      },
    ),
  );

  const selectedEntry = (): DirectoryEntry | undefined =>
    filteredEntries().find((entry) => entry.path === props.selectedPath) ??
    filteredEntries()[0];
  const moveBrowserCursor = (delta: -1 | 1): void => {
    const entries = filteredEntries();
    const index = entries.findIndex(
      (entry) => entry.path === props.selectedPath,
    );
    const nextIndex =
      index < 0 ? 0 : Math.max(0, Math.min(entries.length - 1, index + delta));
    const entry = entries[nextIndex];
    if (entry !== undefined) {
      props.onSelectEntry(entry);
      if (!isTree() && nextIndex >= entries.length - 20) props.onLoadMore();
    }
  };
  const openBrowserSelection = (enter: boolean, event: KeyboardEvent): void => {
    const focusedPath =
      event.target instanceof Element
        ? event.target
            .closest(".file-browser__button")
            ?.getAttribute("data-path")
        : null;
    const entry =
      filteredEntries().find((candidate) => candidate.path === focusedPath) ??
      selectedEntry();
    if (entry === undefined) return;
    if (
      enter &&
      isTree() &&
      entry.is_directory &&
      tree.expanded().has(entry.path)
    ) {
      const child = tree.rows().find((row) => row.parent === entry.path);
      if (child !== undefined) props.onSelectEntry(child.entry);
    } else confirmEntry(entry, { immediatePreview: true, playVideo: true });
  };
  const actions: KeymapActions = {
    "cursor.down": () => moveBrowserCursor(1),
    "cursor.up": () => moveBrowserCursor(-1),
    parent: () => {
      if (isTree()) {
        const row = treeRowsByPath().get(props.selectedPath ?? "");
        if (row?.entry.is_directory && tree.expanded().has(row.entry.path))
          tree.toggle(row.entry.path);
        else {
          const parent = treeRowsByPath().get(row?.parent ?? "");
          if (parent !== undefined) props.onSelectEntry(parent.entry);
        }
      } else if (props.listingKind === "directory") props.onNavigateToParent();
    },
    enter: (event) => openBrowserSelection(true, event),
    open: (event) => openBrowserSelection(false, event),
    filter: revealFilter,
    "view.toggle": () => {
      if (props.listingKind === "directory")
        changeViewMode(isTree() ? "list" : "tree");
    },
    "ignored.toggle": () => {
      if (props.listingKind === "directory") props.onToggleGitIgnored();
    },
    "directory.info": () => {
      if (currentDirectoryPath() !== null) openDirectoryInformation();
    },
    "search.name": () => {
      const trigger = paneBody?.querySelector<HTMLButtonElement>(
        '[aria-label="Find files"]',
      );
      if (trigger != null && !trigger.disabled) openSearch("name", trigger);
    },
    "search.content": () => {
      const trigger = paneBody?.querySelector<HTMLButtonElement>(
        '[aria-label="Search file contents"]',
      );
      if (trigger != null && !trigger.disabled) openSearch("content", trigger);
    },
    "sort.reset": () => props.onChangeSort(DEFAULT_FILE_TREE_SORT),
  };
  for (const field of ["name", "extension", "mtime", "size"] as const)
    for (const direction of ["asc", "desc"] as const)
      actions[`sort.${field}.${direction}`] = () =>
        props.onChangeSort({ field, direction });
  keymap.register({
    context: "file",
    enabled: () =>
      props.active && !isDirectoryInformationOpen() && searchKind() === null,
    identity: () =>
      `${props.listingKind}:${props.directory?.current_directory_path ?? ""}:${props.viewMode ?? viewMode()}`,
    accepts: (event, action) => {
      if (
        action === "open" &&
        event.key === " " &&
        !(
          event.target instanceof Element &&
          event.target.closest(".file-browser__button") !== null
        )
      )
        return false;
      if (
        props.listingKind !== "directory" &&
        [
          "view.toggle",
          "ignored.toggle",
          "directory.info",
          "search.name",
          "search.content",
        ].includes(action)
      )
        return false;
      if (
        (action.startsWith("sort.") ||
          action.startsWith("search.") ||
          action === "directory.info" ||
          action === "ignored.toggle") &&
        !isFileBrowserShortcutTarget(event.target)
      )
        return false;
      if (
        event.target instanceof Element &&
        event.target.closest(
          ".file-browser__toolbar, .file-browser__status",
        ) !== null &&
        ["Enter", " ", "Tab"].includes(event.key)
      )
        return false;
      return true;
    },
    actions,
  });
  const keyHint = (action: keyof KeymapActions): string =>
    keymap
      .keymap()
      .file.filter((binding) => binding.actions.includes(action))
      .map((binding) => binding.keys.join(" then "))
      .join(" or ");
  onMount(() => {
    const keepDirectoryInformationFocusInside = (event: FocusEvent): void => {
      const dialog = directoryInformationDialogEl;
      if (
        isDirectoryInformationOpen() &&
        dialog !== undefined &&
        !(event.target instanceof Node && dialog.contains(event.target))
      )
        dialog.focus({ preventScroll: true });
    };
    const closeDialog = (event: KeyboardEvent): void => {
      if (isDirectoryInformationOpen() && event.key === "Escape") {
        event.preventDefault();
        closeDirectoryInformation();
      }
    };
    window.addEventListener("focusin", keepDirectoryInformationFocusInside);
    window.addEventListener("keydown", closeDialog);
    onCleanup(() => {
      window.removeEventListener(
        "focusin",
        keepDirectoryInformationFocusInside,
      );
      window.removeEventListener("keydown", closeDialog);
    });
  });

  return (
    <section class="pane">
      <header class="pane__header">
        <span class="pane__title">
          {props.listingKind === "explicit_file_set"
            ? "Selected Files"
            : "File View"}
        </span>
        <span>
          {filterSummary()} | {sortSummary()}
        </span>
      </header>
      <div
        class="pane__body file-browser"
        ref={(element) => {
          paneBody = element;
        }}
      >
        <div class="file-browser__toolbar">
          <Show when={standaloneKeymap}>
            <KeymapPopup controller={keymap} />
          </Show>
          <Show when={props.listingKind === "directory"}>
            <div
              class="file-browser__view-toggle"
              role="group"
              aria-label="File browser view"
            >
              <button
                type="button"
                class="file-browser__view-option"
                aria-label="List"
                title={
                  keyHint("view.toggle")
                    ? `List view (${keyHint("view.toggle")} toggles)`
                    : "List view"
                }
                aria-pressed={!isTree()}
                onClick={() => changeViewMode("list")}
              >
                <BrowserListGlyph />
              </button>
              <button
                type="button"
                class="file-browser__view-option"
                aria-label="Tree"
                title={
                  keyHint("view.toggle")
                    ? `Tree view (${keyHint("view.toggle")} toggles)`
                    : "Tree view"
                }
                aria-pressed={isTree()}
                onClick={() => changeViewMode("tree")}
              >
                <BrowserTreeGlyph />
              </button>
            </div>
          </Show>
          <div class="file-browser__toolbar-actions">
            <button
              type="button"
              class="file-browser__filter-toggle file-browser__icon-button"
              aria-label="Show filter"
              title={
                keyHint("filter")
                  ? `Show and focus filter (${keyHint("filter")})`
                  : "Show and focus filter"
              }
              aria-expanded={showFilter() && searchKind() === null}
              aria-controls={
                showFilter() && searchKind() === null
                  ? filterInputId
                  : undefined
              }
              ref={(element) => {
                filterToggleEl = element;
              }}
              onClick={revealFilter}
            >
              <BrowserFilterGlyph />
            </button>
            <Show when={props.listingKind === "directory"}>
              <button
                type="button"
                class="file-browser__icon-button"
                aria-label="Search file contents"
                disabled={props.directory === null}
                title={
                  keyHint("search.content")
                    ? `Search file contents (${keyHint("search.content")})`
                    : "Search file contents"
                }
                aria-pressed={searchKind() === "content"}
                onClick={(event) => openSearch("content", event.currentTarget)}
              >
                <BrowserContentSearchGlyph />
              </button>
              <button
                type="button"
                class="file-browser__icon-button"
                aria-label="Find files"
                disabled={props.directory === null}
                title={
                  keyHint("search.name")
                    ? `Find files (${keyHint("search.name")})`
                    : "Find files"
                }
                aria-pressed={searchKind() === "name"}
                onClick={(event) => openSearch("name", event.currentTarget)}
              >
                <BrowserFileSearchGlyph />
              </button>
              <button
                type="button"
                class={`file-browser__icon-button file-browser__git-ignored-toggle${props.hideGitIgnored ? " file-browser__git-ignored-toggle--active" : ""}`}
                aria-label={`${props.hideGitIgnored ? "Git-ignored entries are hidden. Show Git-ignored entries" : "Git-ignored entries are visible. Hide Git-ignored entries"}${keyHint("ignored.toggle") ? ` (${keyHint("ignored.toggle")})` : ""}`}
                aria-pressed={props.hideGitIgnored}
                title={`${props.hideGitIgnored ? "Git-ignored entries are hidden. Show them" : "Git-ignored entries are visible. Hide them"}${keyHint("ignored.toggle") ? ` (${keyHint("ignored.toggle")})` : ""}`}
                onClick={props.onToggleGitIgnored}
              >
                <GitIgnoredVisibilityGlyph />
              </button>
            </Show>
          </div>
        </div>
        <div
          class={`file-browser__path${
            props.listingKind === "directory" &&
            props.directory !== null &&
            props.selectedPath === props.directory.current_directory_path
              ? " file-browser__path--selected"
              : ""
          }${
            compactCurrentDirectoryPathRows() !== null
              ? " file-browser__path--compact"
              : ""
          }`}
          title={currentDirectoryPath() ?? undefined}
        >
          <Show
            when={compactCurrentDirectoryPathRows()}
            keyed
            fallback={pathLinePrimary()}
          >
            {(rows) => (
              <>
                <span class="file-browser__path-row file-browser__path-row--leading">
                  {rows.leading}
                </span>
                <span class="file-browser__path-row file-browser__path-row--trailing">
                  {rows.trailing}
                </span>
              </>
            )}
          </Show>
        </div>
        <Show when={searchKind()}>
          {(kind) => (
            <DirectorySearchPanel
              root={props.directory?.current_directory_path ?? ""}
              kind={kind()}
              hideGitIgnored={props.hideGitIgnored}
              onClose={closeSearch}
              onOpen={(entry) => props.onConfirmEntry(entry)}
            />
          )}
        </Show>
        <Show when={showFilter() && searchKind() === null}>
          <div class="file-browser__filter-row">
            <input
              id={filterInputId}
              class="file-browser__filter"
              type="text"
              role="searchbox"
              aria-label="Filter files"
              inputMode="search"
              placeholder={filterPlaceholder()}
              title="Enter or Ctrl+M selects the first row; Escape clears and closes filtering"
              autocomplete="off"
              spellcheck={false}
              value={props.query}
              onInput={(event) => {
                props.onChangeQuery(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  if (event.isComposing) return;
                  event.preventDefault();
                  event.stopPropagation();
                  leaveFilterForList(true);
                  setFilterOpen(false);
                  queueMicrotask(() => {
                    if (
                      !focusListButtonForPath(
                        resolveFileBrowserListEl(),
                        props.selectedPath,
                      )
                    )
                      filterToggleEl?.focus();
                  });
                  return;
                }

                // Enter / Ctrl+M: same as "first row" when the list has focus (window
                // handler ignores keys while typing in this field unless we handle here).
                if (event.key === "Enter" && !event.isComposing) {
                  event.preventDefault();
                  event.stopPropagation();
                  leaveFilterForList(false, true);
                  return;
                }

                if (isModifierM(event)) {
                  event.preventDefault();
                  event.stopPropagation();
                  leaveFilterForList(false, true);
                  return;
                }
              }}
            />
          </div>
        </Show>
        <div
          class="file-browser__entries"
          style={searchKind() !== null ? { display: "none" } : undefined}
          ref={(element) => {
            entriesViewportEl = element ?? undefined;
          }}
          onScroll={() => {
            requestMoreEntriesIfNeeded();
          }}
        >
          <Show
            when={totalEntryCount() > 0}
            fallback={
              <div class="empty">
                <Show
                  when={props.listingKind === "explicit_file_set"}
                  fallback={
                    isTree() ? (
                      tree
                        .branches()
                        .get(props.directory?.current_directory_path ?? "")
                        ?.loading ? (
                        "Loading directory..."
                      ) : props.query.trim() === "" ? (
                        "No entries in this directory."
                      ) : (
                        "No loaded files match. Expand folders or load more entries."
                      )
                    ) : (
                      <>
                        No entries in this directory. Use <code>h</code> to move
                        up.
                      </>
                    )
                  }
                >
                  No files were provided.
                </Show>
              </div>
            }
          >
            <Show
              when={filteredEntries().length > 0}
              fallback={
                <div class="empty">
                  <Show
                    when={props.listingKind === "explicit_file_set"}
                    fallback={
                      <>
                        No file or folder names match this filter. Use{" "}
                        <code>h</code> to move up.
                      </>
                    }
                  >
                    No selected files match this filter.
                  </Show>
                </div>
              }
            >
              <ul
                class="file-browser__list"
                role={isTree() ? "tree" : undefined}
                aria-label={isTree() ? "Directory tree" : undefined}
                ref={(element) => {
                  listEl = element ?? undefined;
                }}
              >
                <For each={filteredEntries()}>
                  {(entry) => {
                    const accessibleName = () =>
                      entry.is_symlink
                        ? `${entry.name}, symbolic link to ${entry.canonical_path}`
                        : entry.name;

                    return (
                      <li role={isTree() ? "none" : undefined}>
                        <button
                          type="button"
                          data-path={entry.path}
                          class={`file-browser__button${isTree() ? " file-browser__tree-row" : ""}${
                            entry.is_directory
                              ? " file-browser__button--dir"
                              : " file-browser__button--file"
                          }${
                            entry.is_symlink
                              ? " file-browser__button--symlink"
                              : ""
                          }${
                            props.selectedPath === entry.path
                              ? " file-browser__button--active"
                              : ""
                          }`}
                          aria-label={accessibleName()}
                          role={isTree() ? "treeitem" : undefined}
                          aria-level={
                            isTree()
                              ? (treeRowsByPath().get(entry.path)?.depth ?? 0) +
                                1
                              : undefined
                          }
                          aria-selected={
                            isTree()
                              ? props.selectedPath === entry.path
                              : undefined
                          }
                          aria-expanded={
                            isTree() && entry.is_directory
                              ? tree.expanded().has(entry.path)
                              : undefined
                          }
                          style={
                            isTree()
                              ? {
                                  "--tree-depth": String(
                                    treeRowsByPath().get(entry.path)?.depth ??
                                      0,
                                  ),
                                }
                              : undefined
                          }
                          title={
                            entry.is_symlink ? accessibleName() : undefined
                          }
                          onClick={(event) => {
                            if (event.detail === 0) {
                              confirmEntry(entry, {
                                immediatePreview: true,
                                playVideo: true,
                              });
                              return;
                            }

                            confirmEntry(entry);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ")
                              event.preventDefault();
                          }}
                        >
                          <Show when={isTree()}>
                            <span
                              class="file-browser__tree-chevron"
                              aria-hidden="true"
                            >
                              {entry.is_directory
                                ? tree.expanded().has(entry.path)
                                  ? "▾"
                                  : "▸"
                                : ""}
                            </span>
                          </Show>
                          <span class="file-browser__icon" aria-hidden="true">
                            {entry.is_symlink ? (
                              <SymlinkGlyph />
                            ) : entry.is_directory ? (
                              <FolderGlyph />
                            ) : (
                              <FileGlyph />
                            )}
                          </span>
                          <span class="file-browser__entry-labels">
                            <FileBrowserEntryName name={entry.name} />
                            <Show
                              when={entry.is_symlink}
                              fallback={
                                <Show
                                  when={entry.directory_hint.trim().length > 0}
                                >
                                  <span class="file-browser__path-hint">
                                    {entry.directory_hint}
                                  </span>
                                </Show>
                              }
                            >
                              <span
                                class="file-browser__symlink-target"
                                title={entry.canonical_path}
                              >
                                →{" "}
                                {relativeTargetPath(
                                  isTree()
                                    ? (treeRowsByPath().get(entry.path)
                                        ?.parent ?? "")
                                    : (props.directory
                                        ?.current_directory_path ?? ""),
                                  entry.canonical_path,
                                )}
                              </span>
                            </Show>
                          </span>
                        </button>
                      </li>
                    );
                  }}
                </For>
                <Show when={!isTree() && props.isLoadingMore}>
                  <li class="file-browser__status">Loading more entries...</li>
                </Show>
                <Show
                  when={!isTree() && props.canLoadMore && !props.isLoadingMore}
                >
                  <li class="file-browser__status">
                    Scroll or move down to load more
                  </li>
                </Show>
              </ul>
            </Show>
          </Show>
          <Show when={isTree()}>
            <For
              each={[
                props.directory?.current_directory_path ?? "",
                ...tree
                  .rows()
                  .filter(
                    (row) =>
                      row.entry.is_directory &&
                      tree.expanded().has(row.entry.path),
                  )
                  .map((row) => row.entry.path),
              ]}
            >
              {(path) => (
                <Show when={tree.branches().get(path)}>
                  {(branch) => (
                    <Show
                      when={
                        branch().loading ||
                        branch().error !== null ||
                        branch().hasMore
                      }
                    >
                      <div class="file-browser__status">
                        <Show
                          when={branch().loading}
                          fallback={
                            <button
                              type="button"
                              onClick={() => void tree.load(path)}
                            >
                              {branch().error === null ? "Load more" : "Retry"}:{" "}
                              {path.split("/").pop() || "/"}
                            </button>
                          }
                        >
                          Loading {path.split("/").pop() || "/"}...
                        </Show>
                        <Show when={branch().error !== null}>
                          <span role="alert">{branch().error}</span>
                        </Show>
                      </div>
                    </Show>
                  )}
                </Show>
              )}
            </For>
          </Show>
        </div>
      </div>
      <Show
        when={isDirectoryInformationOpen() ? currentDirectoryPath() : undefined}
        keyed
      >
        {(directoryPath) => (
          <Portal>
            <div class="directory-information-layer">
              <button
                type="button"
                class="directory-information-backdrop"
                aria-label="Close directory information"
                onClick={closeDirectoryInformation}
              />
              <section
                class="directory-information"
                role="dialog"
                aria-modal="true"
                aria-labelledby={directoryInformationTitleId}
                tabIndex={-1}
                ref={(element) => {
                  directoryInformationDialogEl = element ?? undefined;
                  queueMicrotask(() => element?.focus({ preventScroll: true }));
                }}
                onKeyDown={handleDirectoryInformationKeyDown}
              >
                <header class="directory-information__header">
                  <h2 id={directoryInformationTitleId}>
                    Directory information
                  </h2>
                  <button
                    type="button"
                    class="directory-information__close"
                    aria-label="Close directory information"
                    onClick={closeDirectoryInformation}
                  >
                    Close
                  </button>
                </header>
                <p class="directory-information__absolute-path">
                  {directoryPath}
                </p>
                <ul
                  class="directory-information__path-tree"
                  aria-label="Directory path components"
                >
                  <For each={directoryPathComponents(directoryPath)}>
                    {(component, index) => (
                      <li style={{ "--directory-depth": String(index()) }}>
                        {component}
                      </li>
                    )}
                  </For>
                </ul>
                <dl class="directory-information__details">
                  <dt>Total entries</dt>
                  <dd>{totalEntryCount()}</dd>
                  <dt>Loaded entries</dt>
                  <dd>{loadedEntryCount()}</dd>
                  <dt>Active sort</dt>
                  <dd>{sortSummary()}</dd>
                  <dt>Text filter</dt>
                  <dd>{props.query.trim() === "" ? "None" : props.query}</dd>
                  <dt>Git-ignored entries</dt>
                  <dd>{props.hideGitIgnored ? "Hidden" : "Visible"}</dd>
                </dl>
                <p class="directory-information__hint">
                  Press Escape to close.
                </p>
              </section>
            </div>
          </Portal>
        )}
      </Show>
      <Show when={props.resizeHandle}>
        {(config) => (
          <PaneResizeHandle
            getBounds={config().getBounds}
            onResize={config().onResize}
            onResizeEnd={config().onResizeEnd}
            label={config().label}
          />
        )}
      </Show>
    </section>
  );
}

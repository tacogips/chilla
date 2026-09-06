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
import { isEditableKeyboardTarget } from "../../lib/keyboard";
import type {
  DirectoryEntry,
  DirectoryListSort,
} from "../../lib/tauri/document";
import { PaneResizeHandle } from "./PaneResizeHandle";
import type { PaneWidthBounds } from "./paneResize";
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
  let entriesViewportEl: HTMLDivElement | undefined;
  let listEl: HTMLUListElement | undefined;
  let directoryInformationDialogEl: HTMLElement | undefined;
  let directoryInformationReturnFocusEl: HTMLElement | null = null;
  const filterInputId = createUniqueId();
  const directoryInformationTitleId = createUniqueId();
  const [isDirectoryInformationOpen, setDirectoryInformationOpen] =
    createSignal(false);

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
      listEl ??
      filterInputFromDom()
        ?.closest(".file-browser")
        ?.querySelector<HTMLUListElement>("ul.file-browser__list") ??
      undefined
    );
  };

  const filteredEntries = createMemo(() => props.directory?.entries ?? []);

  const loadedEntryCount = createMemo(
    () => props.directory?.entries.length ?? 0,
  );
  const totalEntryCount = createMemo(
    () => props.directory?.total_entry_count ?? 0,
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

  const applySort = (
    event: KeyboardEvent,
    nextSort: DirectoryListSort,
  ): boolean => {
    if (!isFileBrowserShortcutTarget(event.target)) {
      return false;
    }

    event.preventDefault();
    props.onChangeSort(nextSort);
    return true;
  };

  const requestMoreEntriesIfNeeded = (): void => {
    if (
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

    const entries = props.directory?.entries ?? [];

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

  onMount(() => {
    const keepDirectoryInformationFocusInside = (event: FocusEvent): void => {
      const dialog = directoryInformationDialogEl;
      if (
        !isDirectoryInformationOpen() ||
        dialog === undefined ||
        (event.target instanceof Node && dialog.contains(event.target))
      ) {
        return;
      }

      dialog.focus({ preventScroll: true });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!props.active) {
        return;
      }

      if (isDirectoryInformationOpen() && event.key === "Escape") {
        event.preventDefault();
        closeDirectoryInformation();
        return;
      }

      if (isDirectoryInformationOpen()) {
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if (
        event.key === "Tab" &&
        currentDirectoryPath() !== null &&
        isFileBrowserShortcutTarget(event.target)
      ) {
        event.preventDefault();
        openDirectoryInformation();
        return;
      }

      if (event.key === "a") {
        if (applySort(event, { field: "name", direction: "asc" })) {
          return;
        }
      }

      if (event.key === "A") {
        if (applySort(event, { field: "name", direction: "desc" })) {
          return;
        }
      }

      if (event.key === "m") {
        if (applySort(event, { field: "mtime", direction: "asc" })) {
          return;
        }
      }

      if (event.key === "M") {
        if (applySort(event, { field: "mtime", direction: "desc" })) {
          return;
        }
      }

      if (event.key === "s") {
        if (applySort(event, { field: "size", direction: "asc" })) {
          return;
        }
      }

      if (event.key === "S") {
        if (applySort(event, { field: "size", direction: "desc" })) {
          return;
        }
      }

      if (event.key === "e") {
        if (applySort(event, { field: "extension", direction: "asc" })) {
          return;
        }
      }

      if (event.key === "E") {
        if (applySort(event, { field: "extension", direction: "desc" })) {
          return;
        }
      }

      if (event.key === "/") {
        event.preventDefault();
        const filterInput = filterInputFromDom();
        filterInput?.focus();
        filterInput?.select();
        return;
      }

      if (event.key === "0") {
        if (applySort(event, DEFAULT_FILE_TREE_SORT)) {
          return;
        }
      }

      if (
        event.key === "." &&
        props.listingKind === "directory" &&
        isFileBrowserShortcutTarget(event.target)
      ) {
        event.preventDefault();
        props.onToggleGitIgnored();
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "h" || event.key === "ArrowLeft") {
        event.preventDefault();

        if (props.listingKind === "explicit_file_set") {
          return;
        }

        props.onNavigateToParent();
        return;
      }

      const entries = filteredEntries();

      if (entries.length === 0) {
        return;
      }

      const selectedIndex = entries.findIndex(
        (entry) => entry.path === props.selectedPath,
      );
      const currentIndex = selectedIndex === -1 ? 0 : selectedIndex;
      const selectedEntry = entries[currentIndex];

      const moveSelection = (nextIndex: number) => {
        const nextEntry = entries[nextIndex];

        if (nextEntry !== undefined) {
          event.preventDefault();
          props.onSelectEntry(nextEntry);
          if (nextIndex >= entries.length - 20) {
            props.onLoadMore();
          }
        }
      };

      if (key === "j" || event.key === "ArrowDown") {
        moveSelection(
          selectedIndex === -1
            ? 0
            : Math.min(entries.length - 1, currentIndex + 1),
        );
        return;
      }

      if (key === "k" || event.key === "ArrowUp") {
        moveSelection(selectedIndex === -1 ? 0 : Math.max(0, currentIndex - 1));
        return;
      }

      if (event.key === " " || event.code === "Space") {
        if (selectedEntry !== undefined && !selectedEntry.is_directory) {
          event.preventDefault();
          props.onConfirmEntry(selectedEntry, {
            immediatePreview: true,
            playVideo: true,
          });
        }
        return;
      }

      if (
        key === "l" ||
        event.key === "ArrowRight" ||
        event.key === "Enter" ||
        isModifierM(event)
      ) {
        if (selectedEntry !== undefined) {
          event.preventDefault();
          props.onConfirmEntry(selectedEntry, {
            immediatePreview: true,
            playVideo: true,
          });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("focusin", keepDirectoryInformationFocusInside);

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(
        "focusin",
        keepDirectoryInformationFocusInside,
      );
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
      <div class="pane__body file-browser">
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
        <div class="file-browser__filter-row">
          <div class="file-browser__filter-controls">
            <label class="file-browser__filter-label" for={filterInputId}>
              Filter
            </label>
            <Show when={props.listingKind === "directory"}>
              <button
                type="button"
                class={`file-browser__git-ignored-toggle${
                  props.hideGitIgnored
                    ? " file-browser__git-ignored-toggle--active"
                    : ""
                }`}
                aria-label={
                  props.hideGitIgnored
                    ? "Git-ignored entries are hidden. Show Git-ignored entries (.)"
                    : "Git-ignored entries are visible. Hide Git-ignored entries (.)"
                }
                aria-pressed={props.hideGitIgnored}
                title={
                  props.hideGitIgnored
                    ? "Git-ignored entries are hidden. Show them (.)"
                    : "Git-ignored entries are visible. Hide them (.)"
                }
                onClick={props.onToggleGitIgnored}
              >
                <GitIgnoredVisibilityGlyph />
              </button>
            </Show>
          </div>
          <input
            id={filterInputId}
            class="file-browser__filter"
            type="text"
            role="searchbox"
            inputMode="search"
            placeholder={filterPlaceholder()}
            title="Focus filter: /   First row: Enter or Ctrl+M   Clear filter & first row: Esc   Sort: a/A name, e/E extension, m/M mtime, s/S size"
            autocomplete="off"
            spellcheck={false}
            value={props.query}
            onInput={(event) => {
              props.onChangeQuery(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                leaveFilterForList(true);
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
        <div
          class="file-browser__entries"
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
                    <>
                      No entries in this directory. Use <code>h</code> to move
                      up.
                    </>
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
                      <li>
                        <button
                          type="button"
                          data-path={entry.path}
                          class={`file-browser__button${
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
                          title={
                            entry.is_symlink ? accessibleName() : undefined
                          }
                          onClick={(event) => {
                            if (event.detail === 0) {
                              props.onConfirmEntry(entry, {
                                immediatePreview: true,
                                playVideo: true,
                              });
                              return;
                            }

                            props.onConfirmEntry(entry);
                          }}
                          onKeyDown={(event) => {
                            if (
                              event.key === " " ||
                              event.code === "Space" ||
                              event.key === "Enter" ||
                              isModifierM(event)
                            ) {
                              event.preventDefault();
                              event.stopPropagation();
                              props.onConfirmEntry(entry, {
                                immediatePreview: true,
                                playVideo: true,
                              });
                            }
                          }}
                        >
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
                                → {entry.canonical_path}
                              </span>
                            </Show>
                          </span>
                        </button>
                      </li>
                    );
                  }}
                </For>
                <Show when={props.isLoadingMore}>
                  <li class="file-browser__status">Loading more entries...</li>
                </Show>
                <Show when={props.canLoadMore && !props.isLoadingMore}>
                  <li class="file-browser__status">
                    Scroll or move down to load more
                  </li>
                </Show>
              </ul>
            </Show>
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

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
import { middleEllipsisForWidth } from "./middleEllipsis";
import { DEFAULT_FILE_TREE_SORT, describeFileTreeSort } from "./sort";

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

export interface FileBrowserSelectOptions {
  /** Skip selection debounce and open the preview immediately (Enter / Ctrl+M from filter). */
  readonly immediatePreview?: boolean;
  /** Request playback after the preview opens when the selected entry is a video file. */
  readonly playVideo?: boolean;
}

interface FileBrowserPaneProps {
  readonly active: boolean;
  readonly directory: {
    readonly current_directory_path: string;
    readonly parent_directory_path: string | null;
    readonly entries: readonly DirectoryEntry[];
    readonly total_entry_count: number;
  } | null;
  readonly sort: DirectoryListSort;
  readonly selectedPath: string | null;
  readonly canLoadMore: boolean;
  readonly isLoadingMore: boolean;
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
}

interface NameTooltipState {
  readonly name: string;
  readonly top: number;
  readonly left: number;
  readonly maxWidth: number;
}

function FileBrowserEntryName(props: { readonly name: string }) {
  let outer: HTMLSpanElement | undefined;
  let observer: ResizeObserver | undefined;

  const [shown, setShown] = createSignal(props.name);

  const recompute = () => {
    const el = outer;
    if (el === undefined) {
      return;
    }
    const width = el.clientWidth;
    const font = getComputedStyle(el).font;
    setShown(
      width <= 0 ? props.name : middleEllipsisForWidth(props.name, width, font),
    );
  };

  createEffect(() => {
    void props.name;
    queueMicrotask(recompute);
  });

  const setOuterRef = (el: HTMLSpanElement | undefined) => {
    observer?.disconnect();
    observer = undefined;
    outer = el;
    if (el !== undefined) {
      observer = new ResizeObserver(recompute);
      observer.observe(el);
      queueMicrotask(recompute);
    }
  };

  onCleanup(() => {
    observer?.disconnect();
  });

  const truncated = () => shown() !== props.name;

  return (
    <span class="file-browser__name" ref={setOuterRef}>
      <span
        class="file-browser__name-display"
        data-file-name-display=""
        data-truncated={truncated() ? "true" : "false"}
      >
        {shown()}
      </span>
    </span>
  );
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
        button.focus({ preventScroll: true });
        button.scrollIntoView({ block: "nearest" });
        return true;
      }
    }
  }

  const first = buttons.item(0);

  if (first !== null) {
    first.focus({ preventScroll: true });
    first.scrollIntoView({ block: "nearest" });
    return true;
  }

  return false;
}

export function FileBrowserPane(props: FileBrowserPaneProps) {
  let bodyEl: HTMLDivElement | undefined;
  let listEl: HTMLUListElement | undefined;
  const filterInputId = createUniqueId();
  const [filterText, setFilterText] = createSignal("");
  const [nameTooltip, setNameTooltip] = createSignal<NameTooltipState | null>(
    null,
  );

  const filterInputFromDom = (): HTMLInputElement | null =>
    document.getElementById(filterInputId) as HTMLInputElement | null;

  const blurFilterInput = (): void => {
    filterInputFromDom()?.blur();
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

  const filteredEntries = createMemo(() => {
    const entries = props.directory?.entries ?? [];
    const q = filterText().trim().toLowerCase();

    if (q === "") {
      return entries;
    }

    return entries.filter((entry) => entry.name.toLowerCase().includes(q));
  });

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
    const trimmed = filterText().trim();

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
    if (!props.canLoadMore || props.isLoadingMore || bodyEl === undefined) {
      return;
    }

    const remaining =
      bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight;

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
      setFilterText("");
    }

    const entries = clearFilter
      ? (props.directory?.entries ?? [])
      : filteredEntries();

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
      () => props.directory?.current_directory_path ?? null,
      (cwd, previousCwd) => {
        if (previousCwd !== undefined && cwd !== previousCwd) {
          setFilterText("");
        }
      },
    ),
  );

  createEffect(
    on(
      () =>
        props.active
          ? {
              cwd: props.directory?.current_directory_path ?? null,
              selectedPath: props.selectedPath,
              filteredCount: filteredEntries().length,
            }
          : null,
      (state) => {
        if (state === null || state.cwd === null) {
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
      () => ({
        loaded: loadedEntryCount(),
        total: totalEntryCount(),
        selectedPath: props.selectedPath,
        filterText: filterText(),
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!props.active) {
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
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

      const key = event.key.toLowerCase();

      if (key === "h" || event.key === "ArrowLeft") {
        event.preventDefault();
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

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  const updateNameTooltipFromButton = (
    button: HTMLButtonElement,
    fullName: string,
  ) => {
    const display = button.querySelector<HTMLElement>(
      "[data-file-name-display]",
    );
    if (display?.dataset["truncated"] !== "true") {
      setNameTooltip(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    setNameTooltip({
      name: fullName,
      top: rect.bottom + 6,
      left: rect.left,
      maxWidth: Math.max(rect.width, 240),
    });
  };

  return (
    <section class="pane">
      <Portal>
        <Show when={nameTooltip()}>
          {(tip) => {
            const t = tip();
            return (
              <div
                class="file-browser__name-tooltip"
                role="tooltip"
                style={{
                  position: "fixed",
                  top: `${t.top}px`,
                  left: `${t.left}px`,
                  "max-width": `min(90vw, ${t.maxWidth}px)`,
                }}
              >
                {t.name}
              </div>
            );
          }}
        </Show>
      </Portal>
      <header class="pane__header">
        <span class="pane__title">File View</span>
        <span>
          {filterSummary()} | {sortSummary()}
        </span>
      </header>
      <div
        class="pane__body file-browser"
        ref={(element) => {
          bodyEl = element ?? undefined;
        }}
        onScroll={() => {
          requestMoreEntriesIfNeeded();
        }}
      >
        <div
          class={`file-browser__path${
            props.directory !== null &&
            props.selectedPath === props.directory.current_directory_path
              ? " file-browser__path--selected"
              : ""
          }`}
        >
          {props.directory?.current_directory_path ?? "Loading directory..."}
        </div>
        <div class="file-browser__filter-row">
          <label class="file-browser__filter-label" for={filterInputId}>
            Filter
          </label>
          <input
            id={filterInputId}
            class="file-browser__filter"
            type="text"
            role="searchbox"
            inputMode="search"
            placeholder="Filter by name..."
            title="Focus filter: /   First row: Enter or Ctrl+M   Clear filter & first row: Esc   Sort: a/A name, e/E extension, m/M mtime, s/S size"
            autocomplete="off"
            spellcheck={false}
            value={filterText()}
            onInput={(event) => {
              setFilterText(event.currentTarget.value);
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
        <Show
          when={totalEntryCount() > 0}
          fallback={
            <div class="empty">
              No entries in this directory. Use <code>h</code> to move up.
            </div>
          }
        >
          <Show
            when={filteredEntries().length > 0}
            fallback={
              <div class="empty">
                No file or folder names match this filter. Use <code>h</code> to
                move up.
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
                {(entry) => (
                  <li>
                    <button
                      type="button"
                      data-path={entry.path}
                      class={`file-browser__button${
                        entry.is_directory
                          ? " file-browser__button--dir"
                          : " file-browser__button--file"
                      }${
                        props.selectedPath === entry.path
                          ? " file-browser__button--active"
                          : ""
                      }`}
                      aria-label={entry.name}
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
                      onFocusIn={(event) => {
                        updateNameTooltipFromButton(
                          event.currentTarget,
                          entry.name,
                        );
                      }}
                      onFocusOut={() => {
                        setNameTooltip(null);
                      }}
                    >
                      <span class="file-browser__icon" aria-hidden="true">
                        {entry.is_directory ? <FolderGlyph /> : <FileGlyph />}
                      </span>
                      <FileBrowserEntryName name={entry.name} />
                    </button>
                  </li>
                )}
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
    </section>
  );
}

import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
} from "solid-js";
import { Portal } from "solid-js/web";
import { isEditableKeyboardTarget } from "../../lib/keyboard";
import type { DirectoryEntry, DirectorySnapshot } from "../../lib/tauri/document";
import { middleEllipsisForWidth } from "./middleEllipsis";

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

interface FileBrowserPaneProps {
  readonly active: boolean;
  readonly directory: DirectorySnapshot | null;
  readonly selectedPath: string | null;
  readonly onSelectEntry: (entry: DirectoryEntry) => void;
  readonly onConfirmEntry: (entry: DirectoryEntry) => void;
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
      width <= 0
        ? props.name
        : middleEllipsisForWidth(props.name, width, font),
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

function focusListButtonForPath(
  list: HTMLUListElement | undefined,
  selectedPath: string | null,
) {
  if (list === undefined) {
    return;
  }

  const buttons = list.querySelectorAll<HTMLButtonElement>(
    ".file-browser__button",
  );

  if (selectedPath !== null) {
    for (const button of buttons) {
      if (button.dataset["path"] === selectedPath) {
        button.focus();
        return;
      }
    }
  }

  buttons.item(0)?.focus();
}

export function FileBrowserPane(props: FileBrowserPaneProps) {
  let filterInputEl: HTMLInputElement | undefined;
  let listEl: HTMLUListElement | undefined;
  const [filterText, setFilterText] = createSignal("");
  const [nameTooltip, setNameTooltip] = createSignal<NameTooltipState | null>(
    null,
  );

  const filteredEntries = createMemo(() => {
    const dir = props.directory;

    if (dir === null) {
      return [];
    }

    const q = filterText().trim().toLowerCase();

    if (q === "") {
      return dir.entries;
    }

    return dir.entries.filter((entry) =>
      entry.name.toLowerCase().includes(q),
    );
  });

  const totalEntryCount = createMemo(
    () => props.directory?.entries.length ?? 0,
  );

  const filterSummary = createMemo(() => {
    const total = totalEntryCount();
    const shown = filteredEntries().length;
    const trimmed = filterText().trim();

    if (total === 0) {
      return "0 entries";
    }

    if (trimmed === "") {
      return `${total} ${total === 1 ? "entry" : "entries"}`;
    }

    return `${shown} of ${total} ${total === 1 ? "entry" : "entries"}`;
  });

  const focusFirstListButton = (entries: readonly DirectoryEntry[]) => {
    const first = entries[0];

    if (first !== undefined) {
      props.onSelectEntry(first);
    }

    queueMicrotask(() => {
      requestAnimationFrame(() => {
        listEl
          ?.querySelector<HTMLButtonElement>(".file-browser__button")
          ?.focus();
      });
    });
  };

  const leaveFilterForList = (clearFilter: boolean) => {
    if (clearFilter) {
      setFilterText("");
    }

    filterInputEl?.blur();

    const entries = clearFilter
      ? (props.directory?.entries ?? [])
      : filteredEntries();

    if (entries.length === 0) {
      return;
    }

    focusFirstListButton(entries);
  };

  createEffect(
    on(
      () =>
        props.active ? props.directory?.current_directory_path ?? null : null,
      (cwd) => {
        if (cwd === null) {
          return;
        }

        const path = props.selectedPath;
        queueMicrotask(() => {
          requestAnimationFrame(() => {
            focusListButtonForPath(listEl, path);
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

      if (event.key === "/") {
        event.preventDefault();
        filterInputEl?.focus();
        filterInputEl?.select();
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

      const moveSelection = (nextIndex: number) => {
        const nextEntry = entries[nextIndex];

        if (nextEntry !== undefined) {
          event.preventDefault();
          props.onSelectEntry(nextEntry);
        }
      };

      const key = event.key.toLowerCase();

      if (key === "j" || event.key === "ArrowDown") {
        moveSelection(
          selectedIndex === -1
            ? 0
            : Math.min(entries.length - 1, currentIndex + 1),
        );
        return;
      }

      if (key === "k" || event.key === "ArrowUp") {
        moveSelection(
          selectedIndex === -1 ? 0 : Math.max(0, currentIndex - 1),
        );
        return;
      }

      if (key === "h" || event.key === "ArrowLeft") {
        event.preventDefault();
        props.onNavigateToParent();
        return;
      }

      if (
        key === "l" ||
        event.key === "ArrowRight" ||
        event.key === "Enter" ||
        (event.ctrlKey && key === "m")
      ) {
        const selectedEntry = entries[currentIndex];

        if (selectedEntry !== undefined) {
          event.preventDefault();
          props.onConfirmEntry(selectedEntry);
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
        <span>{filterSummary()}</span>
      </header>
      <div class="pane__body file-browser">
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
          <label class="file-browser__filter-label" for="file-browser-filter">
            Filter
          </label>
          <input
            ref={(element) => {
              filterInputEl = element;
            }}
            id="file-browser-filter"
            class="file-browser__filter"
            type="search"
            placeholder="Filter by name..."
            title="Focus filter: /   First row: Ctrl+M   Clear filter & first row: Esc"
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

              if (event.ctrlKey && event.key.toLowerCase() === "m") {
                event.preventDefault();
                event.stopPropagation();
                leaveFilterForList(false);
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
                No file or folder names match this filter.
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
                      onClick={() => props.onSelectEntry(entry)}
                      onDblClick={() => props.onConfirmEntry(entry)}
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
            </ul>
          </Show>
        </Show>
      </div>
    </section>
  );
}

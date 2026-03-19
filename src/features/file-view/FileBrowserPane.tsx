import { For, Show, onCleanup, onMount } from "solid-js";
import type { DirectoryEntry, DirectorySnapshot } from "../../lib/tauri/document";

interface FileBrowserPaneProps {
  readonly active: boolean;
  readonly directory: DirectorySnapshot | null;
  readonly selectedPath: string | null;
  readonly onSelectEntry: (entry: DirectoryEntry) => void;
  readonly onConfirmEntry: (entry: DirectoryEntry) => void;
  readonly onNavigateToParent: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function FileBrowserPane(props: FileBrowserPaneProps) {
  onMount(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!props.active || isEditableTarget(event.target)) {
        return;
      }

      const entries = props.directory?.entries ?? [];

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

  return (
    <section class="pane">
      <header class="pane__header">
        <span class="pane__title">File View</span>
        <span>{props.directory?.entries.length ?? 0} entries</span>
      </header>
      <div class="pane__body file-browser">
        <div class="file-browser__path">
          {props.directory?.current_directory_path ?? "Loading directory..."}
        </div>
        <Show
          when={(props.directory?.entries.length ?? 0) > 0}
          fallback={
            <div class="empty">
              No entries in this directory. Use <code>h</code> to move up.
            </div>
          }
        >
          <ul class="file-browser__list">
            <For each={props.directory?.entries ?? []}>
              {(entry) => (
                <li>
                  <button
                    class={`file-browser__button${
                      props.selectedPath === entry.path
                        ? " file-browser__button--active"
                        : ""
                    }`}
                    type="button"
                    onClick={() => props.onSelectEntry(entry)}
                    onDblClick={() => props.onConfirmEntry(entry)}
                  >
                    <span class="file-browser__kind">
                      {entry.is_directory ? "dir" : "file"}
                    </span>
                    <span class="file-browser__name">{entry.name}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </section>
  );
}

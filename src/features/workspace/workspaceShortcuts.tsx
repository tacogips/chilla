import { For, Show } from "solid-js";

export type ShortcutDefinition = {
  readonly keys: readonly string[];
  readonly description: string;
};

export const SHORTCUT_LABELS = {
  openFiles: "Ctrl+O / Cmd+O",
  copyPath: "Y",
  reload: "R",
  toggleToc: "Shift+T",
  toggleMarkdownPane: "Shift+P",
  rawView: "1",
  secondaryView: "2",
  toggleTheme: "Shift+S",
  toggleFileTree: "Shift+L",
} as const;

export const SHORTCUT_SECTIONS: readonly {
  readonly title: string;
  readonly shortcuts: readonly ShortcutDefinition[];
}[] = [
  {
    title: "Workspace",
    shortcuts: [
      { keys: ["?"], description: "Show this help" },
      { keys: ["Esc"], description: "Close help" },
      { keys: ["Q"], description: "Quit application" },
      {
        keys: ["Ctrl", "O"],
        description: "Open one or more files (also Cmd+O on macOS)",
      },
      {
        keys: ["Ctrl", "D"],
        description:
          "Scroll the active document down, or advance one EPUB page",
      },
      {
        keys: ["Ctrl", "U"],
        description: "Scroll the active document up, or go back one EPUB page",
      },
      {
        keys: ["J"],
        description:
          "When the file tree is hidden, move forward in the active document; paginated EPUB moves one page and media seeks 5 seconds",
      },
      {
        keys: ["K"],
        description:
          "When the file tree is hidden, move backward in the active document; paginated EPUB moves one page and media seeks 5 seconds",
      },
      {
        keys: ["↓"],
        description:
          "Move forward in the active document when the file tree is hidden; paginated EPUB advances one page",
      },
      {
        keys: ["↑"],
        description:
          "Move backward in the active document when the file tree is hidden; paginated EPUB goes back one page",
      },
      {
        keys: ["Shift", "L"],
        description: "Toggle file tree",
      },
      {
        keys: ["G"],
        description: "Toggle local Git diff for the opened repository",
      },
      {
        keys: ["Y"],
        description: "Copy selected file or directory absolute path",
      },
      { keys: ["R"], description: "Refresh workspace and current file" },
      {
        keys: ["Shift", "T"],
        description: "Toggle table of contents (Markdown / EPUB)",
      },
      {
        keys: ["Shift", "P"],
        description: "Toggle Raw / Preview (Markdown) or Raw / Formatted (CSV)",
      },
      {
        keys: ["1"],
        description: "Select Raw view (Markdown / CSV)",
      },
      {
        keys: ["2"],
        description: "Select Preview view (Markdown) or Formatted view (CSV)",
      },
      {
        keys: ["Shift", "S"],
        description: "Toggle light / dark theme",
      },
      {
        keys: ["Ctrl", "S"],
        description: "Save Markdown document (also Cmd+S on macOS)",
      },
    ],
  },
  {
    title: "File tree",
    shortcuts: [
      { keys: ["/"], description: "Focus filter" },
      {
        keys: ["Esc"],
        description: "Clear filter and return to list (when filter focused)",
      },
      {
        keys: ["Enter"],
        description:
          "First filtered row when filter is focused (same as Ctrl+M); preview loads immediately (no debounce)",
      },
      {
        keys: ["Ctrl", "M"],
        description: "Same as Enter when the filter field is focused",
      },
      {
        keys: ["J", "↓"],
        description: "Move selection down",
      },
      {
        keys: ["K", "↑"],
        description: "Move selection up",
      },
      {
        keys: ["0"],
        description: "Reset sort to default (name ascending)",
      },
      {
        keys: ["a", "A"],
        description: "Sort by name ascending / descending",
      },
      {
        keys: ["e", "E"],
        description: "Sort by extension ascending / descending",
      },
      {
        keys: ["m", "M"],
        description: "Sort by modified time ascending / descending",
      },
      {
        keys: ["s", "S"],
        description: "Sort by size ascending / descending",
      },
      {
        keys: ["H", "←"],
        description: "Parent directory",
      },
      {
        keys: ["L", "→", "Enter"],
        description: "Open or confirm",
      },
    ],
  },
  {
    title: "Media preview (file open)",
    shortcuts: [
      {
        keys: ["Space"],
        description:
          "Play / pause (macOS/Windows when focus is outside the player), or open in default player (Linux)",
      },
      {
        keys: ["J", "K"],
        description:
          "When the file tree is hidden, seek forward / back 5 seconds",
      },
      {
        keys: ["Ctrl", "D"],
        description: "Seek forward 15 seconds",
      },
      {
        keys: ["Ctrl", "U"],
        description: "Seek back 15 seconds",
      },
    ],
  },
];

export function renderShortcutKeys(keys: readonly string[]) {
  return (
    <>
      <For each={keys}>
        {(key, index) => (
          <>
            <Show when={index() > 0}>
              <span class="shortcuts-help__plus">
                {key.length === 1 || key === "Enter" ? "/" : "+"}
              </span>
            </Show>
            <kbd>{key}</kbd>
          </>
        )}
      </For>
    </>
  );
}

export function ShortcutSectionList() {
  return (
    <For each={SHORTCUT_SECTIONS}>
      {(section) => (
        <section class="shortcuts-help__section">
          <h3 class="shortcuts-help__heading">{section.title}</h3>
          <ul class="shortcuts-help__list">
            <For each={section.shortcuts}>
              {(shortcut) => (
                <li class="shortcuts-help__row">
                  <span class="shortcuts-help__keys">
                    {renderShortcutKeys(shortcut.keys)}
                  </span>
                  <span class="shortcuts-help__desc">
                    {shortcut.description}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </section>
      )}
    </For>
  );
}

export function ShortcutsHelpDialog(props: { readonly open: boolean }) {
  return (
    <Show when={props.open}>
      <div class="shortcuts-help-layer">
        <div
          class="shortcuts-help-backdrop"
          role="presentation"
          aria-hidden="true"
        />
        <div
          class="shortcuts-help"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-help-title"
          tabIndex={-1}
          ref={(element) => {
            queueMicrotask(() => {
              element?.focus();
            });
          }}
        >
          <h2 id="shortcuts-help-title" class="shortcuts-help__title">
            Keyboard shortcuts
          </h2>

          <ShortcutSectionList />

          <p class="shortcuts-help__footer">
            Shortcuts are ignored while typing in a search field.
          </p>
        </div>
      </div>
    </Show>
  );
}

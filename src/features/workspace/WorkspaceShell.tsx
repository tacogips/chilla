import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ParentProps } from "solid-js";
import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  startTransition,
} from "solid-js";
import { Portal } from "solid-js/web";
import type {
  DirectoryEntry,
  DirectoryListSort,
  DocumentSnapshot,
  FilePreview,
  HeadingNode,
  StartupContext,
} from "../../lib/tauri/document";
import {
  applyColorScheme,
  getColorScheme,
  type ColorScheme,
} from "../../lib/theme";
import { writeTextToClipboard } from "../../lib/clipboard";
import { isEditableKeyboardTarget } from "../../lib/keyboard";
import {
  getStartupContext,
  isMarkdownPath,
  listenDocumentRefreshed,
  listDirectory,
  openDocument,
  openFilePreview,
  reloadDocument,
  stopDocumentWatch,
} from "../../lib/tauri/document";
import { FileBrowserPane } from "../file-view/FileBrowserPane";
import type { FileBrowserSelectOptions } from "../file-view/FileBrowserPane";
import { DEFAULT_FILE_TREE_SORT, DIRECTORY_PAGE_SIZE } from "../file-view/sort";
import { PreviewPane } from "../preview/PreviewPane";
import { PdfFilePreviewPane } from "../preview/PdfFilePreviewPane";
import { VideoFilePreviewPane } from "../preview/VideoFilePreviewPane";
import { TocPane } from "../toc/TocPane";
import type { WorkspaceSelection } from "./state";

const EMPTY_STATE_IMAGE_PATH = "/empty-state-cat.png";

function resolveCurrentWindow() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

/** Delay before opening a file from keyboard selection alone (j-k); confirm opens immediately. */
const SELECTION_PREVIEW_DEBOUNCE_MS = 500;
/** Binary / media previews: shorter wait while keeping debounce for text and Markdown. */
const SELECTION_PREVIEW_DEBOUNCE_FAST_MS = 120;

function selectionPreviewDebounceMsForPath(filePath: string): number {
  if (/\.(pdf|png|apng|jpe?g|gif|webp)$/i.test(filePath)) {
    return SELECTION_PREVIEW_DEBOUNCE_FAST_MS;
  }

  if (/\.(mp4|m4v|mov|webm|ogv)$/i.test(filePath)) {
    return SELECTION_PREVIEW_DEBOUNCE_FAST_MS;
  }

  return SELECTION_PREVIEW_DEBOUNCE_MS;
}

function isVideoPath(filePath: string): boolean {
  return /\.(mp4|m4v|mov|webm|ogv)$/i.test(filePath);
}

type MarkdownPane = "raw" | "preview";
type ShortcutDefinition = {
  readonly keys: readonly string[];
  readonly description: string;
};

const SHORTCUT_LABELS = {
  copyPath: "Y",
  reload: "R",
  toggleToc: "Shift+T",
  toggleMarkdownPane: "Shift+P",
  toggleTheme: "Shift+S",
  toggleFileTree: "Shift+L",
} as const;

const SHORTCUT_SECTIONS: readonly {
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
        keys: ["Ctrl", "D"],
        description: "Scroll document down",
      },
      {
        keys: ["Ctrl", "U"],
        description: "Scroll document up",
      },
      {
        keys: ["J", "↓"],
        description:
          "Scroll the active file view down one line when the file tree is hidden",
      },
      {
        keys: ["K", "↑"],
        description:
          "Scroll the active file view up one line when the file tree is hidden",
      },
      {
        keys: ["Shift", "L"],
        description: "Toggle file tree",
      },
      {
        keys: ["Y"],
        description: "Copy selected file or directory absolute path",
      },
      { keys: ["R"], description: "Reload current file" },
      {
        keys: ["Shift", "T"],
        description: "Toggle table of contents (Markdown)",
      },
      {
        keys: ["Shift", "P"],
        description: "Toggle Raw / Preview (Markdown)",
      },
      {
        keys: ["Shift", "S"],
        description: "Toggle light / dark theme",
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
    title: "Video preview (file open)",
    shortcuts: [
      {
        keys: ["Space"],
        description:
          "Play / pause (macOS/Windows when focus is outside the player), or open in default player (Linux)",
      },
    ],
  },
];

function SunGlyph() {
  return (
    <svg class="workspace__theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="4"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="2"
        d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M6.35 17.65l-1.41 1.41M19.07 4.93l-1.41 1.41"
      />
    </svg>
  );
}

function MoonGlyph() {
  return (
    <svg class="workspace__theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
      />
    </svg>
  );
}

function WorkspaceHeaderIcon(props: ParentProps<{ readonly class?: string }>) {
  return (
    <svg
      class={props.class ?? "workspace__header-action-icon"}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

function RawSourceGlyph() {
  return (
    <WorkspaceHeaderIcon>
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M16 18l6-6-6-6M8 6l-6 6 6 6"
      />
    </WorkspaceHeaderIcon>
  );
}

function PreviewGlyph() {
  return (
    <WorkspaceHeaderIcon>
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
    </WorkspaceHeaderIcon>
  );
}

function TocGlyph() {
  return (
    <WorkspaceHeaderIcon>
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
      />
    </WorkspaceHeaderIcon>
  );
}

function ReloadGlyph() {
  return (
    <WorkspaceHeaderIcon>
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"
      />
    </WorkspaceHeaderIcon>
  );
}

function MinimizeWindowGlyph() {
  return (
    <WorkspaceHeaderIcon>
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="2"
        d="M5 12h14"
      />
    </WorkspaceHeaderIcon>
  );
}

function MaximizeWindowGlyph() {
  return (
    <WorkspaceHeaderIcon>
      <rect
        x="5"
        y="5"
        width="14"
        height="14"
        rx="2"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
    </WorkspaceHeaderIcon>
  );
}

function CloseWindowGlyph() {
  return (
    <WorkspaceHeaderIcon>
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M18 6L6 18M6 6l12 12"
      />
    </WorkspaceHeaderIcon>
  );
}

function getActiveDocumentScrollBody(): HTMLElement | null {
  const column = document.querySelector(".workspace__document-column");

  if (column === null) {
    return null;
  }

  const pane = column.querySelector(".pane:not(.pane--hidden)");

  if (pane === null) {
    return null;
  }

  return pane.querySelector<HTMLElement>(".pane__body");
}

function scrollActiveDocumentPane(direction: 1 | -1): void {
  const body = getActiveDocumentScrollBody();

  if (body === null) {
    return;
  }

  const delta = Math.max(80, Math.floor(body.clientHeight * 0.45)) * direction;
  body.scrollTop += delta;
}

function nudgeActiveDocumentPane(direction: 1 | -1): void {
  const body = getActiveDocumentScrollBody();

  if (body === null) {
    return;
  }

  const computedStyle = getComputedStyle(body);
  const lineHeight = Number.parseFloat(computedStyle.lineHeight);
  const delta =
    (Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 24) *
    direction;
  body.scrollTop += delta;
}

function previewPath(preview: FilePreview | null): string | null {
  return preview?.path ?? null;
}

function previewHtml(preview: FilePreview | null): string {
  return (
    preview?.html ??
    '<section class="file-preview-empty"><p class="file-preview-empty__title">No file selected</p><p class="file-preview-empty__hint">Pick a file in the file tree to open it here.</p></section>'
  );
}

interface LoadedDirectoryState {
  readonly current_directory_path: string;
  readonly parent_directory_path: string | null;
  readonly entries: readonly DirectoryEntry[];
  readonly total_entry_count: number;
  readonly next_offset: number;
  readonly sort: DirectoryListSort;
  readonly query: string;
}

function defaultFocusedEntryPath(
  entries: readonly DirectoryEntry[],
): string | null {
  const preferred = entries.find((entry) => !entry.is_directory) ?? entries[0];
  return preferred?.path ?? null;
}

function resolveSelectedPath(
  currentDirectoryPath: string,
  entries: readonly DirectoryEntry[],
  requestedPath: string | null,
): string | null {
  if (requestedPath === null || requestedPath === currentDirectoryPath) {
    return defaultFocusedEntryPath(entries);
  }

  const matched = entries.find(
    (entry) =>
      entry.path === requestedPath || entry.canonical_path === requestedPath,
  );

  return matched?.path ?? defaultFocusedEntryPath(entries);
}

function renderShortcutKeys(keys: readonly string[]) {
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

function hasExactModifiers(
  event: KeyboardEvent,
  modifiers: {
    readonly ctrl?: boolean;
    readonly meta?: boolean;
    readonly alt?: boolean;
    readonly shift?: boolean;
  },
) {
  return (
    event.ctrlKey === (modifiers.ctrl ?? false) &&
    event.metaKey === (modifiers.meta ?? false) &&
    event.altKey === (modifiers.alt ?? false) &&
    event.shiftKey === (modifiers.shift ?? false)
  );
}

function matchesShortcut(
  event: KeyboardEvent,
  key: string,
  modifiers: {
    readonly ctrl?: boolean;
    readonly meta?: boolean;
    readonly alt?: boolean;
    readonly shift?: boolean;
  } = {},
) {
  return event.key.toLowerCase() === key && hasExactModifiers(event, modifiers);
}

export function WorkspaceShell() {
  const appWindow = resolveCurrentWindow();
  let directoryRequestId = 0;
  let previewRequestId = 0;
  let selectionPreviewDebounceTimer: number | undefined;
  const [startupContext, setStartupContext] =
    createSignal<StartupContext | null>(null);
  const [directoryState, setDirectoryState] =
    createSignal<LoadedDirectoryState | null>(null);
  const [directorySort, setDirectorySort] = createSignal<DirectoryListSort>(
    DEFAULT_FILE_TREE_SORT,
  );
  const [directoryQuery, setDirectoryQuery] = createSignal("");
  const [selectedBrowserPath, setSelectedBrowserPath] = createSignal<
    string | null
  >(null);
  const [isLoadingMoreDirectoryEntries, setLoadingMoreDirectoryEntries] =
    createSignal(false);
  const [filePreview, setFilePreview] = createSignal<FilePreview | null>(null);
  const [videoAutoplayRequestId, setVideoAutoplayRequestId] = createSignal(0);
  const [markdownDoc, setMarkdownDoc] = createSignal<DocumentSnapshot | null>(
    null,
  );
  const [markdownPane, setMarkdownPane] = createSignal<MarkdownPane>("preview");
  const [isTocOpen, setTocOpen] = createSignal(false);
  const [isFileTreeOpen, setFileTreeOpen] = createSignal(true);
  const [isShortcutsHelpOpen, setShortcutsHelpOpen] = createSignal(false);
  const [selection, setSelection] = createSignal<WorkspaceSelection>({
    anchorId: null,
    lineStart: null,
  });
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [isLoading, setLoading] = createSignal(true);
  const [colorScheme, setColorScheme] =
    createSignal<ColorScheme>(getColorScheme());

  const applyDirectoryState = (
    nextState: LoadedDirectoryState,
    requestedSelectedPath: string | null,
  ) => {
    startTransition(() => {
      setDirectoryState(nextState);
      setSelectedBrowserPath(
        resolveSelectedPath(
          nextState.current_directory_path,
          nextState.entries,
          requestedSelectedPath,
        ),
      );
      setErrorMessage(null);
    });
  };

  const clearDocumentArea = () => {
    previewRequestId += 1;
    setFilePreview(null);
    setMarkdownDoc(null);
  };

  const clearSelectionPreviewDebounce = () => {
    if (selectionPreviewDebounceTimer !== undefined) {
      clearTimeout(selectionPreviewDebounceTimer);
      selectionPreviewDebounceTimer = undefined;
    }
  };

  const loadDirectoryState = async (
    path: string,
    selectedPath: string | null,
    sort: DirectoryListSort = directorySort(),
    query: string = directoryQuery(),
  ) => {
    clearSelectionPreviewDebounce();
    const requestId = ++directoryRequestId;
    setLoadingMoreDirectoryEntries(false);

    let nextPage = await listDirectory(
      path,
      sort,
      query,
      0,
      DIRECTORY_PAGE_SIZE,
    );

    if (requestId !== directoryRequestId) {
      return;
    }

    let nextState: LoadedDirectoryState = {
      current_directory_path: nextPage.current_directory_path,
      parent_directory_path: nextPage.parent_directory_path,
      entries: nextPage.entries,
      total_entry_count: nextPage.total_entry_count,
      next_offset: nextPage.offset + nextPage.entries.length,
      sort,
      query,
    };

    while (
      selectedPath !== null &&
      selectedPath !== nextState.current_directory_path &&
      !nextState.entries.some(
        (entry) =>
          entry.path === selectedPath || entry.canonical_path === selectedPath,
      ) &&
      nextPage.has_more
    ) {
      nextPage = await listDirectory(
        path,
        sort,
        query,
        nextState.next_offset,
        DIRECTORY_PAGE_SIZE,
      );

      if (requestId !== directoryRequestId) {
        return;
      }

      nextState = {
        current_directory_path: nextPage.current_directory_path,
        parent_directory_path: nextPage.parent_directory_path,
        entries: [...nextState.entries, ...nextPage.entries],
        total_entry_count: nextPage.total_entry_count,
        next_offset: nextPage.offset + nextPage.entries.length,
        sort,
        query,
      };
    }

    if (requestId !== directoryRequestId) {
      return;
    }

    applyDirectoryState(nextState, selectedPath);
  };

  const loadMoreDirectoryEntries = async () => {
    const currentDirectory = directoryState();

    if (
      currentDirectory === null ||
      isLoadingMoreDirectoryEntries() ||
      currentDirectory.entries.length >= currentDirectory.total_entry_count
    ) {
      return;
    }

    setLoadingMoreDirectoryEntries(true);
    const requestId = directoryRequestId;

    try {
      const nextPage = await listDirectory(
        currentDirectory.current_directory_path,
        currentDirectory.sort,
        currentDirectory.query,
        currentDirectory.next_offset,
        DIRECTORY_PAGE_SIZE,
      );

      if (requestId !== directoryRequestId) {
        return;
      }

      startTransition(() => {
        setDirectoryState((previous) => {
          if (
            previous === null ||
            previous.current_directory_path !==
              nextPage.current_directory_path ||
            previous.sort.field !== currentDirectory.sort.field ||
            previous.sort.direction !== currentDirectory.sort.direction
          ) {
            return previous;
          }

          const dedupedEntries = [
            ...previous.entries,
            ...nextPage.entries.filter(
              (entry) =>
                !previous.entries.some(
                  (existing) => existing.path === entry.path,
                ),
            ),
          ];

          return {
            current_directory_path: nextPage.current_directory_path,
            parent_directory_path: nextPage.parent_directory_path,
            entries: dedupedEntries,
            total_entry_count: nextPage.total_entry_count,
            next_offset: nextPage.offset + nextPage.entries.length,
            sort: previous.sort,
            query: previous.query,
          };
        });
      });
    } finally {
      if (requestId === directoryRequestId) {
        setLoadingMoreDirectoryEntries(false);
      }
    }
  };

  const previewSelectedFile = async (path: string) => {
    const requestId = ++previewRequestId;

    try {
      if (isMarkdownPath(path)) {
        const doc = await openDocument(path);

        if (requestId !== previewRequestId) {
          return;
        }

        startTransition(() => {
          setMarkdownDoc(doc);
          setFilePreview(null);
          setMarkdownPane("preview");
          setErrorMessage(null);
        });
      } else {
        try {
          await stopDocumentWatch();
        } catch {
          // Not running under Tauri or watcher already idle
        }

        const nextPreview = await openFilePreview(path);

        if (requestId !== previewRequestId) {
          return;
        }

        startTransition(() => {
          setMarkdownDoc(null);
          setFilePreview(nextPreview);
          setErrorMessage(null);
        });
      }
    } catch (error: unknown) {
      if (requestId !== previewRequestId) {
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Failed to open file",
      );
    }
  };

  const scheduleSelectionPreviewFromTree = (path: string) => {
    clearSelectionPreviewDebounce();
    selectionPreviewDebounceTimer = window.setTimeout(() => {
      selectionPreviewDebounceTimer = undefined;
      if (selectedBrowserPath() !== path) {
        return;
      }

      void previewSelectedFile(path);
    }, selectionPreviewDebounceMsForPath(path));
  };

  const refreshSyntaxHighlights = async () => {
    const doc = markdownDoc();

    if (doc !== null) {
      try {
        const nextSnapshot = await reloadDocument(doc.path);
        setMarkdownDoc(nextSnapshot);
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to refresh markdown preview",
        );
      }

      return;
    }

    const path = previewPath(filePreview());

    if (path !== null) {
      clearSelectionPreviewDebounce();
      await previewSelectedFile(path);
    }
  };

  const cycleColorScheme = async () => {
    const next = colorScheme() === "dark" ? "light" : "dark";
    await applyColorScheme(next);
    setColorScheme(next);
    await refreshSyntaxHighlights();
  };

  const stopWatchingCurrentDocument = () => {
    void stopDocumentWatch().catch(() => {
      // Not running under Tauri or watcher already idle
    });
  };

  const handleInitialLoad = async () => {
    setLoading(true);
    setDirectoryQuery("");

    try {
      const nextStartupContext = await getStartupContext();
      setStartupContext(nextStartupContext);
      setFileTreeOpen(nextStartupContext.selected_file_path === null);

      await loadDirectoryState(
        nextStartupContext.current_directory_path,
        nextStartupContext.selected_file_path,
      );

      if (nextStartupContext.selected_file_path !== null) {
        await previewSelectedFile(nextStartupContext.selected_file_path);
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load workspace",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReloadCurrent = async () => {
    const doc = markdownDoc();

    if (doc !== null) {
      try {
        const nextSnapshot = await reloadDocument(doc.path);
        setMarkdownDoc(nextSnapshot);
        setErrorMessage(null);
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to reload file",
        );
      }

      return;
    }

    const path = previewPath(filePreview());

    if (path !== null) {
      clearSelectionPreviewDebounce();
      await previewSelectedFile(path);
    }
  };

  const currentSelectedPath = () => selectedBrowserPath() ?? currentOpenPath();

  const handleCopyCurrentPath = async () => {
    const path = currentSelectedPath();

    if (path === null) {
      return;
    }

    try {
      await writeTextToClipboard(path);
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to copy the selected path",
      );
    }
  };

  const handleChangeDirectorySort = async (nextSort: DirectoryListSort) => {
    const currentDirectory = directoryState();

    if (
      currentDirectory === null ||
      (currentDirectory.sort.field === nextSort.field &&
        currentDirectory.sort.direction === nextSort.direction)
    ) {
      return;
    }

    setDirectorySort(nextSort);

    try {
      await loadDirectoryState(
        currentDirectory.current_directory_path,
        selectedBrowserPath(),
        nextSort,
        directoryQuery(),
      );
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to resort directory entries",
      );
    }
  };

  const handleSelectEntry = (
    entry: DirectoryEntry,
    options?: FileBrowserSelectOptions,
  ) => {
    setSelectedBrowserPath(entry.path);

    if (entry.is_directory) {
      clearSelectionPreviewDebounce();
      stopWatchingCurrentDocument();
      clearDocumentArea();
      return;
    }

    if (options?.immediatePreview === true) {
      clearSelectionPreviewDebounce();
      if (options.playVideo === true && isVideoPath(entry.path)) {
        setVideoAutoplayRequestId((value) => value + 1);
      }
      void previewSelectedFile(entry.path);
      return;
    }

    scheduleSelectionPreviewFromTree(entry.path);
  };

  const handleConfirmEntry = async (
    entry: DirectoryEntry,
    options?: FileBrowserSelectOptions,
  ) => {
    if (entry.is_directory) {
      try {
        stopWatchingCurrentDocument();
        clearDocumentArea();
        setDirectoryQuery("");
        await loadDirectoryState(entry.path, null, directorySort(), "");
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to open directory",
        );
      }

      return;
    }

    try {
      clearSelectionPreviewDebounce();
      setSelectedBrowserPath(entry.path);
      if (options?.playVideo === true && isVideoPath(entry.path)) {
        setVideoAutoplayRequestId((value) => value + 1);
      }
      await previewSelectedFile(entry.path);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to open file",
      );
    }
  };

  const handleNavigateToParent = async () => {
    const parentDirectory = directoryState()?.parent_directory_path;
    const currentDirectory = directoryState()?.current_directory_path;

    if (parentDirectory === null || parentDirectory === undefined) {
      return;
    }

    try {
      stopWatchingCurrentDocument();
      clearDocumentArea();
      setDirectoryQuery("");
      await loadDirectoryState(
        parentDirectory,
        currentDirectory ?? null,
        directorySort(),
        "",
      );
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to navigate to parent directory",
      );
    }
  };

  const handleHeadingSelect = (heading: HeadingNode) => {
    setMarkdownPane("preview");
    setSelection({
      anchorId: heading.anchor_id,
      lineStart: heading.line_start,
    });
  };

  const md = () => markdownDoc();
  const fp = () => filePreview();
  const currentOpenPath = () => md()?.path ?? previewPath(fp());
  const hasOpenDocument = () => md() !== null || fp() !== null;
  const canLoadMoreDirectoryEntries = createMemo(() => {
    const currentDirectory = directoryState();

    return (
      currentDirectory !== null &&
      currentDirectory.entries.length < currentDirectory.total_entry_count
    );
  });

  const handleChangeDirectoryQuery = async (nextQuery: string) => {
    const currentDirectory = directoryState();
    setDirectoryQuery(nextQuery);

    if (currentDirectory === null) {
      return;
    }

    try {
      await loadDirectoryState(
        currentDirectory.current_directory_path,
        selectedBrowserPath(),
        currentDirectory.sort,
        nextQuery,
      );
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to filter directory entries",
      );
    }
  };

  const viewerGridClassName = createMemo(() => {
    const toc = isTocOpen() && md() !== null;
    const tree = isFileTreeOpen();
    let className = "workspace__body workspace__body--viewer";

    if (toc) {
      className += " workspace__body--viewer--toc";
    }

    if (!tree) {
      className += " workspace__body--viewer--no-tree";
    }

    return className;
  });

  onMount(() => {
    let isDisposed = false;
    let disposeListener: (() => void) | undefined;

    void handleInitialLoad();

    void listenDocumentRefreshed((refreshedSnapshot) => {
      const current = markdownDoc();

      if (current !== null && current.path === refreshedSnapshot.path) {
        setMarkdownDoc(refreshedSnapshot);
      }
    })
      .then((dispose) => {
        if (isDisposed) {
          dispose();
          return;
        }

        disposeListener = dispose;
      })
      .catch((error: unknown) => {
        if (isDisposed) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to subscribe to document refresh events",
        );
      });

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (isShortcutsHelpOpen()) {
        if (event.key === "Escape") {
          event.preventDefault();
          setShortcutsHelpOpen(false);
        }
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if (matchesShortcut(event, "?", { shift: true })) {
        event.preventDefault();
        setShortcutsHelpOpen(true);
        return;
      }

      if (matchesShortcut(event, "q")) {
        event.preventDefault();
        void appWindow?.close().catch(() => {
          // Vite dev without Tauri
        });
        return;
      }

      if (matchesShortcut(event, "d", { ctrl: true })) {
        event.preventDefault();
        scrollActiveDocumentPane(1);
        return;
      }

      if (matchesShortcut(event, "u", { ctrl: true })) {
        event.preventDefault();
        scrollActiveDocumentPane(-1);
        return;
      }

      if (matchesShortcut(event, "l", { shift: true })) {
        event.preventDefault();
        setFileTreeOpen((value) => !value);
        return;
      }

      if (!isFileTreeOpen()) {
        if (matchesShortcut(event, "j") || event.key === "ArrowDown") {
          event.preventDefault();
          nudgeActiveDocumentPane(1);
          return;
        }

        if (matchesShortcut(event, "k") || event.key === "ArrowUp") {
          event.preventDefault();
          nudgeActiveDocumentPane(-1);
          return;
        }
      }

      if (matchesShortcut(event, "r")) {
        if (!hasOpenDocument()) {
          return;
        }
        event.preventDefault();
        void handleReloadCurrent();
        return;
      }

      if (matchesShortcut(event, "y")) {
        if (currentSelectedPath() === null) {
          return;
        }
        event.preventDefault();
        void handleCopyCurrentPath();
        return;
      }

      if (
        matchesShortcut(event, "t", { shift: true }) &&
        markdownDoc() !== null
      ) {
        event.preventDefault();
        setTocOpen((value) => !value);
        return;
      }

      if (
        matchesShortcut(event, "p", { shift: true }) &&
        markdownDoc() !== null
      ) {
        event.preventDefault();
        setMarkdownPane((pane) => (pane === "preview" ? "raw" : "preview"));
        return;
      }

      if (matchesShortcut(event, "s", { shift: true })) {
        event.preventDefault();
        void cycleColorScheme();
        return;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);

    onCleanup(() => {
      isDisposed = true;
      disposeListener?.();
      window.removeEventListener("keydown", handleGlobalKeyDown);
      clearSelectionPreviewDebounce();
    });
  });

  return (
    <main class="workspace">
      <Portal>
        <Show when={isShortcutsHelpOpen()}>
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

              <p class="shortcuts-help__footer">
                Shortcuts are ignored while typing in a search field.
              </p>
            </div>
          </div>
        </Show>
      </Portal>
      <div class="workspace__frame">
        <header class="workspace__header" data-tauri-drag-region="">
          <div class="workspace__actions" data-tauri-drag-region="false">
            <Show when={md() !== null}>
              <div
                class="workspace__mode-group"
                role="group"
                aria-label="Markdown view"
              >
                <button
                  class={`workspace__mode${
                    markdownPane() === "raw" ? " workspace__mode--active" : ""
                  }`}
                  type="button"
                  aria-label="Raw Markdown source"
                  title={`Raw source (${SHORTCUT_LABELS.toggleMarkdownPane})`}
                  onClick={() => setMarkdownPane("raw")}
                >
                  <RawSourceGlyph />
                </button>
                <button
                  class={`workspace__mode${
                    markdownPane() === "preview"
                      ? " workspace__mode--active"
                      : ""
                  }`}
                  type="button"
                  aria-label="Markdown preview"
                  title={`Preview (${SHORTCUT_LABELS.toggleMarkdownPane})`}
                  onClick={() => setMarkdownPane("preview")}
                >
                  <PreviewGlyph />
                </button>
              </div>
              <button
                class={`button button--ghost workspace__icon-button${
                  isTocOpen() ? " button--active" : ""
                }`}
                type="button"
                aria-label="Toggle table of contents"
                title={`Toggle TOC (${SHORTCUT_LABELS.toggleToc})`}
                onClick={() => setTocOpen((value) => !value)}
              >
                <TocGlyph />
              </button>
            </Show>

            <button
              class="button button--ghost workspace__icon-button"
              type="button"
              disabled={!hasOpenDocument()}
              aria-label="Reload current file"
              title={`Reload file (${SHORTCUT_LABELS.reload})`}
              onClick={() => void handleReloadCurrent()}
            >
              <ReloadGlyph />
            </button>

            <button
              class="workspace__theme-toggle"
              type="button"
              aria-label={
                colorScheme() === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              title={
                colorScheme() === "dark"
                  ? `Light theme (${SHORTCUT_LABELS.toggleTheme})`
                  : `Dark theme (${SHORTCUT_LABELS.toggleTheme})`
              }
              onClick={() => {
                void cycleColorScheme();
              }}
            >
              <Show when={colorScheme() === "dark"} fallback={<MoonGlyph />}>
                <SunGlyph />
              </Show>
            </button>

            <div
              class="workspace__window-controls"
              aria-label="Window controls"
            >
              <button
                class="workspace__window-button"
                type="button"
                aria-label="Minimize window"
                title="Minimize"
                onClick={() => {
                  void appWindow?.minimize();
                }}
              >
                <MinimizeWindowGlyph />
              </button>
              <button
                class="workspace__window-button"
                type="button"
                aria-label="Toggle maximize window"
                title="Maximize"
                onClick={() => {
                  void appWindow?.toggleMaximize();
                }}
              >
                <MaximizeWindowGlyph />
              </button>
              <button
                class="workspace__window-button workspace__window-button--close"
                type="button"
                aria-label="Close window"
                title="Close"
                onClick={() => {
                  void appWindow?.close();
                }}
              >
                <CloseWindowGlyph />
              </button>
            </div>
          </div>
        </header>

        <Show when={errorMessage() !== null}>
          <div class="banner banner--error">{errorMessage()}</div>
        </Show>

        <div class={viewerGridClassName()}>
          <Show when={isFileTreeOpen()}>
            <FileBrowserPane
              active={true}
              directory={directoryState()}
              sort={directorySort()}
              query={directoryQuery()}
              selectedPath={selectedBrowserPath()}
              canLoadMore={canLoadMoreDirectoryEntries()}
              isLoadingMore={isLoadingMoreDirectoryEntries()}
              onConfirmEntry={(entry, options) =>
                void handleConfirmEntry(entry, options)
              }
              onChangeSort={(nextSort) => {
                void handleChangeDirectorySort(nextSort);
              }}
              onChangeQuery={(nextQuery) => {
                void handleChangeDirectoryQuery(nextQuery);
              }}
              onLoadMore={() => {
                void loadMoreDirectoryEntries();
              }}
              onNavigateToParent={() => void handleNavigateToParent()}
              onSelectEntry={handleSelectEntry}
            />
          </Show>

          <Show when={isTocOpen() && md() !== null}>
            <TocPane
              activeAnchorId={selection().anchorId}
              headings={md()?.headings ?? []}
              visible={true}
              onSelectHeading={handleHeadingSelect}
            />
          </Show>

          <div class="workspace__document-column">
            <Show when={md() !== null && markdownPane() === "raw"}>
              <section class="pane workspace__markdown-raw-pane">
                <header class="pane__header">
                  <span class="pane__title">Markdown</span>
                  <span>Source</span>
                </header>
                <div class="pane__body markdown-raw-body">
                  <div class="markdown-raw-body__content">
                    <div
                      class="markdown-source"
                      innerHTML={md()?.source_html ?? ""}
                    />
                  </div>
                </div>
              </section>
            </Show>

            <Show when={md() !== null && markdownPane() === "preview"}>
              <PreviewPane
                colorScheme={colorScheme()}
                documentPath={md()?.path ?? null}
                html={md()?.html ?? ""}
                selectedAnchorId={selection().anchorId}
                visible={true}
              />
            </Show>

            <Show
              when={
                md() === null &&
                fp() !== null &&
                fp()!.kind !== "video" &&
                fp()!.kind !== "pdf"
              }
            >
              <PreviewPane
                colorScheme={colorScheme()}
                documentPath={previewPath(fp())}
                html={previewHtml(fp())}
                selectedAnchorId={null}
                visible={true}
              />
            </Show>

            <Show when={md() === null && fp() !== null && fp()!.kind === "pdf"}>
              <PdfFilePreviewPane
                path={fp()!.path}
                fileName={fp()!.file_name}
              />
            </Show>

            <Show
              when={md() === null && fp() !== null && fp()!.kind === "video"}
            >
              <VideoFilePreviewPane
                path={fp()!.path}
                fileName={fp()!.file_name}
                autoplayRequestId={videoAutoplayRequestId()}
              />
            </Show>

            <Show when={!hasOpenDocument()}>
              <section class="pane workspace__document-empty">
                <header class="pane__header">
                  <span class="pane__title">Viewer</span>
                  <span>No file open</span>
                </header>
                <div class="pane__body preview">
                  <div class="preview__content">
                    <section class="file-preview-empty">
                      <p class="file-preview-empty__app-name">chilla</p>
                      <p class="file-preview-empty__app-tagline">file viewer</p>
                      <img
                        class="file-preview-empty__image"
                        src={EMPTY_STATE_IMAGE_PATH}
                        alt="Pixel-art cat peeking in from the side"
                      />
                      <p class="file-preview-empty__title">
                        Please select a file.
                      </p>
                      <div class="file-preview-empty__shortcuts">
                        <For each={SHORTCUT_SECTIONS}>
                          {(section) => (
                            <section class="shortcuts-help__section">
                              <h3 class="shortcuts-help__heading">
                                {section.title}
                              </h3>
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
                      </div>
                    </section>
                  </div>
                </div>
              </section>
            </Show>
          </div>
        </div>

        <Show when={isLoading()}>
          <div class="workspace__loading" role="status" aria-live="polite">
            <div class="workspace__loading-inner">
              {startupContext()?.selected_file_path !== null
                ? "Opening the requested file..."
                : "Loading workspace..."}
            </div>
          </div>
        </Show>
      </div>
    </main>
  );
}

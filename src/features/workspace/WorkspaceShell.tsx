import { open } from "@tauri-apps/plugin-dialog";
import {
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
  DiffWorkspaceTarget,
  DocumentPresentationMode,
  DocumentSnapshot,
  FilePreview,
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
  detectGitRepository,
  isMarkdownPath,
  listenDocumentRefreshed,
  listDirectory,
  listExplicitFileSet,
  openDocument,
  openFilePreview,
  reloadDocument,
  saveDocument,
  stopDocumentWatch,
} from "../../lib/tauri/document";
import { FileBrowserPane } from "../file-view/FileBrowserPane";
import type { FileBrowserSelectOptions } from "../file-view/FileBrowserPane";
import { DEFAULT_FILE_TREE_SORT, DIRECTORY_PAGE_SIZE } from "../file-view/sort";
import { WorkspaceDocumentColumn } from "./WorkspaceDocumentColumn";
import {
  MarkdownConflictBanner,
  WorkspaceErrorBanner,
  WorkspaceLoadingOverlay,
} from "./WorkspaceFeedback";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { PrDiffWorkspace } from "../pr-diff/PrDiffWorkspace";
import { TocPane, type TocItem } from "../toc/TocPane";
import {
  canReloadMarkdownSnapshotForPresentationRefresh,
  decideMarkdownDocumentRefresh,
} from "./documentRefreshDecision";
import {
  classifyDialogSelection,
  startupContextForPickedTarget,
} from "./openFiles";
import type { WorkspaceSelection } from "./state";
import {
  hasActiveDocumentMediaElement,
  hasActiveEpubPreview,
  nudgeActiveDocumentPane,
  scrollActiveDocumentPane,
  seekActiveDocumentMediaElement,
  stepActiveEpubPage,
} from "./activeDocumentNavigation";
import { matchesShortcut } from "./workspaceKeyboard";
import {
  type LoadedDirectoryState,
  resolveSelectedPath,
} from "./workspaceDirectoryState";
import {
  isVideoPath,
  previewPath,
  selectionPreviewDebounceMsForPath,
} from "./workspacePreviewModel";
import { ShortcutsHelpDialog } from "./workspaceShortcuts";
import {
  epubNavigationToTocItems,
  markdownHeadingsToTocItems,
} from "./workspaceToc";
import { resolveCurrentWindow } from "./workspaceWindow";

type MarkdownPane = "raw" | "preview";
export function WorkspaceShell() {
  const appWindow = resolveCurrentWindow();
  let directoryRequestId = 0;
  let previewRequestId = 0;
  let selectionPreviewDebounceTimer: number | undefined;
  const [startupContext, setStartupContext] =
    createSignal<StartupContext | null>(null);
  const [activeGitDiffTarget, setActiveGitDiffTarget] =
    createSignal<DiffWorkspaceTarget | null>(null);
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
  const [markdownEditorBuffer, setMarkdownEditorBuffer] = createSignal("");
  const [markdownExternalConflict, setMarkdownExternalConflict] =
    createSignal<DocumentSnapshot | null>(null);
  const [markdownPane, setMarkdownPane] = createSignal<MarkdownPane>("preview");
  const [csvPaneMode, setCsvPaneMode] =
    createSignal<DocumentPresentationMode>("formatted");
  const [isTocOpen, setTocOpen] = createSignal(false);
  const [isFileTreeOpen, setFileTreeOpen] = createSignal(true);
  const [isShortcutsHelpOpen, setShortcutsHelpOpen] = createSignal(false);
  const [selection, setSelection] = createSignal<WorkspaceSelection>({
    anchorId: null,
    lineStart: null,
  });
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [isLoading, setLoading] = createSignal(true);
  const [colorScheme, setColorScheme] = createSignal<ColorScheme>(
    getColorScheme(),
  );

  const applyDirectoryState = (
    nextState: LoadedDirectoryState,
    requestedSelectedPath: string | null,
  ) => {
    startTransition(() => {
      setDirectoryState(nextState);
      setSelectedBrowserPath(
        resolveSelectedPath(
          nextState.listingKind,
          nextState.current_directory_path,
          nextState.entries,
          requestedSelectedPath,
        ),
      );
      setErrorMessage(null);
    });
  };

  const applyMarkdownSnapshot = (snapshot: DocumentSnapshot) => {
    setMarkdownDoc(snapshot);
    setMarkdownEditorBuffer(snapshot.source_text);
    setMarkdownExternalConflict(null);
  };

  const clearDocumentArea = () => {
    previewRequestId += 1;
    setFilePreview(null);
    setMarkdownDoc(null);
    setMarkdownEditorBuffer("");
    setMarkdownExternalConflict(null);
    setSelection({
      anchorId: null,
      lineStart: null,
    });
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
      listingKind: "directory",
      current_directory_path: nextPage.current_directory_path,
      parent_directory_path: nextPage.parent_directory_path,
      explicit_source_paths: null,
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
        listingKind: "directory",
        current_directory_path: nextPage.current_directory_path,
        parent_directory_path: nextPage.parent_directory_path,
        explicit_source_paths: null,
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

  const loadExplicitFileSetState = async (
    sourceOrderPaths: readonly string[],
    selectedPath: string | null,
    sort: DirectoryListSort = directorySort(),
    query: string = directoryQuery(),
  ) => {
    clearSelectionPreviewDebounce();
    const requestId = ++directoryRequestId;
    setLoadingMoreDirectoryEntries(false);

    const paths = [...sourceOrderPaths];

    let nextPage = await listExplicitFileSet(
      paths,
      sort,
      query,
      0,
      DIRECTORY_PAGE_SIZE,
    );

    if (requestId !== directoryRequestId) {
      return;
    }

    let nextState: LoadedDirectoryState = {
      listingKind: "explicit_file_set",
      current_directory_path: "",
      parent_directory_path: null,
      explicit_source_paths: sourceOrderPaths,
      entries: nextPage.entries,
      total_entry_count: nextPage.total_entry_count,
      next_offset: nextPage.offset + nextPage.entries.length,
      sort,
      query,
    };

    while (
      selectedPath !== null &&
      selectedPath !== "" &&
      !nextState.entries.some(
        (entry) =>
          entry.path === selectedPath || entry.canonical_path === selectedPath,
      ) &&
      nextPage.has_more
    ) {
      nextPage = await listExplicitFileSet(
        paths,
        sort,
        query,
        nextState.next_offset,
        DIRECTORY_PAGE_SIZE,
      );

      if (requestId !== directoryRequestId) {
        return;
      }

      nextState = {
        listingKind: "explicit_file_set",
        current_directory_path: "",
        parent_directory_path: null,
        explicit_source_paths: sourceOrderPaths,
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
      currentDirectory.listingKind !== "directory" ||
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
            previous.listingKind !== "directory" ||
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
            listingKind: "directory",
            current_directory_path: nextPage.current_directory_path,
            parent_directory_path: nextPage.parent_directory_path,
            explicit_source_paths: null,
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

  const loadMoreExplicitFileSetEntries = async () => {
    const current = directoryState();

    if (
      current === null ||
      current.listingKind !== "explicit_file_set" ||
      current.explicit_source_paths === null ||
      isLoadingMoreDirectoryEntries() ||
      current.entries.length >= current.total_entry_count
    ) {
      return;
    }

    setLoadingMoreDirectoryEntries(true);
    const requestId = directoryRequestId;

    try {
      const nextPage = await listExplicitFileSet(
        [...current.explicit_source_paths],
        current.sort,
        current.query,
        current.next_offset,
        DIRECTORY_PAGE_SIZE,
      );

      if (requestId !== directoryRequestId) {
        return;
      }

      startTransition(() => {
        setDirectoryState((previous) => {
          if (
            previous === null ||
            previous.listingKind !== "explicit_file_set" ||
            previous.explicit_source_paths === null ||
            previous.sort.field !== current.sort.field ||
            previous.sort.direction !== current.sort.direction
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
            listingKind: "explicit_file_set",
            current_directory_path: "",
            parent_directory_path: null,
            explicit_source_paths: previous.explicit_source_paths,
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
          applyMarkdownSnapshot(doc);
          setFilePreview(null);
          setMarkdownPane("preview");
          setSelection({
            anchorId: null,
            lineStart: null,
          });
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
          setMarkdownEditorBuffer("");
          setMarkdownExternalConflict(null);
          setFilePreview(nextPreview);
          if (nextPreview.kind === "csv") {
            setCsvPaneMode(
              nextPreview.formatted_available ? "formatted" : "raw",
            );
          }
          setSelection({
            anchorId: null,
            lineStart: null,
          });
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
      if (
        !canReloadMarkdownSnapshotForPresentationRefresh(
          doc,
          markdownEditorBuffer(),
        )
      ) {
        return;
      }
      try {
        const nextSnapshot = await reloadDocument(doc.path);
        applyMarkdownSnapshot(nextSnapshot);
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

  const handleSaveMarkdown = async () => {
    const doc = markdownDoc();

    if (doc === null) {
      return;
    }

    try {
      const nextSnapshot = await saveDocument(
        doc.path,
        markdownEditorBuffer(),
        doc.revision_token,
      );
      applyMarkdownSnapshot(nextSnapshot);
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save document",
      );
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

      const browserRoot = nextStartupContext.browser_root;

      if (browserRoot.kind === "github_pr") {
        setActiveGitDiffTarget(null);
        setFileTreeOpen(true);
        clearDocumentArea();
      } else if (browserRoot.kind === "git_diff") {
        setActiveGitDiffTarget(null);
        setFileTreeOpen(true);
        clearDocumentArea();
      } else if (browserRoot.kind === "directory") {
        setActiveGitDiffTarget(null);
        setFileTreeOpen(browserRoot.selected_file_path === null);

        await loadDirectoryState(
          browserRoot.current_directory_path,
          browserRoot.selected_file_path,
        );

        if (browserRoot.selected_file_path !== null) {
          await previewSelectedFile(browserRoot.selected_file_path);
        }
      } else {
        setActiveGitDiffTarget(null);
        setFileTreeOpen(true);

        await loadExplicitFileSetState(
          browserRoot.source_order_paths,
          browserRoot.selected_file_path,
        );

        await previewSelectedFile(browserRoot.selected_file_path);
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
        applyMarkdownSnapshot(nextSnapshot);
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

  const handleOpenFiles = async () => {
    try {
      const selection = await open({
        multiple: true,
        directory: false,
        title: "Open files",
      });
      const target = classifyDialogSelection(selection);

      if (target === null) {
        return;
      }

      setLoading(true);
      setDirectoryQuery("");
      setErrorMessage(null);
      setTocOpen(false);
      clearSelectionPreviewDebounce();
      stopWatchingCurrentDocument();
      clearDocumentArea();
      setActiveGitDiffTarget(null);
      setStartupContext(startupContextForPickedTarget(target));

      if (target.kind === "single_file") {
        setFileTreeOpen(false);
        await loadDirectoryState(
          target.directoryPath,
          target.filePath,
          directorySort(),
          "",
        );
        await previewSelectedFile(target.filePath);
      } else {
        setFileTreeOpen(true);
        await loadExplicitFileSetState(
          target.filePaths,
          target.selectedFilePath,
          directorySort(),
          "",
        );
        await previewSelectedFile(target.selectedFilePath);
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to open the selected files",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOpenGitDiff = async () => {
    const currentDirectory = directoryState();
    if (
      currentDirectory === null ||
      currentDirectory.listingKind !== "directory"
    ) {
      setErrorMessage(
        "Open a Git repository directory before switching to Git diff.",
      );
      return;
    }

    try {
      const target = await detectGitRepository(
        currentDirectory.current_directory_path,
      );
      if (target === null) {
        setErrorMessage("This directory is not inside a Git repository.");
        return;
      }

      stopWatchingCurrentDocument();
      clearSelectionPreviewDebounce();
      clearDocumentArea();
      setFileTreeOpen(true);
      setActiveGitDiffTarget({
        kind: "git",
        target,
      });
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to open Git diff",
      );
    }
  };

  const handleCloseGitDiff = () => {
    setActiveGitDiffTarget(null);
  };

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
      if (currentDirectory.listingKind === "explicit_file_set") {
        const sourcePaths = currentDirectory.explicit_source_paths;
        if (sourcePaths === null) {
          return;
        }

        await loadExplicitFileSetState(
          sourcePaths,
          selectedBrowserPath(),
          nextSort,
          directoryQuery(),
        );
      } else {
        await loadDirectoryState(
          currentDirectory.current_directory_path,
          selectedBrowserPath(),
          nextSort,
          directoryQuery(),
        );
      }
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
    if (directoryState()?.listingKind === "explicit_file_set") {
      return;
    }

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

  const handleTocItemSelect = (item: TocItem) => {
    if (item.anchorId === null) {
      return;
    }

    if (markdownDoc() !== null) {
      setMarkdownPane("preview");
    }

    setSelection({
      anchorId: item.anchorId,
      lineStart: null,
    });
  };

  const md = () => markdownDoc();
  const markdownIsDirty = createMemo(() => {
    const doc = md();
    if (doc === null) {
      return false;
    }

    return markdownEditorBuffer() !== doc.source_text;
  });
  const fp = () => filePreview();
  const epubPreview = () => {
    const preview = fp();
    return preview?.kind === "epub" ? preview : null;
  };
  const csvPreview = createMemo(() => {
    const preview = fp();
    return preview?.kind === "csv" ? preview : null;
  });
  const currentOpenPath = () => md()?.path ?? previewPath(fp());
  const diffTarget = createMemo<DiffWorkspaceTarget | null>(() => {
    const activeGit = activeGitDiffTarget();
    if (activeGit !== null) {
      return activeGit;
    }

    const context = startupContext();
    if (context?.browser_root.kind === "github_pr") {
      return {
        kind: "github",
        target: context.browser_root.target,
      };
    }

    if (context?.browser_root.kind === "git_diff") {
      return {
        kind: "git",
        target: context.browser_root.target,
      };
    }

    return null;
  });
  const hasOpenDocument = () => md() !== null || fp() !== null;
  const hasTocDocument = createMemo(
    () => md() !== null || fp()?.kind === "epub",
  );
  const tocItems = createMemo<readonly TocItem[]>(() => {
    const markdown = md();
    if (markdown !== null) {
      return markdownHeadingsToTocItems(markdown.headings);
    }

    const preview = fp();
    if (preview?.kind === "epub") {
      return epubNavigationToTocItems(preview.toc);
    }

    return [];
  });
  const tocSummaryLabel = createMemo(() => {
    const markdown = md();
    if (markdown !== null) {
      return `${markdown.headings.length} headings`;
    }

    const preview = fp();
    if (preview?.kind === "epub") {
      return `${preview.toc.length} sections`;
    }

    return "0 items";
  });
  const tocEmptyLabel = createMemo(() =>
    md() !== null ? "No headings found." : "No contents found.",
  );
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
      if (currentDirectory.listingKind === "explicit_file_set") {
        const sourcePaths = currentDirectory.explicit_source_paths;
        if (sourcePaths === null) {
          return;
        }

        await loadExplicitFileSetState(
          sourcePaths,
          selectedBrowserPath(),
          currentDirectory.sort,
          nextQuery,
        );
      } else {
        await loadDirectoryState(
          currentDirectory.current_directory_path,
          selectedBrowserPath(),
          currentDirectory.sort,
          nextQuery,
        );
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to filter directory entries",
      );
    }
  };

  const viewerGridClassName = createMemo(() => {
    if (diffTarget() !== null) {
      return "workspace__body workspace__body--pr-diff";
    }

    const toc = isTocOpen() && hasTocDocument();
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

  const handleNumericPresentationShortcut = (event: KeyboardEvent): boolean => {
    if (matchesShortcut(event, "1")) {
      if (markdownDoc() !== null) {
        event.preventDefault();
        setMarkdownPane("raw");
        return true;
      }

      if (csvPreview() !== null) {
        event.preventDefault();
        setCsvPaneMode("raw");
        return true;
      }

      return false;
    }

    if (matchesShortcut(event, "2")) {
      if (markdownDoc() !== null) {
        event.preventDefault();
        setMarkdownPane("preview");
        return true;
      }

      const preview = csvPreview();
      if (preview?.formatted_available === true) {
        event.preventDefault();
        setCsvPaneMode("formatted");
        return true;
      }
    }

    return false;
  };

  onMount(() => {
    let isDisposed = false;
    let disposeListener: (() => void) | undefined;

    void handleInitialLoad();

    void listenDocumentRefreshed((refreshedSnapshot) => {
      const decision = decideMarkdownDocumentRefresh(
        markdownDoc(),
        markdownEditorBuffer(),
        refreshedSnapshot,
      );

      if (decision.kind === "conflict") {
        setMarkdownExternalConflict(decision.snapshot);
        return;
      }

      if (decision.kind === "apply") {
        applyMarkdownSnapshot(decision.snapshot);
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

      const saveShortcut =
        event.key.toLowerCase() === "s" &&
        !event.shiftKey &&
        !event.altKey &&
        (event.ctrlKey || event.metaKey);

      if (saveShortcut && markdownDoc() !== null) {
        event.preventDefault();
        void handleSaveMarkdown();
        return;
      }

      const openShortcut =
        event.key.toLowerCase() === "o" &&
        !event.shiftKey &&
        !event.altKey &&
        (event.ctrlKey || event.metaKey);

      if (openShortcut) {
        event.preventDefault();
        void handleOpenFiles();
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if (handleNumericPresentationShortcut(event)) {
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
        if (hasActiveEpubPreview(fp())) {
          stepActiveEpubPage(1);
        } else if (!hasActiveDocumentMediaElement()) {
          scrollActiveDocumentPane(1);
        }
        return;
      }

      if (matchesShortcut(event, "u", { ctrl: true })) {
        event.preventDefault();
        if (hasActiveEpubPreview(fp())) {
          stepActiveEpubPage(-1);
        } else if (!hasActiveDocumentMediaElement()) {
          scrollActiveDocumentPane(-1);
        }
        return;
      }

      if (matchesShortcut(event, "l", { shift: true })) {
        event.preventDefault();
        setFileTreeOpen((value) => !value);
        return;
      }

      if (matchesShortcut(event, "g")) {
        const gitTarget = activeGitDiffTarget();
        if (gitTarget !== null) {
          event.preventDefault();
          handleCloseGitDiff();
          return;
        }

        if (diffTarget() === null) {
          event.preventDefault();
          void handleOpenGitDiff();
          return;
        }
      }

      if (!isFileTreeOpen()) {
        const hasActiveMedia = hasActiveDocumentMediaElement();

        if (matchesShortcut(event, "j")) {
          event.preventDefault();
          if (hasActiveMedia) {
            seekActiveDocumentMediaElement(1);
          } else if (hasActiveEpubPreview(fp())) {
            stepActiveEpubPage(1);
          } else {
            nudgeActiveDocumentPane(1);
          }
          return;
        }

        if (matchesShortcut(event, "k")) {
          event.preventDefault();
          if (hasActiveMedia) {
            seekActiveDocumentMediaElement(-1);
          } else if (hasActiveEpubPreview(fp())) {
            stepActiveEpubPage(-1);
          } else {
            nudgeActiveDocumentPane(-1);
          }
          return;
        }

        if (!hasActiveMedia && event.key === "ArrowDown") {
          event.preventDefault();
          if (hasActiveEpubPreview(fp())) {
            stepActiveEpubPage(1);
          } else {
            nudgeActiveDocumentPane(1);
          }
          return;
        }

        if (!hasActiveMedia && event.key === "ArrowUp") {
          event.preventDefault();
          if (hasActiveEpubPreview(fp())) {
            stepActiveEpubPage(-1);
          } else {
            nudgeActiveDocumentPane(-1);
          }
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

      if (matchesShortcut(event, "t", { shift: true }) && hasTocDocument()) {
        event.preventDefault();
        setTocOpen((value) => !value);
        return;
      }

      if (matchesShortcut(event, "p", { shift: true })) {
        const doc = markdownDoc();
        if (doc !== null) {
          event.preventDefault();
          setMarkdownPane((pane) => (pane === "preview" ? "raw" : "preview"));
          return;
        }

        const preview = fp();
        if (preview?.kind === "csv" && preview.formatted_available) {
          event.preventDefault();
          setCsvPaneMode((mode) =>
            mode === "formatted" ? "raw" : "formatted",
          );
          return;
        }

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
        <ShortcutsHelpDialog open={isShortcutsHelpOpen()} />
      </Portal>
      <div class="workspace__frame">
        <WorkspaceHeader
          activeGitDiff={activeGitDiffTarget() !== null}
          appWindow={appWindow}
          canOpenGitDiff={
            diffTarget() === null &&
            directoryState()?.listingKind === "directory"
          }
          colorScheme={colorScheme()}
          csvPaneMode={csvPaneMode()}
          csvPreview={csvPreview()}
          hasOpenDocument={hasOpenDocument()}
          hasTocDocument={hasTocDocument()}
          isTocOpen={isTocOpen()}
          markdownOpen={md() !== null}
          markdownPane={markdownPane()}
          onCloseGitDiff={handleCloseGitDiff}
          onCycleColorScheme={() => {
            void cycleColorScheme();
          }}
          onOpenFiles={() => {
            void handleOpenFiles();
          }}
          onOpenGitDiff={() => {
            void handleOpenGitDiff();
          }}
          onReloadCurrent={() => {
            void handleReloadCurrent();
          }}
          onSelectCsvPaneMode={setCsvPaneMode}
          onSelectMarkdownPane={setMarkdownPane}
          onToggleToc={() => setTocOpen((value) => !value)}
        />

        <WorkspaceErrorBanner message={errorMessage()} />

        <MarkdownConflictBanner
          snapshot={markdownExternalConflict()}
          onKeepEditing={() => setMarkdownExternalConflict(null)}
          onReloadFromDisk={applyMarkdownSnapshot}
        />

        <div class={viewerGridClassName()}>
          <Show when={diffTarget()}>
            {(target) => <PrDiffWorkspace target={target()} />}
          </Show>
          <Show when={diffTarget() === null}>
            <>
              <Show when={isFileTreeOpen()}>
                <FileBrowserPane
                  active={true}
                  listingKind={directoryState()?.listingKind ?? "directory"}
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
                    const state = directoryState();
                    if (state?.listingKind === "explicit_file_set") {
                      void loadMoreExplicitFileSetEntries();
                    } else {
                      void loadMoreDirectoryEntries();
                    }
                  }}
                  onNavigateToParent={() => void handleNavigateToParent()}
                  onSelectEntry={handleSelectEntry}
                />
              </Show>

              <Show when={isTocOpen() && hasTocDocument()}>
                <TocPane
                  activeAnchorId={selection().anchorId}
                  emptyLabel={tocEmptyLabel()}
                  items={tocItems()}
                  summaryLabel={tocSummaryLabel()}
                  visible={true}
                  onSelectItem={handleTocItemSelect}
                />
              </Show>

              <WorkspaceDocumentColumn
                colorScheme={colorScheme()}
                csvPaneMode={csvPaneMode()}
                csvPreview={csvPreview()}
                epubToc={epubPreview()?.toc ?? []}
                filePreview={fp()}
                hasOpenDocument={hasOpenDocument()}
                markdownDoc={md()}
                markdownEditorBuffer={markdownEditorBuffer()}
                markdownIsDirty={markdownIsDirty()}
                markdownPane={markdownPane()}
                selection={selection()}
                videoAutoplayRequestId={videoAutoplayRequestId()}
                onMarkdownEditorInput={setMarkdownEditorBuffer}
                onRelocateEpub={(anchorId) => {
                  setSelection({
                    anchorId,
                    lineStart: null,
                  });
                }}
              />
            </>
          </Show>
        </div>

        <WorkspaceLoadingOverlay
          loading={isLoading()}
          startupContext={startupContext()}
        />
      </div>
    </main>
  );
}

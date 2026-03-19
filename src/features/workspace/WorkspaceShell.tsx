import { dirname } from "@tauri-apps/api/path";
import {
  For,
  Match,
  Show,
  Switch,
  createSignal,
  onCleanup,
  onMount,
  startTransition,
} from "solid-js";
import type {
  DirectoryEntry,
  DirectorySnapshot,
  DocumentSnapshot,
  FilePreview,
  HeadingNode,
  StartupContext,
  WorkspaceMode,
} from "../../lib/tauri/document";
import {
  getStartupContext,
  isMarkdownPath,
  listenDocumentRefreshed,
  listDirectory,
  openDocument,
  openFilePreview,
  reloadDocument,
  saveDocument,
} from "../../lib/tauri/document";
import { EditorPane } from "../editor/EditorPane";
import { FileBrowserPane } from "../file-view/FileBrowserPane";
import { PreviewPane } from "../preview/PreviewPane";
import { TocPane } from "../toc/TocPane";
import type { WorkspaceSelection } from "./state";

function formatTimestamp(lastModified: string | null): string {
  if (lastModified === null) {
    return "Unknown";
  }

  const timestamp = Number(lastModified);

  if (Number.isNaN(timestamp)) {
    return "Unknown";
  }

  return new Date(timestamp).toLocaleString();
}

function previewPath(preview: FilePreview | null): string | null {
  return preview?.path ?? null;
}

function previewFileName(preview: FilePreview | null): string {
  return preview?.file_name ?? "No file selected";
}

function previewLastModified(preview: FilePreview | null): string | null {
  return preview?.last_modified ?? null;
}

function previewHtml(preview: FilePreview | null): string {
  return preview?.html ?? "<div class=\"empty\">Select a file to preview it.</div>";
}

function markdownCandidatePath(
  mode: WorkspaceMode,
  markdownSnapshot: DocumentSnapshot | null,
  selectedPath: string | null,
): string | null {
  if (mode === "markdown") {
    return markdownSnapshot?.path ?? null;
  }

  if (selectedPath !== null && isMarkdownPath(selectedPath)) {
    return selectedPath;
  }

  return null;
}

export function WorkspaceShell() {
  let directoryRequestId = 0;
  let previewRequestId = 0;
  const [startupContext, setStartupContext] = createSignal<StartupContext | null>(
    null,
  );
  const [mode, setMode] = createSignal<WorkspaceMode>("file_view");
  const [directorySnapshot, setDirectorySnapshot] =
    createSignal<DirectorySnapshot | null>(null);
  const [selectedBrowserPath, setSelectedBrowserPath] = createSignal<
    string | null
  >(null);
  const [filePreview, setFilePreview] = createSignal<FilePreview | null>(null);
  const [snapshot, setSnapshot] = createSignal<DocumentSnapshot | null>(null);
  const [editorText, setEditorText] = createSignal("");
  const [isDirty, setDirty] = createSignal(false);
  const [isPreviewOpen, setPreviewOpen] = createSignal(false);
  const [isTocOpen, setTocOpen] = createSignal(true);
  const [selection, setSelection] = createSignal<WorkspaceSelection>({
    anchorId: null,
    lineStart: null,
  });
  const [conflictSnapshot, setConflictSnapshot] =
    createSignal<DocumentSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [isLoading, setLoading] = createSignal(true);

  const applySnapshot = (nextSnapshot: DocumentSnapshot) => {
    startTransition(() => {
      setSnapshot(nextSnapshot);
      setEditorText(nextSnapshot.source_text);
      setDirty(false);
      setConflictSnapshot(null);
      setErrorMessage(null);
      setSelectedBrowserPath(nextSnapshot.path);
    });
  };

  const applyDirectorySnapshot = (nextSnapshot: DirectorySnapshot) => {
    startTransition(() => {
      setDirectorySnapshot(nextSnapshot);
      setSelectedBrowserPath(nextSnapshot.selected_path);
      setErrorMessage(null);
    });
  };

  const handleHeadingSelect = (heading: HeadingNode) => {
    setPreviewOpen(true);
    setSelection({
      anchorId: heading.anchor_id,
      lineStart: heading.line_start,
    });
  };

  const clearFilePreview = () => {
    previewRequestId += 1;
    setFilePreview(null);
  };

  const loadDirectoryState = async (
    path: string,
    selectedPath: string | null,
  ) => {
    const requestId = ++directoryRequestId;
    const nextSnapshot = await listDirectory(path, selectedPath);

    if (requestId !== directoryRequestId) {
      return;
    }

    applyDirectorySnapshot(nextSnapshot);
  };

  const previewSelectedFile = async (path: string) => {
    const requestId = ++previewRequestId;
    const nextPreview = await openFilePreview(path);

    if (requestId !== previewRequestId) {
      return;
    }

    startTransition(() => {
      setFilePreview(nextPreview);
      setErrorMessage(null);
    });
  };

  const handleInitialLoad = async () => {
    setLoading(true);

    try {
      const nextStartupContext = await getStartupContext();
      setStartupContext(nextStartupContext);
      setMode(nextStartupContext.initial_mode);
      await loadDirectoryState(
        nextStartupContext.current_directory_path,
        nextStartupContext.selected_file_path,
      );

      if (
        nextStartupContext.initial_mode === "markdown" &&
        nextStartupContext.selected_file_path !== null
      ) {
        const nextSnapshot = await openDocument(
          nextStartupContext.selected_file_path,
        );
        applySnapshot(nextSnapshot);
      } else if (nextStartupContext.selected_file_path !== null) {
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

  const handleSave = async () => {
    const activeSnapshot = snapshot();

    if (activeSnapshot === null) {
      return;
    }

    try {
      const nextSnapshot = await saveDocument(
        activeSnapshot.path,
        editorText(),
      );
      applySnapshot(nextSnapshot);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save document",
      );
    }
  };

  const handleReload = async () => {
    const activeSnapshot = snapshot();

    if (activeSnapshot === null) {
      return;
    }

    try {
      const nextSnapshot = await reloadDocument(activeSnapshot.path);
      applySnapshot(nextSnapshot);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to reload document",
      );
    }
  };

  const handleRefreshFileView = async () => {
    const currentDirectory = directorySnapshot()?.current_directory_path;
    const currentPreviewPath = previewPath(filePreview());

    if (currentDirectory === undefined) {
      return;
    }

    try {
      await loadDirectoryState(currentDirectory, selectedBrowserPath());

      if (currentPreviewPath !== null) {
        await previewSelectedFile(currentPreviewPath);
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to refresh file view",
      );
    }
  };

  const handleSelectEntry = (entry: DirectoryEntry) => {
    setSelectedBrowserPath(entry.path);

    if (entry.is_directory) {
      clearFilePreview();
      return;
    }

    void previewSelectedFile(entry.path);
  };

  const handleConfirmEntry = async (entry: DirectoryEntry) => {
    if (entry.is_directory) {
      try {
        clearFilePreview();
        await loadDirectoryState(entry.path, null);
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to open directory",
        );
      }

      return;
    }

    try {
      setSelectedBrowserPath(entry.path);
      await previewSelectedFile(entry.path);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to preview file",
      );
    }
  };

  const handleNavigateToParent = async () => {
    const parentDirectory = directorySnapshot()?.parent_directory_path;
    const currentDirectory = directorySnapshot()?.current_directory_path;

    if (parentDirectory === null || parentDirectory === undefined) {
      return;
    }

    try {
      clearFilePreview();
      await loadDirectoryState(parentDirectory, currentDirectory ?? null);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to navigate to parent directory",
      );
    }
  };

  const handleSwitchToMarkdownMode = async () => {
    const nextPath = markdownCandidatePath(
      mode(),
      snapshot(),
      selectedBrowserPath(),
    );

    if (nextPath === null) {
      return;
    }

    setLoading(true);

    try {
      const nextSnapshot = await openDocument(nextPath);
      applySnapshot(nextSnapshot);
      setMode("markdown");
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to open Markdown mode",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchToFileView = async () => {
    if (mode() === "file_view") {
      return;
    }

    const activePath =
      snapshot()?.path ??
      selectedBrowserPath() ??
      startupContext()?.selected_file_path ??
      null;
    const targetDirectory =
      activePath === null
        ? startupContext()?.current_directory_path ?? null
        : await dirname(activePath);

    if (targetDirectory === null) {
      return;
    }

    setLoading(true);

    try {
      await loadDirectoryState(targetDirectory, activePath);

      if (activePath !== null) {
        await previewSelectedFile(activePath);
      } else {
        clearFilePreview();
      }

      setMode("file_view");
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to open file view mode",
      );
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    let isDisposed = false;
    let disposeListener: (() => void) | undefined;

    void handleInitialLoad();

    void listenDocumentRefreshed((refreshedSnapshot) => {
      if (mode() !== "markdown") {
        return;
      }

      if (isDirty()) {
        setConflictSnapshot(refreshedSnapshot);
        return;
      }

      applySnapshot(refreshedSnapshot);
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

    onCleanup(() => {
      isDisposed = true;
      disposeListener?.();
    });
  });

  const activeSnapshot = () => snapshot();
  const activeMode = () => mode();
  const activeMarkdownPath = () =>
    markdownCandidatePath(activeMode(), activeSnapshot(), selectedBrowserPath());

  return (
    <main class="workspace">
      <div class="workspace__frame">
        <header class="workspace__header">
          <div class="workspace__title">
            <span class="workspace__eyebrow">Marky File Viewer</span>
            <strong class="workspace__file">
              <Switch>
                <Match when={activeMode() === "markdown"}>
                  {activeSnapshot()?.file_name ?? "Loading..."}
                </Match>
                <Match when={true}>{previewFileName(filePreview())}</Match>
              </Switch>
            </strong>
            <span class="workspace__status">
              <For
                each={
                  activeMode() === "markdown"
                    ? [
                        "Markdown mode",
                        isDirty() ? "Unsaved changes" : "Clean buffer",
                        `Preview ${isPreviewOpen() ? "open" : "collapsed"}`,
                        `Updated ${formatTimestamp(
                          activeSnapshot()?.last_modified ?? null,
                        )}`,
                      ]
                    : [
                        "File view mode",
                        directorySnapshot()?.current_directory_path ??
                          "Loading directory",
                        `Updated ${formatTimestamp(
                          previewLastModified(filePreview()),
                        )}`,
                      ]
                }
              >
                {(label, index) => (
                  <>
                    <span>{label}</span>
                    <Show
                      when={
                        index() <
                        (activeMode() === "markdown" ? 3 : 2)
                      }
                    >
                      <span> · </span>
                    </Show>
                  </>
                )}
              </For>
            </span>
          </div>

          <div class="workspace__actions">
            <button
              class={`button${
                activeMode() === "file_view" ? " button--active" : ""
              }`}
              type="button"
              onClick={() => void handleSwitchToFileView()}
            >
              File View
            </button>
            <button
              class={`button${
                activeMode() === "markdown" ? " button--active" : ""
              }`}
              type="button"
              disabled={activeMarkdownPath() === null}
              onClick={() => void handleSwitchToMarkdownMode()}
            >
              Markdown Mode
            </button>

            <Show when={activeMode() === "markdown"}>
              <button
                class={`button${isTocOpen() ? " button--active" : ""}`}
                type="button"
                onClick={() => setTocOpen((value) => !value)}
              >
                Toggle TOC
              </button>
              <button
                class={`button${isPreviewOpen() ? " button--active" : ""}`}
                type="button"
                onClick={() => setPreviewOpen((value) => !value)}
              >
                Toggle Preview
              </button>
              <button
                class="button button--ghost"
                type="button"
                disabled={activeSnapshot() === null}
                onClick={() => void handleReload()}
              >
                Reload
              </button>
              <button
                class="button button--primary"
                type="button"
                disabled={!isDirty() || activeSnapshot() === null}
                onClick={() => void handleSave()}
              >
                Save
              </button>
            </Show>

            <Show when={activeMode() === "file_view"}>
              <button
                class="button"
                type="button"
                disabled={directorySnapshot()?.parent_directory_path === null}
                onClick={() => void handleNavigateToParent()}
              >
                Up
              </button>
              <button
                class="button button--ghost"
                type="button"
                disabled={directorySnapshot() === null}
                onClick={() => void handleRefreshFileView()}
              >
                Refresh
              </button>
            </Show>
          </div>
        </header>

        <Show when={conflictSnapshot() !== null && activeMode() === "markdown"}>
          <div class="banner">
            <div>
              The file changed on disk while you were editing. Load the new
              version or keep your current buffer and save later.
            </div>
            <div class="banner__actions">
              <button
                class="button button--primary"
                type="button"
                onClick={() => {
                  const nextSnapshot = conflictSnapshot();

                  if (nextSnapshot !== null) {
                    applySnapshot(nextSnapshot);
                  }
                }}
              >
                Load Disk Version
              </button>
              <button
                class="button"
                type="button"
                onClick={() => setConflictSnapshot(null)}
              >
                Keep Editing
              </button>
            </div>
          </div>
        </Show>

        <Show when={errorMessage() !== null}>
          <div class="banner banner--error">{errorMessage()}</div>
        </Show>

        <div
          class={`workspace__body workspace__body--${
            activeMode() === "markdown" ? "markdown" : "file-view"
          }`}
        >
          <Show
            when={activeMode() === "markdown"}
            fallback={
              <>
                <FileBrowserPane
                  active={activeMode() === "file_view"}
                  directory={directorySnapshot()}
                  selectedPath={selectedBrowserPath()}
                  onConfirmEntry={(entry) => void handleConfirmEntry(entry)}
                  onNavigateToParent={() => void handleNavigateToParent()}
                  onSelectEntry={handleSelectEntry}
                />
                <PreviewPane
                  documentPath={previewPath(filePreview())}
                  html={previewHtml(filePreview())}
                  selectedAnchorId={null}
                  visible={true}
                />
              </>
            }
          >
            <TocPane
              activeAnchorId={selection().anchorId}
              headings={activeSnapshot()?.headings ?? []}
              visible={isTocOpen()}
              onSelectHeading={handleHeadingSelect}
            />

            <EditorPane
              fileName={activeSnapshot()?.file_name ?? "document.md"}
              isDirty={isDirty()}
              requestedLineStart={selection().lineStart}
              sourceText={editorText()}
              onInput={(nextValue) => {
                setEditorText(nextValue);
                setDirty(nextValue !== (activeSnapshot()?.source_text ?? ""));
              }}
              onSave={() => void handleSave()}
            />

            <PreviewPane
              documentPath={activeSnapshot()?.path ?? null}
              html={activeSnapshot()?.html ?? ""}
              selectedAnchorId={selection().anchorId}
              visible={isPreviewOpen()}
            />
          </Show>
        </div>

        <Show when={isLoading()}>
          <div class="empty">
            {startupContext()?.initial_mode === "markdown"
              ? "Opening the requested Markdown document..."
              : "Loading file view mode..."}
          </div>
        </Show>
      </div>
    </main>
  );
}

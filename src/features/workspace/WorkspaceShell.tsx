import {
  For,
  Show,
  createSignal,
  onCleanup,
  onMount,
  startTransition,
} from "solid-js";
import type { DocumentSnapshot, HeadingNode } from "../../lib/tauri/document";
import {
  getStartupDocumentPath,
  listenDocumentRefreshed,
  openDocument,
  reloadDocument,
  saveDocument,
} from "../../lib/tauri/document";
import { EditorPane } from "../editor/EditorPane";
import { PreviewPane } from "../preview/PreviewPane";
import { TocPane } from "../toc/TocPane";
import type { WorkspaceSelection } from "./state";

function formatTimestamp(lastModified: string): string {
  const timestamp = Number(lastModified);

  if (Number.isNaN(timestamp)) {
    return "Unknown";
  }

  return new Date(timestamp).toLocaleString();
}

export function WorkspaceShell() {
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
    });
  };

  const handleHeadingSelect = (heading: HeadingNode) => {
    setPreviewOpen(true);
    setSelection({
      anchorId: heading.anchor_id,
      lineStart: heading.line_start,
    });
  };

  const handleInitialLoad = async () => {
    setLoading(true);

    try {
      const startupPath = await getStartupDocumentPath();
      const nextSnapshot = await openDocument(startupPath);
      applySnapshot(nextSnapshot);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load document",
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

  onMount(() => {
    let isDisposed = false;
    let disposeListener: (() => void) | undefined;

    void handleInitialLoad();

    void listenDocumentRefreshed((refreshedSnapshot) => {
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

  return (
    <main class="workspace">
      <div class="workspace__frame">
        <header class="workspace__header">
          <div class="workspace__title">
            <span class="workspace__eyebrow">Markdown Workbench</span>
            <strong class="workspace__file">
              {activeSnapshot()?.file_name ?? "Loading..."}
            </strong>
            <span class="workspace__status">
              <For
                each={[
                  isDirty() ? "Unsaved changes" : "Clean buffer",
                  `Preview ${isPreviewOpen() ? "open" : "collapsed"}`,
                  `Updated ${formatTimestamp(
                    activeSnapshot()?.last_modified ?? "0",
                  )}`,
                ]}
              >
                {(label, index) => (
                  <>
                    <span>{label}</span>
                    <Show when={index() < 2}>
                      <span> · </span>
                    </Show>
                  </>
                )}
              </For>
            </span>
          </div>

          <div class="workspace__actions">
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
          </div>
        </header>

        <Show when={conflictSnapshot() !== null}>
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

        <div class="workspace__body">
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
            html={activeSnapshot()?.html ?? ""}
            selectedAnchorId={selection().anchorId}
            visible={isPreviewOpen()}
          />
        </div>

        <Show when={isLoading()}>
          <div class="empty">Opening the requested Markdown document...</div>
        </Show>
      </div>
    </main>
  );
}

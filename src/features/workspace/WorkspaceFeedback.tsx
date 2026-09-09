import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js";
import type {
  DocumentSnapshot,
  StartupContext,
} from "../../lib/tauri/document";

interface WorkspaceErrorBannerProps {
  readonly message: string | null;
}

export function WorkspaceErrorBanner(props: WorkspaceErrorBannerProps) {
  const [visible, setVisible] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let remaining = 8_000;
  let started = 0;
  let hovered = false;
  let focused = false;
  const clearTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const resume = (): void => {
    if (hovered || focused || !visible() || timer !== undefined) return;
    started = Date.now();
    timer = setTimeout(() => {
      timer = undefined;
      setVisible(false);
    }, remaining);
  };
  const pause = (): void => {
    if (timer !== undefined)
      remaining = Math.max(0, remaining - (Date.now() - started));
    clearTimer();
  };
  createEffect(() => {
    const message = props.message;
    clearTimer();
    remaining = 8_000;
    setVisible(message !== null);
    if (message === null) {
      hovered = false;
      focused = false;
    }
    untrack(resume);
  });
  onCleanup(clearTimer);
  return (
    <Show when={visible()}>
      <div
        class="workspace-notification"
        role="alert"
        onMouseEnter={() => {
          hovered = true;
          pause();
        }}
        onMouseLeave={() => {
          hovered = false;
          resume();
        }}
        onFocusIn={() => {
          focused = true;
          pause();
        }}
        onFocusOut={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
          )
            return;
          focused = false;
          resume();
        }}
      >
        <span>{props.message}</span>
        <button
          type="button"
          class="workspace-notification__close"
          aria-label="Close notification"
          onClick={() => {
            clearTimer();
            hovered = false;
            focused = false;
            setVisible(false);
          }}
        >
          Close
        </button>
      </div>
    </Show>
  );
}

interface MarkdownConflictBannerProps {
  readonly snapshot: DocumentSnapshot | null;
  readonly onReloadFromDisk: (snapshot: DocumentSnapshot) => void;
  readonly onKeepEditing: () => void;
}

export function MarkdownConflictBanner(props: MarkdownConflictBannerProps) {
  return (
    <Show when={props.snapshot !== null}>
      <div class="banner">
        <span>
          This file changed on disk while you have unsaved edits in the editor.
        </span>
        <div class="banner__actions">
          <button
            type="button"
            class="workspace__text-button"
            onClick={() => {
              if (props.snapshot !== null) {
                props.onReloadFromDisk(props.snapshot);
              }
            }}
          >
            Reload from disk
          </button>
          <button
            type="button"
            class="workspace__text-button"
            onClick={props.onKeepEditing}
          >
            Keep editing
          </button>
        </div>
      </div>
    </Show>
  );
}

interface WorkspaceLoadingOverlayProps {
  readonly loading: boolean;
  readonly startupContext: StartupContext | null;
}

export function WorkspaceLoadingOverlay(props: WorkspaceLoadingOverlayProps) {
  return (
    <Show when={props.loading}>
      <div class="workspace__loading" role="status" aria-live="polite">
        <div class="workspace__loading-inner">
          {loadingMessage(props.startupContext)}
        </div>
      </div>
    </Show>
  );
}

function loadingMessage(context: StartupContext | null): string {
  if (context === null) {
    return "Loading workspace...";
  }

  if (context.browser_root.kind === "github_pr") {
    return "Opening the requested GitHub diff...";
  }

  if (context.browser_root.kind === "git_diff") {
    return "Opening the requested Git diff...";
  }

  if (context.browser_root.kind === "explicit_file_set") {
    return "Opening the requested files...";
  }

  return context.browser_root.selected_file_path !== null
    ? "Opening the requested file..."
    : "Loading workspace...";
}

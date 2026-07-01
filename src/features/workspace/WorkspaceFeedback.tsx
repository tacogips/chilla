import { Show } from "solid-js";
import type {
  DocumentSnapshot,
  StartupContext,
} from "../../lib/tauri/document";

interface WorkspaceErrorBannerProps {
  readonly message: string | null;
}

export function WorkspaceErrorBanner(props: WorkspaceErrorBannerProps) {
  return (
    <Show when={props.message !== null}>
      <div class="banner banner--error">{props.message}</div>
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

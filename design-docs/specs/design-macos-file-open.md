# macOS File Open

## Overview

Support LaunchServices file delivery through `open -a Chilla <file>` and Finder Open With, on cold launch and while the application is running. Direct executable arguments continue using the existing startup context.

## Delivery and lifecycle

Tauri's macOS `RunEvent::Opened` supplies URLs. Convert only local file URLs with `to_file_path`, preserving decoded Unicode and spaces. Ignore unsupported URL schemes. Store each ordered, deduplicated batch in a shared native request queue managed on the Builder before setup/Ready, also retained by AppState, before emitting a `native_files_opened` wakeup event. Bring the main window forward. A `take_native_open_requests` command atomically drains queued batches; events carry no file payload. This queue prevents requests from being lost before the WebView has subscribed.

The frontend subscribes before loading its startup context, then drains once after initial loading. Wakeups schedule serialized drains after that same initialization promise. Each batch uses the existing dialog-selected paths flow, including selected-file fallback if the sandbox cannot list the parent directory. This preserves file options, watcher teardown, preview behavior, and existing error presentation. The initialization barrier resolves in finally on success, failure, or disposal. Cleanup releases the event listener and prevents queued work after disposal; asynchronous continuations check disposal after awaits.

## Scope

Files and multiple-file batches are supported. This change does not register Chilla as the default handler, install a new system application, or publish a release. Existing dialog replacement behavior remains the same for native requests.

## References

The installed Tauri 2 `app.rs` defines `RunEvent::Opened { urls: Vec<Url> }` on macOS/iOS. The repository's current dialog opening flow is in `src/features/workspace/WorkspaceShell.tsx`.

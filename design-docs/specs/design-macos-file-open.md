# macOS File Open

## Overview

Support LaunchServices file delivery through `open -a Chilla <file>` and Finder Open With, on cold launch and while the application is running. Direct executable arguments continue using the existing startup context.

## Delivery and lifecycle

Tauri's macOS `RunEvent::Opened` supplies URLs. Convert only local file URLs with `to_file_path`, preserving decoded Unicode and spaces. Ignore unsupported URL schemes. Store each ordered, deduplicated batch in a shared native request queue managed on the Builder before setup/Ready, also retained by AppState, before emitting a `native_files_opened` wakeup event. Bring the main window forward. A `take_native_open_requests` command atomically drains queued batches; events carry no file payload. This queue prevents requests from being lost before the WebView has subscribed.

The frontend subscribes before loading its startup context, then drains once after initial loading. Wakeups schedule serialized drains after that same initialization promise. Each batch uses the existing dialog-selected paths flow, including selected-file fallback if the sandbox cannot list the parent directory. This preserves file options, watcher teardown, preview behavior, and existing error presentation. The initialization barrier resolves in finally on success, failure, or disposal. Cleanup releases the event listener and prevents queued work after disposal; asynchronous continuations check disposal after awaits.

## Interactive picker supersession

Release 0.3.6 (commit `440d902`) routed the in-app picker (`handleOpenFiles`, bound to `files.open` / `Cmd+O`) through the same strict serial queue (`queueFileOpenWork`) as native drains. As a result, a newer picker selection waits behind an older single-file pick whose parent-directory `listDirectory` call is still pending, and the newer workspace never opens. That is a regression. The picker must use latest-wins semantics, which the `directoryRequestId` ownership checks in `openSelectedFiles` were designed to provide.

Rules:

- Only native-open drains use the serial queue. `drainNativeOpenRequests` stays the only caller of `queueFileOpenWork`. Native batches keep their order relative to each other and still run after the initialization barrier.
- A picker open never joins that queue. After the dialog resolves with a non-null selection, `handleOpenFiles` awaits the same `workspaceInitialized` barrier, returns if the workspace was disposed, and calls `openSelectedFiles(selection)` directly. A cancelled dialog (`null`) changes nothing.
- Supersession is decided only by the existing `directoryRequestId` ownership token. Each directory or file-set load increments it. A superseded open (picker or native) sees a mismatched token after each await and returns without these effects: it does not fall back to the selected file, change the startup context, load the preview, show an error notification, or clear `loading`. Only the current owner clears `loading`. No new counter, abort controller or queue is added.
- A late rejection from a superseded parent-directory listing must not run the Powerbox selected-file fallback (`listExplicitFileSet`), must not open a preview, and must not show a notification. It must not produce an unhandled rejection either: `openSelectedFiles` already awaits and catches it.
- Picker and native opens interleave by latest start. A native batch that starts after a picker open supersedes it, and a picker open that starts during a native batch supersedes that batch. Batches still queued in the drain run afterwards, in order, and each one is again latest-wins. No other cross-source ordering is guaranteed.

Verification: the DOM test `WorkspaceShell numeric view shortcuts > ignores a stale parent directory rejection after a newer picker workspace opens` (`src/features/workspace/WorkspaceShell.vitest.tsx`) passes unmodified. All existing native-open and picker tests also pass under `mise exec -- env PATH="$(mise where node)/bin:$PATH" bun run test:dom`.

## Scope

Files and multiple-file batches are supported. This change does not register Chilla as the default handler, install a new system application, or publish a release. Existing dialog replacement behavior remains the same for native requests.

## References

The installed Tauri 2 `app.rs` defines `RunEvent::Opened { urls: Vec<Url> }` on macOS/iOS. The repository's current dialog opening flow is in `src/features/workspace/WorkspaceShell.tsx`.

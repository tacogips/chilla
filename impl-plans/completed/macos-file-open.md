# macOS File Open Implementation Plan

**Status**: Completed
**Design Reference**: [macOS File Open](../../design-docs/specs/design-macos-file-open.md#delivery-and-lifecycle)
**Created**: 2026-10-06
**Last Updated**: 2026-10-06

## Deliverables

### Rust native delivery

Files: `src-tauri/src/lib.rs`, `app_state.rs`, `events.rs`, `commands/document.rs`.

```rust
pub fn enqueue_native_open_request(&self, paths: Vec<String>) -> Result<(), String>;
pub fn take_native_open_requests(&self) -> Result<Vec<Vec<String>>, String>;
```

The shared queue is managed before build/setup, so Opened arriving before Ready is retained. AppState must retain the same queue. The Tauri command `take_native_open_requests` returns ordered path batches. The wakeup event is `native_files_opened` with unit payload. URL conversion uses file URL decoding, not string prefix removal.

### Frontend delivery

Files: `src/lib/tauri/document.ts`, `src/features/workspace/WorkspaceShell.tsx`.

```typescript
export function takeNativeOpenRequests(): Promise<readonly (readonly string[])[]>;
export function listenNativeFilesOpened(handler: () => void): Promise<UnlistenFn>;
```

Share dialog opening with native batches. Subscribe before startup context loading and drain after it completes. Serialize drains and opening requests, clean up on unmount, validate IPC output and show errors through existing UI.

## Tasks and dependencies

| Task | Deliverables | Depends on | Status |
|---|---|---|---|
| TASK-001 | Rust delivery and queue | Design | Completed |
| TASK-002 | Frontend subscription and shared opening | Contract | Completed |
| TASK-003 | Independent review and native launch | TASK-001, TASK-002 | Completed |

TASK-001 and TASK-002 are parallelizable; they modify disjoint files.

## Completion criteria

- [x] Rust native file URL queue and command implemented
- [x] Frontend handles cold and warm requests without startup races
- [x] Independent review and required compilation checks complete
- [x] Rebuilt debug executable launched locally
- [x] Native bundle opens the requested PNG through LaunchServices on cold and warm launch, plus multiple paths and Unicode/spaces
- [x] Usage documented and plan archived

## Progress log

### 2026-10-06

Identified missing native RunEvent handling. Design and contract prepared. Preserve unrelated Apple release status notes. No commit, push, or release is part of this task.

### Completion: 2026-10-06

Independent design review identified and corrected pre-Ready queue management. Independent final review accepted implementation. Cargo check, strict all-target Clippy, Cargo formatting, Bun typecheck, scoped Biome formatting, and debug bundle build passed. No tests were added or run. Direct `target/debug/chilla` was launched with the requested PNG; log `/tmp/chilla-file-open-20261006/direct-launch.log`.

LaunchServices runtime logs confirmed cold and warm PNG preview loading, a multiple-file request, and a Japanese filename with spaces. Evidence: `/tmp/chilla-file-open-20261006/launchservices.log`. QA bundle used a separate identifier and all agent-launched processes were stopped. Installed application remains unchanged. Computer Use could not start its native pipe, so screenshots/visible rendering and a new sandbox-only grant check were not verified; existing selected-file fallback was preserved and reviewed. No commit/push/release performed.

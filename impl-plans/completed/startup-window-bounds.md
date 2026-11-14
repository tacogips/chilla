# Startup Window Bounds Implementation Plan

**Status**: Completed
**Design Reference**: [Startup Window Bounds](../../design-docs/specs/architecture.md#startup-window-bounds)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

Fit startup window size and position inside the selected monitor's usable area.
Display-change tracking and persisted window state are outside this change.

## Deliverables and Status

| Task | Deliverables | Status | Dependencies | Parallelizable |
| --- | --- | --- | --- | --- |
| TASK-001 | `src-tauri/src/lib.rs`, `src-tauri/src/startup_window.rs`, `src-tauri/tauri.conf.json`: fit geometry before showing window | Completed | None | No |
| TASK-002 | Rust regression tests for startup bounds and scaled/offset displays | Completed | TASK-001 | No |
| TASK-003 | Independent checks, debug build, local launch | Completed | TASK-002 | No |

The existing desktop adjustment interface remains `fn clamp_main_window_to_work_area(window: &WebviewWindow) -> tauri::Result<bool>`, or an equivalent private module entry point. No IPC contract changes are required.

## Completion Criteria

- [x] Size and position fit usable monitor bounds; scaled and negative coordinates work.
- [x] Minimum size permits fitting small displays; window appears after adjustment.
- [x] Regression tests, Rust formatting, check, and Clippy pass.
- [x] Debug app rebuilt and launched; UI verification limitations recorded.

## Progress Log

### Session: 2026-09-09

Confirmed existing startup clamp checks dimensions only and skips position correction.
Recorded design and started implementation with the required Rust coding agent.

Implementation and independent review completed. Six targeted startup tests pass;
Cargo check, final Clippy with warnings denied, formatting, and debug Tauri build
(including frontend TypeScript compilation) pass. An incremental locked Cargo
build ensured the launched binary included the final timeout refinement.

The macOS helper uses already locked objc2 and objc2-app-kit versions with minimal
features. No dependency versions or checksums changed. Dependency audit reported
zero vulnerabilities, with existing informational warnings in unrelated crates.

Launched `target/debug/chilla --verbose` with output redirected to
`/tmp/chilla-startup-bounds-launch.log`. A background nohup attempt did not persist
in the command runner, so the successful launch used a foreground PTY session.
Native CoreGraphics inspection found window bounds `(0, 986, 1280, 770)` entirely
inside the secondary display's usable bounds `(0, 956, 1280, 800)`. Verbose logs
reported `main_window_clamp=clamped` and frontend readiness. The test process was
stopped afterward; pre-existing app processes were left running.

Computer Use was unavailable, so visual UI interaction verification was skipped.
Native bounds were measured on the actual dual-display setup; alternate scales
and monitor offsets are covered by regression tests.

# Window Tiling Implementation Plan

**Status**: Completed
**Design Reference**: [Window Tiling](../../design-docs/specs/architecture.md#window-tiling)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

Allow external window managers to arrange chilla in half, third, and quarter
tiles. Preserve preferred startup dimensions and the startup bounds fix.

## Deliverables and Status

| Task | Deliverables | Status | Dependencies | Parallelizable |
| --- | --- | --- | --- | --- |
| TASK-001 | `src-tauri/tauri.conf.json`, macOS native setup: compact minimum dimensions and normal window classification | Completed | None | No |
| TASK-002 | Rebuild and measure native Accessibility resize/position results | Completed | TASK-001 | No |
| TASK-003 | Document verified behavior and leave rebuilt app open | Completed | TASK-002 | No |

No IPC contracts change. macOS native setup may change to retain standard window
semantics while preserving custom header functionality.

## Completion Criteria

- [x] Native minimum is 320 by 240 logical pixels; initial size remains 1480 by 920.
- [x] Native resize/position accepts representative tiles on the local displays.
- [x] AeroSpace automatically classifies and tiles new chilla windows normally.
- [x] Debug build passes and rebuilt app is launched.

## Progress Log

### Session: 2026-09-09

Native inspection confirmed AXWindow/AXStandardWindow with settable AXSize.
A 640 by 400 Accessibility resize succeeded but read back 960 by 640, proving
the configured minimum blocks compact tiling.

User clarified the window manager is AeroSpace. Its live diagnostics report
`Aero.AxUiElementWindowType=dialog`, `isDialogHeuristic=true`, and floating layout
for the existing borderless chilla window, with native close/minimize/zoom
attributes absent. User configuration has no chilla or global floating rule.
Expanded the fix to retain native window semantics and verify automatic tiling.

Enabled native macOS decorations on the generated main-window context before
window creation, leaving other platforms unchanged. No dependency or IPC changes
were needed. The required Rust coding and verification agents completed source
review, Cargo check, Clippy with warnings denied, formatting, and all six startup
geometry tests. The Tauri debug build, including frontend compilation, passed.

Live AeroSpace 0.21.3-Beta verification on newly created window 9791 reported an
enabled AXFullScreenButton, type `window`, dialog heuristic `false`, and automatic
`h_tiles` placement in TilingContainer without a configuration rule. Startup
clamping and frontend readiness succeeded in the verbose log for PID 68476.

Native Accessibility resize readbacks matched 628x754, 416x754, and 628x370.
macOS adjusted a requested top-edge position from y=964 to y=986; an interior
position at (8,990) was accepted in subsequent compact-size checks. One repeated
half-width request was changed by the active window manager while transitioning
layout; the initial half-width readback matched. Testing used only the newly
launched instance. That process exited during verification; a fresh final launch
via `open -n target/debug/chilla` produced PID 70136/window 9817 and again entered
`h_tiles` automatically. It was left running. Existing app instances and the
user's AeroSpace configuration were preserved.

Build log: `/tmp/chilla-aerospace-build.log`. Test launch command:
`target/debug/chilla --verbose >/tmp/chilla-aerospace-launch.log 2>&1`.
Computer Use was unavailable; verification used AeroSpace's live diagnostics
and native macOS Accessibility instead of a screenshot-based UI inspection.

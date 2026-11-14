# Left Pane Folding and Focus Implementation Plan

**Status**: Completed
**Design Reference**: [Left Pane Toggle](../../design-docs/specs/architecture.md#left-pane-toggle)
**Created**: 2026-09-10
**Last Updated**: 2026-09-10

Complete existing Shift+L folding with focus transfer, hidden-browser shortcut
isolation, and collapsed startup for explicit file arguments. Preserve existing
uncommitted shortcut work. No IPC contract changes are expected.

## Deliverables and Tasks

| Task | Deliverables | Status | Dependencies | Parallelizable |
| --- | --- | --- | --- | --- |
| TASK-001 | WorkspaceShell startup/toggle focus and PrDiffWorkspace browser shortcut gating; preview focus targets as needed | Completed | None | No |
| TASK-002 | Regression coverage for startup, keyboard/button toggles, focus, hidden-browser inactivity and expand restoration | Completed | TASK-001 | No |
| TASK-003 | Independent verification, README, debug rebuild and launch | Completed | TASK-002 | No |

## Completion Criteria

- [x] Shift+L and toolbar collapse/expand in file and diff modes.
- [x] Collapse focuses preview and prevents hidden browser actions.
- [x] Expand restores usable browser focus and navigation.
- [x] Explicit file startup collapses and focuses preview; directory startup stays expanded.
- [x] Focus/behavior regressions, typecheck and relevant checks pass.
- [x] README updated; rebuilt debug app launched.

## Progress Log

### Session: 2026-09-10

Existing single-file startup already collapses but has no explicit preview focus.
Explicit file sets start expanded. Diff browser shortcuts remain enabled while
hidden. Existing unrelated working-tree changes must be preserved.

Implemented deferred preview/selected-row focus transfer, explicit file-set
collapsed startup, cancellation of selection debounce, inert diff sidebar,
visibility-aware keyboard routing and guarded queued focus callbacks. Collapsed
diff j/k and arrows scroll the preview; diff paging and view controls remain usable.
Typecheck, 80 targeted DOM tests and 39 Bun tests passed. Debug build succeeded
with `CARGO_TERM_QUIET=true mise exec -- bun run tauri build --debug --no-bundle`.
Launched `target/debug/chilla --verbose README.md`; build and launch logs are under
`/tmp/chilla-folding-build.log` and `/tmp/chilla-folding-launch.log`.
Computer Use unavailable; native visual verification is not claimed. The foreground
test instance remained running and was then stopped. Independent `mise run lint-ts`
passed (94 files and both typechecks); `mise exec -- bun run test:dom` passed all
368 tests across 25 files. Independent review found no blocking defects. Existing
unrelated changes remain intact; no commit or push was performed.

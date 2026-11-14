# Yazi-style Browser Shortcuts Implementation Plan

**Status**: Completed
**Design Reference**: [Browser shortcuts](../../design-docs/specs/design-file-viewer-mode.md#yazi-style-browser-shortcuts)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

## Scope and Deliverables

Adapt existing sorting/filter/search controls to Yazi-style keys. No new Rust
commands, filesystem mutations, navigation remapping or dependencies.
Deliverables: FileBrowserPane sequence handling, PrDiffWorkspace filter alias,
workspace shortcut conflict handling/help and related DOM tests. Internal
sequence helper module is optional; no public IPC or type changes are needed.

| Task | Status | Dependencies |
| --- | --- | --- |
| 1: Design/plan and README alignment | Completed | None; parallelizable with implementation after contract |
| 2: TS implementation, help and focused regressions | Completed | Design contract |
| 3: Independent checks, debug build/launch, archival | Completed | 1 and 2 |

## Completion Criteria

- [x] All existing sorts use comma-prefix with uppercase reverse and reset alias.
- [x] s/S open name/content search without theme or save conflicts.
- [x] f and / reveal filters; existing navigation and Tree controls preserved.
- [x] Prefix popup lists valid keys/actions until choice or cancellation; focus/IME/modifier protection tested.
- [x] Help and README reflect new keys and context restrictions.
- [x] Independent checks and debug launch pass.

## Progress Log

### 2026-09-09
User requested two-key sequences, then broader Yazi-like behavior. Scope covers
existing sorting, recursive search and filter controls while retaining chilla
navigation, Git and document shortcuts. Required TS coding agent implements;
root owns documentation and independent checker verifies.
User then requested a prefix popup listing possible next keys. Popup replaces
the timed hint: no timeout, preserve focus, close on selection or cancellation.

Required TS agent completed runtime changes and 70 focused DOM tests; scoped
Biome and typecheck pass. Independent pre-check review confirmed capture-phase
ownership prevents global shortcuts from receiving consumed continuations.
Popup is informational, keeps original focus and lists all nine choices.
Window blur also cancels pending state. Final frozen-source independent
`CARGO_TERM_QUIET=true mise run verify` passed typechecks, Biome, Rust
formatting/Clippy, 39 Bun tests and 181 Rust tests. Full DOM rerun after final
modifier guards passed 215 tests across 18 files. Debug Tauri build succeeded
and latest binary launched as PID 92553, with an empty startup log at
`/tmp/chilla-yazi-shortcuts-final-launch.log`. Build log:
`/tmp/chilla-yazi-shortcuts-build.log`. Desktop-control tools unavailable;
automated and process-launch verification do not claim visual UI inspection.

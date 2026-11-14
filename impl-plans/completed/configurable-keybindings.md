# Configurable Keybindings Implementation Plan

**Status**: Completed
**Design Reference**: [Configurable Keybindings](../../design-docs/specs/design-file-viewer-mode.md#configurable-keybindings)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

## Deliverables and Dependencies

| Task | Deliverables | Status | Dependencies |
| --- | --- | --- | --- |
| 1 | Bounded Rust TOML loader, command registration, fixture tests | Completed | Agreed IPC; parallelizable |
| 2 | Typed invoke, effective keymap registry/sequence dispatcher, browser/workspace integration, dynamic popup/help, tests | Completed | Agreed IPC; parallelizable |
| 3 | README, example configuration, dependency review, independent checks and launch | Completed | Final verification depends on 1 and 2 |

## Contract

Use the exact config/IPC format in the design. Supported contexts: mgr and
workspace. Startup-only loading, no shell actions, no home-directory writes.
The built-in action vocabulary will be documented alongside the example file.
Public boundary is get_keymap_config with nullable path/error and optional
context/list fields; on and run accept strings or arrays of strings.

## Completion Criteria

- [x] HOME/XDG resolution and missing/malformed/oversized/nonregular file cases tested.
- [x] Single and sequence keys with modifier notation and custom prefix descriptions work.
- [x] Prepend/default-or-replacement/append precedence and noop work without legacy fallthrough.
- [x] Browser, diff and workspace defaults preserved; custom bindings actually invoke actions.
- [x] Typing, IME, focus/modal boundaries and invalid configuration are handled safely.
- [x] Help and README expose effective bindings, supported actions and restart semantics.
- [x] Dependency delta reviewed, mixed-stack verification passed, debug app rebuilt/launched.

## Progress Log

### 2026-09-09
User requests Yazi-like file-based customization under ~/.config/chilla, including
two-key sequences. Use a TOML parser already present in the lockfile; preserve
unrelated version/release work. Required Rust/TS coding agents implement with
an independent checker, while root owns docs and build/launch.

Rust source frozen after fmt/check/strict Clippy and eight fixture tests passed,
including the sample keymap. The dependency delta only promotes locked
toml 0.9.12 to a direct dependency with serde/parse features. No new versions
or packages. Audit retains baseline quick-xml RUSTSEC-2026-0194/0195 and
quinn-proto RUSTSEC-2026-0185 advisories; cargo-deny is unavailable. No unrelated
dependency upgrades were made.

Frontend integration migrates existing listeners into scoped action callbacks;
independent TS unit tests run in parallel. Initial 46 engine/controller cases
pass while app-level integration and final regression verification continue.
Root added example configuration, action catalog, warning styling and wrapping
for long sequence labels. Prefix/modal/typing and shadowed-help behavior are
reviewed before source freeze.

Final source frozen after 126 focused tests passed. Independent
`CARGO_TERM_QUIET=true mise run verify` passed typechecks, Biome, Rust formatting
and Clippy, 39 Bun tests and 189 Rust tests. Full `bun run test:dom` passed
271 tests across 21 files. Independent review has no remaining material findings.
Regression fixes cover Space normalization, prefix cancellation, focused-row
activation, native toolbar Tab and lazy root-load invalidation ordering.

`CARGO_TERM_QUIET=true bun run tauri build --debug --no-bundle` succeeded;
build log: `/tmp/chilla-keymap-build.log`. Launched
`/Users/taco/gits/tacogips/chilla/target/debug/chilla` with output redirected to
`/tmp/chilla-keymap-launch.log`; process remains running with an empty startup
log. Computer Use resolved an older installed window and could not uniquely
target the new standalone binary among duplicate bundle identifiers, so visible
verification of this build is not claimed. Home configuration was not modified.
Baseline dependency advisories above remain; no commit or push was performed.

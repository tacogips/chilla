# GitHub Diff Shorthand Implementation Plan

**Status**: Completed
**Design Reference**: [GitHub Diff Shorthand](../../design-docs/specs/command.md#github-diff-shorthand)
**Created**: 2026-09-10
**Last Updated**: 2026-09-10

Extend repository shorthand to existing commit and compare sources. No API or frontend changes.

## Tasks and Deliverables

### TASK-001: Parser and CLI
**Status**: Completed
**Parallelizable**: No
**Deliverables**: `src-tauri/src/github_pr_diff.rs` (`GitHubPrTarget::parse_shorthand(repository: &str, target: &str) -> AppResult<Self>`), `src-tauri/src/cli/mod.rs` usage and argument diagnostics.
- [x] Parse PR, commit, explicit commit, and branch compare targets with literal ref handling.
- [x] Preserve existing PR/cache/verbose compatibility and reject malformed inputs.

### TASK-002: Regression Verification
**Status**: Completed
**Parallelizable**: No (depends on TASK-001)
**Deliverables**: parser and CLI tests in their existing test modules.
- [x] Relevant Rust tests, formatting, check, and clippy pass.
- [x] Rebuild and launch the debug app; report visible verification limitations.

### TASK-003: Documentation
**Status**: Completed
**Parallelizable**: Yes
**Deliverables**: README shorthand examples and implementation-plan index.
- [x] Document syntax and numeric SHA disambiguation.
- [x] Record checks and archive completed plan.

## Progress Log

### Session: 2026-09-10
Design aligned with existing source variants. Implementation started; no changes to the IPC contract required.

Completed parser, help, README, and regression coverage. Independent verification passed
25 GitHub diff tests and 28 CLI tests, Cargo formatting/check, and `mise run lint-rust`.
`CARGO_TERM_QUIET=true mise exec -- bun run tauri build --debug --no-bundle` passed,
including TypeScript checking and frontend bundling (existing large-chunk warning).
Launched `/Users/taco/gits/tacogips/chilla/target/debug/chilla --verbose github:tacogips/chilla 157f2d3`
and `/Users/taco/gits/tacogips/chilla/target/debug/chilla --verbose github:tacogips/chilla '85a901e...main'`.
Logs: `/tmp/chilla-shorthand-commit.log`, `/tmp/chilla-shorthand-compare.log` (empty).
Commit test process was stopped; comparison process exited successfully.
Visible UI verification was unavailable because Computer Use tools were not exposed.

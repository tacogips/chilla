# Codebase File Splitting and Lint Cleanup Plan

**Status**: Completed
**Design Reference**: User maintenance request: split overly long files into meaningful units and fix lint issues
**Created**: 2026-07-01
**Last Updated**: 2026-07-01

## Scope

Refactor unusually long TypeScript and Rust files into named modules that preserve existing behavior. Fix lint, typecheck, and test failures surfaced during verification. This plan does not add new product behavior except where existing in-progress edits already introduced behavior that must be preserved by the split.

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| PR diff syntax highlighting | `src/features/pr-diff/prDiffSyntax.ts` | DONE | `bun run typecheck`; focused Vitest |
| PR diff workspace component | `src/features/pr-diff/PrDiffWorkspace.tsx` | DONE | `bun run typecheck`; focused Vitest |
| Large workspace shell split | `src/features/workspace/WorkspaceShell.tsx` | DONE | `bun run typecheck`; full Vitest |
| Large Rust viewer service split | `src-tauri/src/viewer/service.rs` | DONE | `cargo check`; `cargo test`; Clippy |
| Large GitHub PR diff Rust split | `src-tauri/src/github_pr_diff.rs` | DONE | `cargo check`; `cargo test`; Clippy |
| Lint and verification tooling | `Taskfile.yml`, `.agents/skills/tauri-lint-verify/`, `flake.nix`, `ign-template/tauri-v1` | DONE | `task verify`; skill validation; template check |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| PR diff syntax split | Existing PR diff syntax code | READY |
| Workspace shell split | PR diff split completed | READY |
| Rust module splits | Rust standards review | READY |
| Final lint cleanup | All touched modules | DONE |
| Lint task/template propagation | File split completion | DONE |

## Completion Criteria

- [x] Longest frontend files are reduced through meaningful modules with descriptive names
- [x] Longest Rust files are reduced through meaningful modules with descriptive names
- [x] Existing user-facing behavior is preserved
- [x] `bun run typecheck` passes
- [x] Relevant frontend tests pass
- [x] `CARGO_TERM_QUIET=true cargo check` passes after Rust edits
- [x] Relevant Rust tests pass after Rust edits
- [x] Rust/TypeScript lint task entry points and skill guidance are available
- [x] Tauri template receives equivalent lint tooling and validates

## Progress Log

### Session: 2026-07-01
**Tasks Completed**: Started current-state audit, created maintenance tracking plan, extracted PR diff syntax highlighting modules, extracted workspace shell helper modules, fixed formatter script globstar portability, guarded file-browser `scrollIntoView` in partial DOM environments, extracted viewer path/HTML/preview detection helpers, extracted viewer directory listing, and extracted GitHub diff parser/cache modules.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: `bun run typecheck`, `bun run test`, full Vitest DOM suite, `CARGO_TERM_QUIET=true cargo check --manifest-path src-tauri/Cargo.toml`, and `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml` pass. Vitest emits expected jsdom media-method notices while exiting successfully.

### Session: 2026-07-01 completion
**Tasks Completed**: Extracted workspace header, document column, feedback/loading UI, window helper, directory state helper, and PR diff browser-entry helper. Extracted GitHub diff metadata DTOs and conversion helpers. Verified all checks and debug build.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: Largest current source files are `WorkspaceShell.tsx` 1495 lines, `github_pr_diff.rs` 1444 lines, `PrDiffWorkspace.tsx` 1399 lines, `viewer/epub.rs` 1370 lines, and `viewer/service.rs` 1354 lines. `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` passes. `bun run tauri build --debug --no-bundle` passes. A debug binary launch was attempted; the process exited quickly with an empty log in this environment, while `target/debug/chilla --help` exits successfully.

### Session: 2026-07-01 lint tooling and template
**Tasks Completed**: Added `task lint-ts`, `task lint-rust`, and `task verify`; added deterministic lint helper scripts; added `tauri-lint-verify` skill guidance; added Biome as the frontend formatter/linter; regenerated `bun.lock` and `bun.nix`; added TypeScript and Biome tooling to the Nix dev shell; propagated the lint task/script/skill/settings additions to the Tauri template; refreshed and checked the Tauri template metadata.
**Tasks In Progress**: None.
**Blockers**: None.
**Notes**: `task lint`, `task verify`, `bun run test:dom`, skill validation for both skill folders, and Tauri template update/check commands pass. `nix build .#frontend --no-link` fails on the dirty worktree because Nix excludes the new untracked split files; the same build passes from a temporary full working-tree copy that includes those files.

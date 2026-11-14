# Shared Syntax Performance Implementation Plan

**Status**: Completed
**Design Reference**: [Shared Syntax Highlighting Performance](../../design-docs/specs/notes.md#shared-syntax-highlighting-performance)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

## Deliverables

- `src-tauri/examples/syntax_performance.rs` and nonprivate fixture support: reproducible language matrix, cold/warm timings, and aggregate output fingerprints.
- `src-tauri/src/syntax_highlight/`: shared highlighting/initialization optimization as justified by profiling; preserve public function signatures and existing JSON fast path.
- Cargo manifests/lockfile only if engine or build-time initialization changes prove worthwhile.
- `src-tauri/build.rs`: generate the combined default-plus-TOML packdump into Cargo's build output with explicit grammar invalidation.
- Regression tests and documented before/after results.

## Tasks

### TASK-001: Profile representative syntaxes
**Status**: Completed
**Parallelizable**: Yes (alongside dependency/source inspection)
- [x] Capture unchanged debug/release baseline across the language matrix.
- [x] Select common optimization from evidence and update design.

### TASK-002: Implement shared optimization
**Status**: Completed
**Parallelizable**: No (depends on TASK-001)
- [x] Improve supported non-JSON syntax performance without removing colors or text.
- [x] Preserve JSON, Markdown fences, embedded syntax, and both themes.
- [x] Validate dependency changes if any.

### TASK-003: Verify and document
**Status**: Completed
**Parallelizable**: Yes (after TASK-002)
- [x] Repeat controlled benchmarks; account for regressions.
- [x] Specialized independent verifier passes relevant tests, compilation, and lint.
- [x] Build/launch the desktop app on representative non-JSON input.
- [x] Update user docs and final evidence, archive plan.

## Progress Log

### 2026-09-09
- User requests equivalent performance improvements for other file syntaxes.
- Inspected current worktree; preserve previous JSON fix and unrelated existing edits.
- Current shared path uses syntect default-fancy and rebuilds the default SyntaxSet at first use to add TOML.
- Isolated baselines identify roughly 1.6 seconds debug global initialization, plus substantial per-language regex costs; real release Rust/CSS/TSX warm highlights take 75–182 ms for 25–55 KiB files.
- Selected build-time combined syntax dump and a measured native regex engine evaluation; exact design and dependency review recorded in design notes.
- Captured dark debug/release and light release baselines for 13 synthetic languages with source/HTML fingerprints. Larger (~256 KiB) release Rust/JavaScript/YAML samples take 0.76/1.16/1.62 seconds warm. Independent benchmark review and Clippy pass.
- Baseline raw metrics stored under `/tmp/chilla-syntax-performance.oaqHA9/`; fixture fingerprints are repository-owned regression artifacts.
- Implemented build-time linked syntax packdump and native regex engine for shared file/fence highlighting; no frontend contract changes. All 26 original small language/theme fingerprints and the large fixture fingerprints match exactly.
- Release grammar initialization improves from 169–186 ms to 0.59–0.84 ms. Warm 256 KiB Rust/JavaScript/YAML improve approximately 3x/3x/6x. TOML warm rendering has a documented approximately 1.6 ms tradeoff while first-load initialization improves substantially; plain text varies by 0.06 ms.
- Final native dependencies reviewed: onig 6.5.3 and onig_sys 69.9.3 only; no unrelated lockfile upgrades. Audit has zero vulnerabilities and the same 14 preexisting informational warnings. Bundled static native engine confirmed with macOS binary linkage inspection.
- Independent review clean; 11 syntax tests, 206 serial Rust library tests, locked all-target Clippy, release benchmark compilation, and full debug Tauri build pass. A preexisting parallel logging retention test flaked once and passed isolated/full serial retries.
- Real unchanged Rust/CSS/TSX files show release first highlights improve 316/378/427 ms to 26/56/52 ms; full evidence in the design reference.
- Launched the rebuilt debug app on `src-tauri/src/github_pr_diff.rs`; successful 339 ms command logged at `/Users/taco/Library/Logs/chilla/chilla-verbose-17598.log`. Output `/tmp/chilla-shared-syntax-launch.log`; build log `/tmp/chilla-shared-syntax-build.log`; test process stopped.
- Computer Use unavailable, so visible UI/paint time not claimed. Full-document DOM rendering remains a large-input limit; other operating systems not exercised locally. All requested local implementation and verification work complete, no commits/pushes.
- Continue local implementation with specialized agents; packaged workflow commit/push remains outside authorization.

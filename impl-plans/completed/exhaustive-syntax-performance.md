# Exhaustive Syntax Performance Implementation Plan

**Status**: Completed
**Design Reference**: [Exhaustive Syntax Optimization](../../design-docs/specs/notes.md#exhaustive-syntax-optimization)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

## Deliverables

- Complete backend grammar and frontend diff-kind inventory with aliases, detection behavior, hidden/embedded status, and fixture coverage.
- Reproducible exhaustive benchmarks and stage measurements with per-entry before/after results against the current optimized baseline.
- Further backend and frontend highlighting optimizations preserving source and style semantics.
- Tests enforcing inventory completeness, equivalent output, bounded reuse if present, and meaningful edge cases.
- User-facing documentation and verified app build/launch evidence.

## Tasks

### TASK-001: Backend inventory and profiling
**Status**: Completed
**Parallelizable**: Yes
- [x] Enumerate the actual generated grammar bundle and aliases.
- [x] Cover every grammar with identity-checked fixtures and baseline timings.
- [x] Profile parsing versus styling/HTML work and select improvements.

### TASK-002: Diff inventory and optimization
**Status**: Completed
**Parallelizable**: Yes (independent of backend)
- [x] Enumerate every SyntaxKind and path mapping.
- [x] Benchmark each kind and implement evidence-based improvements.
- [x] Preserve source/token semantics and test all kinds.

### TASK-003: Backend optimization
**Status**: Completed
**Parallelizable**: No (depends on TASK-001)
- [x] Improve work across the complete grammar inventory and JSON source path.
- [x] Preserve file/fence contracts, multiline state, themes, and escaping.
- [x] Separate first-use/uncached improvements from bounded reuse gains.
- [x] Record and account for every grammar's results.

### TASK-004: Independent verification and handoff
**Status**: Completed
**Parallelizable**: Yes (after implementation)
- [x] Audit complete inventory against authoritative source and benchmark coverage.
- [x] Rust/Bun tests, checks, and lint pass.
- [x] Rebuild/launch app and report visible-verification availability.
- [x] Final per-syntax report, README update, and completed plan archive.

## Progress Log

### 2026-09-09
- New goal explicitly requires enumerating and optimizing all supported syntaxes, beyond the previous 13-format sample.
- Current worktree retains prebuilt Syntect/Oniguruma optimization and JSON fast path, plus unrelated user edits.
- Identified separate frontend diff tokenizer with 28 SyntaxKind entries; include it in this pass.
- Continue local specialized-agent implementation; no commit/push authorization added.
- Frontend: all 28 diff kinds inventoried; 27 highlighted kinds improve warmed medians by 1.16–3.17x, plain retains its O(1) path. Single first-observed JSON pass regresses; reported separately without startup claims.
- Frontend verification: 58 exhaustive semantic tests, 345 DOM tests, 39 Bun tests, typecheck, and scoped Biome pass. Independent verifier repeats 58 tests, typecheck, and scoped lint successfully.
- Backend: 76 actual grammars (7 hidden) have scope-selected fixtures and both-theme baseline measurements. Profiling identifies parsing and scope styling as dominant; further implementation in progress.
- Complete inventory and diff measurements documented in design-docs/specs/design-syntax-inventory.md; backend after-results pending.
- Backend candidate now reuses per-theme highlighters and bounded per-render scope/style and HTML-opening calculations. At scope/depth limits it continues incrementally from the current parser state without restarting or caching source documents.
- Implementer reports 16 targeted tests passing, including exact 76-by-2 grammar/theme output fingerprints, original representative corpus, zero-width/Clear/Restore operations, cache limits, and midline fallback. Final performance report and independent verification remain pending.
- Independent Rust verification passes 211 serial library tests and all-target Clippy with warnings denied. No outstanding runtime correctness findings.
- Complete release after matrix recorded: summed paired medians 1830.97 to 1485.11 ms; seven dark cases over 5% slower retained visibly in report and receiving focused alternating-order checks. JSON source lexer remains on its already-optimized fast path rather than receiving redundant grammar work.
- Fifteen-sample alternating-order release checks do not reproduce six of the seven initial regressions; Textile differs by only +0.03 ms. Preserve both artifacts; additional Python timing is variable and must not be cherry-picked.
- Debug Tauri build succeeds and app opens a 9000-byte synthetic Python file, but first preview command takes 590 ms. This confirms a remaining debug-build cost; measure targeted dependency optimization while leaving application code debuggable before final launch/handoff.
- Completed targeted dependency-only debug profiles for Syntect/Oniguruma; Python warm after medians 17–20 ms, final direct debug preview command 62 ms. Variability, retained noisy runs, and small optimized-debug dark styling tradeoff are explicitly documented.
- Final independent checks, including subsequent source/footer/icon changes: 212 Rust tests, 351 DOM tests, 39 Bun tests, Clippy, typechecking, and scoped lint pass.
- Rebuilt and launched final debug code; native Computer Use confirms Python/JSON pane layout, source scrolling/footer, and toolbar icons. The user took over the isolated verification window, so it remains open. No paint-time or native zoom-key claim; automated zoom tests pass.
- Complete inventory, all per-grammar metrics, aliases/fallbacks, commands/logs, and limitations are documented in design-docs/specs/design-syntax-inventory.md. No commit or push performed.

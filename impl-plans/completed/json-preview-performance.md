# JSON Preview Performance Implementation Plan

**Status**: Completed
**Design Reference**: [JSON Preview Performance](../../design-docs/specs/notes.md#json-preview-performance)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

## Deliverables

- `src-tauri/examples/preview_performance.rs`: reproducible local benchmark accepting an explicit input path; output contains timings and aggregate sizes only.
- `src-tauri/src/syntax_highlight/`: measured bottleneck fix with unchanged `highlight_file_source(source: &str, path: &Path, ui: SyntaxUiTheme) -> String` contract.
- Synthetic regression tests for source preservation, escaping, relevant JSON edge cases, and existing language behavior.

## Tasks

### TASK-001: Measure the reproduction
**Status**: Completed
**Parallelizable**: No
- [x] Measure cold/warm highlighting, read, serialization, and backend preview times.

### TASK-002: Implement the measured fix
**Status**: Completed
**Parallelizable**: No (depends on TASK-001)
- [x] Address the measured bottleneck and cover regressions.
- [x] Repeat the same benchmark and document results.

### TASK-003: Verify and document
**Status**: Completed
**Parallelizable**: Yes (after TASK-002; independent verification and documentation)
- [x] Independent check-and-test agent passes relevant checks.
- [x] Rebuild and launch the app with the reproduction file.
- [x] Record UI verification availability and remaining limits.
- [x] Update user-facing documentation and archive the completed plan.

## Progress Log

### 2026-09-09
- Confirmed full-file Rust syntect highlighting and whole-HTML frontend insertion.
- Installed implementation workflow validates. Execution excluded because it includes unauthorized commit/push operations; local implementation and required specialized agents proceed.
- Preserve existing unrelated working-tree changes. Never include private JSON contents in artifacts.
- Same-source debug/release baselines confirm highlighting dominates; results and selected lexical highlighting design recorded in design notes.
- Implemented JSON-only linear source highlighting, preserving escaping and theme styles without adding dependencies. Original non-JSON behavior remains unchanged.
- Debug cold highlighting improves from 2,278 ms to 24 ms; release from 221 ms to 3.4 ms. Detailed benchmark results are in the design reference.
- Independent review, eight syntax tests, 23 viewer service tests, all-target check, Clippy, and rebuilt debug Tauri app pass.
- Launched `/Users/taco/gits/tacogips/chilla/target/debug/chilla --verbose /Users/taco/.claude.json > /tmp/chilla-json-performance-recheck.log 2>&1`; diagnostic log `/Users/taco/Library/Logs/chilla/chilla-verbose-1932.log` records successful 133 ms preview command. Test process stopped afterward. Initial launch output: `/tmp/chilla-json-performance-launch.log`.
- Computer Use unavailable; visible UI and paint-time checks not claimed. Full-document HTML still limits arbitrarily large inputs. App runtime timing remains higher than the isolated benchmark.

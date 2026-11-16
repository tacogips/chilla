# Pair View Multi-File: Rust Startup Classification And Source-Order Listing

**Status**: Ready
**Plan ID**: pair-multi-rust
**Wave**: 1 (no dependencies)
**Design Reference**: design-docs/specs/design-pair-view.md (Startup Classification, Rust Consumers, Startup Payload Contract, Source-Order Listing Contract, Validation/Rust)
**Created**: 2026-11-16
**Last Updated**: 2026-11-16

---

## Intent And Context

`chilla a b c` (two or more distinct regular files) must open pair view and
carry the whole ordered, deduplicated file list to the frontend. The pair
file list must render in CLI order across filtering and pagination. This plan
changes only the Rust side:

1. CLI classification (`src-tauri/src/cli/mod.rs:resolve_explicit_file_startup`):
   today pair needs `paths.len() == 2 && unique == 2`; three or more produce
   `StartupTarget::FileSet`. After this plan, any `unique >= 2` produces
   `FilePair`.
2. `BrowserRoot::FilePair` gains `source_order_paths`.
3. `list_explicit_file_set` gains an optional `source_order` flag. When the
   flag is true, the command keeps first-occurrence order and skips the sort.

The TypeScript side of the same contract is done in parallel by
`pair-multi-ts-contract`. Both sides ship together in one bundle.

## Pinned Contract (shared with pair-multi-ts-contract)

- `StartupTarget::FilePair { left: PathBuf, right: PathBuf, rest: Vec<PathBuf> }`
  (`src-tauri/src/cli/mod.rs`). `rest` holds unique files 3..n in order.
- `BrowserRoot::FilePair { left_file_path: String, right_file_path: String, source_order_paths: Vec<String> }`
  serialized with the existing `kind: "file_pair"` tag. The serialized JSON
  key is `source_order_paths`, and `source_order_paths[0..2] == [left, right]`.
- Tauri command `list_explicit_file_set(paths, sort, query, offset, limit, source_order: Option<bool>, state)`.
  The JS invoke key is `sourceOrder`: Tauri camelCases argument names, the
  same way `hide_git_ignored` becomes `hideGitIgnored` in
  `src/lib/tauri/document.ts:listDirectory`.

## Non-Goals

- No TypeScript edits. Do not touch `src/`.
- No new Tauri command. No change to `list_directory`, GitHub/Git diff
  detection, or macOS open-files handling.
- No change to the directory-argument error text or exit code.
- Do not edit README.md, design docs, or other plans.

## File-Level Changes

### `src-tauri/src/cli/mod.rs`
- `StartupTarget`: remove the `FileSet(Vec<PathBuf>)` variant. Change
  `FilePair` to `{ left, right, rest: Vec<PathBuf> }`.
- `resolve_explicit_file_startup` final `match` (about lines 420-441):
  - `0` unique stays the usage error.
  - `1` unique stays `File`.
  - `>= 2` unique becomes `FilePair`, taken from `ordered_unique_paths` in
    order: next, next, then the rest collected.
  - Remove the `paths.len() == 2` condition. Keep the existing
    `AppError::State` style for "missing" iterator results; do not `unwrap`.
- Help text (`usage` string, about line 460): replace the sentence
  "If two file paths are provided, chilla shows them side by side. If three or
  more file paths are provided, chilla opens file view mode with the left pane
  limited to those files." with exactly: "If two or more file paths are
  provided, chilla shows the first two side by side and lists all of them in
  the folded left pane; a file chosen in the list opens in the active pane."
- Update every other `match` on `StartupTarget` in this file that the
  compiler flags.

### `src-tauri/src/viewer/types.rs`
- `BrowserRoot`: remove `ExplicitFileSet { .. }`. Add
  `source_order_paths: Vec<String>` to `FilePair`.
- `ExplicitFileSetPage` stays unchanged.

### `src-tauri/src/viewer/service.rs`
- `startup_context`: remove the `FileSet` arm. The `FilePair` arm builds
  `source_order_paths` from `[left, right, rest...]` via `display_path`, in
  the same way as the removed `FileSet` arm.
- `list_explicit_file_set(&self, paths, sort, query, offset, limit, source_order: bool)`:
  add the `bool` parameter and forward it.

### `src-tauri/src/viewer/directory_listing.rs`
- `list_explicit_file_set(paths, sort, query, offset, limit, source_order: bool)`:
  keep dedup and the query filter as today. When `source_order` is true,
  skip the `match sort.field { ... sort_by ... }` block. Pagination
  (`page_bounds`) still runs after filtering.

### `src-tauri/src/commands/document.rs`
- `list_explicit_file_set` command: add `source_order: Option<bool>` as the
  last data argument, before `state`. Pass `source_order.unwrap_or(false)`.

### `src-tauri/src/verbose_log.rs`
- Startup-load path match (about line 315): remove the `FileSet` arm. The
  `FilePair { left, .. }` arm still returns `left`.
- Test near line 1580: replace the `FileSet` case with a `FilePair` case that
  has a non-empty `rest`, and assert that the marker is armed for `left`.

### Tests
- `src-tauri/src/cli/tests.rs`: update the assertions near lines 402 and
  831-935 (`FileSet` expectations, two-field `FilePair` patterns) to the new
  shape.
- `src-tauri/src/viewer/service/tests.rs` (around lines 145-200 and 239):
  rewrite the `FileSet` / `ExplicitFileSet` startup tests to `FilePair`.
  Pass `false` to `list_explicit_file_set`.
- `src-tauri/src/viewer/service/tests/startup_options_tests.rs` (about line
  39): replace the `FileSet` case with a `FilePair` case that has a non-empty
  `rest`.
- `src-tauri/src/viewer/directory_listing/tests.rs` (about line 352): pass
  `false` and add the source-order cases.

Patterns to imitate: the existing two-file pair tests in
`src-tauri/src/cli/tests.rs` (about lines 831-870) for temp-file setup, and
`directory_listing/tests.rs:canonicalized_explicit_file_set_entries_are_not_symlinks`
for listing tests.

## Test Cases (input -> expected)

- CLI `a b` -> `FilePair { left: a, right: b, rest: [] }`. `b a` -> reverse.
- CLI `a b c` -> `FilePair { left: a, right: b, rest: [c] }`.
- CLI `a b a` -> `FilePair { left: a, right: b, rest: [] }`.
- CLI `z a m z` (files named z.png, a.png, m.png) ->
  `FilePair { left: z, right: a, rest: [m] }`.
- CLI `a a`, `a ./a`, `a a a` -> `File(a)`.
- CLI directory + file -> existing usage error, exit code 2.
- CLI local Git dir + commit-ish -> still `GitDiff`.
- Startup context for `FilePair{a,b,[c]}` -> serialized JSON has
  `kind: "file_pair"`, `left_file_path: a`, `right_file_path: b`,
  `source_order_paths: [a,b,c]`, `initial_mode: "file_view"`.
- Listing `[z.png, a.png, m.png, z.png]`, name-asc sort, `source_order=true`,
  limit 200 -> names `z.png, a.png, m.png`, `total_entry_count == 3`.
- Same, limit 2: offset 0 -> `z.png, a.png`, `has_more == true`; offset 2 ->
  `m.png`, `has_more == false`.
- Filter case: files `zeta.png, alpha.png, mezza.png` (in that order),
  `source_order=true`, query `"z"` -> `zeta.png, mezza.png` (source order;
  `alpha.png` is filtered out).
- Same paths, `source_order=false` -> name-ascending `a.png, m.png, z.png`
  (unchanged behavior).
- Verbose startup-load marker for `FilePair{left,right,rest:[x]}` arms `left`.

## Invariants

- `File`, directory, current-directory, GitHub, and Git-diff classification
  are unchanged.
- `source_order` absent or false gives byte-identical behavior to today.
- A `FilePair` can never have fewer than two files (enforced by its type).
- No `unwrap`/`expect` in non-test code (rust-coding-standards).

## Overwrite Safety

Before each edit, re-read the target file fresh. Record `shasum -a 256` of
every owned file at start in the progress log. If a file changed between
your read and your write (drift), re-read it and re-apply only your intent.
Never touch files outside `writePaths`.

## Verification (run from repository root)

1. `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
   -> exit 0, no warnings. In particular, no dead-code warning for removed
   variants.
2. `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml`
   -> exit 0. The new CLI, service, listing, and verbose_log tests pass.
3. `CARGO_TERM_QUIET=true cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
   -> exit 0.
4. `grep -rn "StartupTarget::FileSet\|BrowserRoot::ExplicitFileSet" src-tauri/src`
   -> no output.

Record the exit status of each command in the progress log.

## Completion Criteria

- [ ] `StartupTarget::FileSet` and `BrowserRoot::ExplicitFileSet` removed;
      `FilePair` has `rest` and `source_order_paths`.
- [ ] Classification is `unique >= 2 -> FilePair`; help text updated.
- [ ] `list_explicit_file_set` has `source_order`, sort skipped when true.
- [ ] All listed test cases are present and passing.
- [ ] Verification commands 1-4 pass.
- [ ] Progress log updated.

## Progress Log

### Session: 2026-11-16
**Tasks Completed**: Plan created.
**Notes**: Not started.

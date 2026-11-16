# Pair Compare: Rust CLI `--compare`, Classification Revert, Pair-List Payload

**Status**: Ready
**Plan ID**: pair-compare-rust
**Wave**: 1 (dependsOn: none)
**Design Reference**: design-docs/specs/design-pair-view.md (Compare CLI, Startup Classification, Startup Payload Contract, Validation/Rust); design-docs/specs/command.md
**Created**: 2026-11-16
**Last Updated**: 2026-11-16

---

## Intent And Context

The user rejected the earlier "active pane + individual file list" model. The
working tree still holds uncommitted Rust changes for that model: 3+ files
open pair view, `FileSet` / `ExplicitFileSet` removed, and a `source_order`
option on `list_explicit_file_set`. All of those Rust changes are rejected.

This plan:

1. Restores the Rust files listed below to the baseline commit `9aa3772`
   (0.4.0 behavior).
2. Adds `chilla --compare LEFT..RIGHT [SPEC ...]`.
3. Changes the pair startup target and the `file_pair` payload so they carry
   an ordered, non-empty list of pairs.

The TypeScript side of the payload is done in parallel by
`pair-compare-ts-contract`. Both ship in one bundle.

## Pinned Contract (shared with pair-compare-ts-contract)

- `src-tauri/src/cli/mod.rs`:
  - `pub struct FilePairPaths { pub left: PathBuf, pub right: PathBuf }`,
    deriving `Debug, Clone, PartialEq, Eq`.
  - `StartupTarget::FilePairs { first: FilePairPaths, rest: Vec<FilePairPaths> }`
    replaces `FilePair`. The type guarantees at least one pair.
  - `StartupTarget::FileSet(Vec<PathBuf>)` is restored.
- `src-tauri/src/viewer/types.rs`:
  - `pub struct FilePairEntry { pub left_file_path: String, pub right_file_path: String }`,
    deriving `Debug, Clone, Serialize` with the default snake_case field names.
  - `BrowserRoot::FilePair { pairs: Vec<FilePairEntry> }`, keeping the
    existing `kind` tag.
  - `BrowserRoot::ExplicitFileSet { file_count, selected_file_path, source_order_paths }`
    is restored exactly as in `9aa3772`.
- Serialized JSON shape:
  `{"kind":"file_pair","pairs":[{"left_file_path":"/abs/a","right_file_path":"/abs/b"}]}`.
  The top-level `left_file_path` / `right_file_path` are gone.
- The Tauri command `list_explicit_file_set` has the `9aa3772` signature
  (no `source_order`).

## Non-Goals

- No TypeScript edits. Do not touch `src/`, `README.md`, design docs, or
  other plans.
- No change to GitHub / Git diff detection, directory startup, macOS
  open-files, or `list_directory`.
- Do not use `std::env::set_current_dir` in tests. It is process-global and
  races with parallel tests.
- No filtering, sorting, or runtime editing of pairs.

## File-Level Changes

Step 0, baseline: for each path in writePaths, read
`git show 9aa3772:<path>` and diff it against the working tree.

- Restore `9aa3772` content for these files (the working-tree changes there
  are all rejected):
  - `commands/document.rs`
  - `viewer/directory_listing.rs`
  - `viewer/directory_listing/tests.rs`
- In these files, start from the `9aa3772` content and then apply only the
  edits listed below:
  - `cli/mod.rs`
  - `cli/tests.rs`
  - `viewer/types.rs`
  - `viewer/service.rs`
  - `viewer/service/tests.rs`
  - `viewer/service/tests/startup_options_tests.rs`
  - `verbose_log.rs`

Use `git show` (read-only) only. Do not run `git checkout`, `git restore`,
`git stash`, or any other git command that changes the index or the working
tree.

### `src-tauri/src/cli/mod.rs`

- Add `FilePairPaths` and replace `FilePair` with `FilePairs` (Pinned
  Contract).
- `resolve_explicit_file_startup` keeps the `9aa3772` match:
  - `paths.len() == 2 && unique == 2` gives
    `FilePairs { first: FilePairPaths { left, right }, rest: vec![] }`.
  - Two or more unique files otherwise give `FileSet`.
- `parse_normalized_cli`: right after `args.remove(0)` and before the
  `github:` check, check whether `args.first() == Some("--compare")`. If so,
  return `parse_compare_arguments(&args[1..], &current_dir)`, wrapped with
  `run_outcome`.
  - `current_dir` comes from `std::env::current_dir()`, mapped to
    `AppError::io` the same way as the existing bare-startup branch.
  - When the first argument is not `--compare` but any later argument equals
    `--compare`, return the usage error:
    `--compare must be the first argument and cannot be combined with positional paths`.
- New private functions:
  - `fn parse_compare_arguments(specs: &[OsString], cwd: &Path) -> AppResult<StartupTarget>`
  - `fn resolve_compare_spec(spec: &str, cwd: &Path) -> AppResult<FilePairPaths>`
- Rules (design "Compare CLI"):
  - Empty `specs`: usage error `--compare requires at least one LEFT..RIGHT SPEC`.
  - A non-UTF-8 SPEC: usage error, the same as the existing UTF-8 path
    message.
  - Collect every `..` byte index with `spec.match_indices("..")`. Note that
    `match_indices` does NOT return overlapping matches. Instead, iterate
    `i in 0..spec.len().saturating_sub(1)` and use
    `spec.as_bytes()[i..i + 2] == *b".."`. Overlapping matches are required:
    `....` has split points 0, 1, and 2.
  - Skip a candidate when either side is empty.
  - Resolve a relative side as `cwd.join(side)`; use an absolute side as is.
  - A candidate is valid when `fs::metadata(resolved)` succeeds and
    `is_file()` is true. Record the metadata I/O with `verbose_log::record_io`
    the same way `resolve_explicit_file_startup` does.
  - Zero valid candidates: usage error
    `--compare SPEC "<spec>" does not name two existing files (expected LEFT..RIGHT)`.
  - Two or more valid candidates: usage error
    `--compare SPEC "<spec>" is ambiguous: ` followed by every split rendered
    as `"<L>" .. "<R>"`, joined by `, `.
  - Canonicalize both sides with `fs::canonicalize`, recording the I/O as the
    existing code does.
  - If both canonical paths are equal: usage error
    `both sides of --compare SPEC "<spec>" are the same file`.
  - Dedup on canonical `(left, right)`, keeping the first occurrence.
    `a..b` and `b..a` are different pairs.
  - The result is `FilePairs { first, rest }`.
- All errors are `AppError::cli_usage(message, 2)`. Use no `unwrap` /
  `expect` outside tests. Turn impossible states into `AppError::State`, as
  the existing code does.
- `help_text`:
  - Add the usage line
    `{binary_name} [--verbose] [--csv-first-row-header=true|false] --compare <left>..<right> [<left>..<right> ...]`.
  - Keep the `9aa3772` two-file / three-file sentence and append:
    `--compare LEFT..RIGHT [LEFT..RIGHT ...] opens each pair in a pair list; each SPEC must split at exactly one ".." into two existing files.`

### `src-tauri/src/viewer/types.rs`

- Apply the Pinned Contract.

### `src-tauri/src/viewer/service.rs`

- Restore the `FileSet` arm and the `9aa3772` `list_explicit_file_set` (no
  source order).
- The `FilePairs` arm builds `BrowserRoot::FilePair { pairs }` from `first`
  followed by `rest`, using `display_path` (the existing helper in
  `viewer/path_utils.rs`) for every path.
- `initial_mode` is `FileView`. Keep the existing `file_open_options`
  pass-through.

### `src-tauri/src/verbose_log.rs`

- Restore the `FileSet` arm.
- The startup-load path returns `first.left` for `FilePairs`.
- Update the existing pair test fixture (around line 1578) to the new
  variant.

## Invariants

- `chilla a` (one file), directories, `a a`, GitHub URL, `github:` shorthand,
  `<git_dir> <rev>`, `--help`, and `--version` behave exactly as in
  `9aa3772`.
- `--verbose` and `--csv-first-row-header=...` can appear anywhere around
  `--compare`, because `normalize_cli` strips them first.
- `--compare` is never treated as a path or reported as an "unsupported flag".

## Tests To Add Or Update (`cli/tests.rs` unless noted)

Use the existing `TEST_DIR_COUNTER` temp-dir helper pattern (cli/tests.rs
around line 198). Use absolute paths for `parse_cli`, and call
`resolve_compare_spec` / `parse_compare_arguments` directly with a `cwd` for
relative cases.

- `--compare A..B C..D` (absolute) -> `FilePairs` with first `(A,B)` and
  rest `[(C,D)]`.
- `--compare A..B A..B` -> one pair.
  `--compare A..B <dir>/./A_name..B` (same canonical file) -> one pair.
  `--compare A..B B..A` -> two pairs.
- With cwd `<root>/sub` and files `<root>/x.png` and `<root>/y.png`,
  `resolve_compare_spec("../x.png..../y.png", cwd)` -> canonical x and y.
- With files `a`, `.b`, `a.`, and `b` in cwd, `a...b` -> error with exit
  code 2, and the message contains both `"a" .. ".b"` and `"a." .. "b"`.
- `x..missing`, `nodots`, and `file..<dir>` -> error with exit code 2, and
  the message contains the SPEC.
- `--compare` alone -> exit code 2. `chilla A --compare B..C` -> exit code 2.
  `--compare A..A` -> exit code 2.
- `--verbose --compare A..B` and `--compare A..B --csv-first-row-header=true`
  -> `FilePairs`, with `csv_first_row_as_header == true` in the second case.
- Positional cases (restore the `9aa3772` tests, around line 842):
  - `A B` -> `FilePairs` with one pair and empty rest.
  - `A A` -> `File`.
  - `A B C` and `A B A` -> `FileSet`.
  - A directory plus a file -> the existing usage error.
- `viewer/service/tests.rs`: a two-pair `FilePairs` serializes as
  `kind == "file_pair"` with `pairs[0].left_file_path`,
  `pairs[1].right_file_path`, `initial_mode == "file_view"`, and no top-level
  `left_file_path` key. A `FileSet` context serializes as
  `explicit_file_set` (restored test).
- `startup_options_tests.rs`: update the pair fixtures to `FilePairs`.
- `verbose_log.rs` test: the startup-load path for `FilePairs` is
  `first.left`.

## Verification (run from repo root; record exit code and full output path)

- `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` -> exit 0.
- `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml` -> exit 0, including the new compare tests.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` -> exit 0. Format only the owned files if needed.
- `git diff 9aa3772 -- src-tauri/src/commands/document.rs src-tauri/src/viewer/directory_listing.rs src-tauri/src/viewer/directory_listing/tests.rs` -> empty.

## Concurrency And Drift Rules

- Re-read each file immediately before editing it. Record its sha256 before
  and after the edit in the progress log.
- If a file outside writePaths changed unexpectedly, do not edit it. Report
  the drift.

## Completion Criteria

- [ ] Rust files restored to `9aa3772` except for the listed edits
- [ ] `--compare` parsing and errors implemented per design
- [ ] `FilePairs` / `FilePairEntry` contract implemented
- [ ] All listed tests added or updated and passing
- [ ] clippy, cargo test, and fmt check pass

## Progress Log

### Session: 2026-11-16
**Tasks Completed**: Plan created
**Notes**: Supersedes pair-multi-rust.

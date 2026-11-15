# Pair View: Rust Startup Classification And Payload

**Status**: Ready
**Plan ID**: pair-view-rust-startup
**Wave**: 1 (no dependencies)
**Design Reference**: design-docs/specs/design-pair-view.md (Startup Classification, Rust Consumers Of The New Variant, Startup Payload Contract, Validation)
**Created**: 2026-11-15
**Last Updated**: 2026-11-15

---

## Intent And Context

Running `chilla a.png b.png` should open a side-by-side pair view. On the Rust
side this needs three things: a new startup target, a new `BrowserRoot`
variant serialized to the frontend, and an updated help text. Every other
startup form must stay byte-for-byte unchanged.

Current state: `resolve_explicit_file_startup`
(`src-tauri/src/cli/mod.rs:351-430`) canonicalizes and deduplicates the
paths, then returns `File` for 1 unique file and `FileSet` for 2 or more.
`ViewerService::startup_context` (`src-tauri/src/viewer/service.rs:51-110`)
maps targets to a `StartupContext`.

## Pinned Contract (consumed by pair-view-workspace-integration)

- `StartupTarget::FilePair { left: PathBuf, right: PathBuf }`, a named-field
  variant in `src-tauri/src/cli/mod.rs` `StartupTarget`.
- `BrowserRoot::FilePair { left_file_path: String, right_file_path: String }`
  in `src-tauri/src/viewer/types.rs`. With the existing
  `#[serde(tag = "kind", rename_all = "snake_case")]` it serializes as
  `{"kind":"file_pair","left_file_path":"...","right_file_path":"..."}`.
  Verify the tag is exactly `file_pair` in a test. Do not add a serde rename
  unless the test shows otherwise.
- `StartupContext.initial_mode` = `WorkspaceMode::FileView`, and
  `file_open_options` is passed through.

## Non-Goals

- No new Tauri command, no change to `list_explicit_file_set`,
  `directory_listing.rs`, `commands/document.rs`, or `lib.rs`.
- No change to canonicalization, the directory rejection message or exit code
  2, the non-regular-file error, first-occurrence deduplication, or
  GitHub/Git-diff precedence (`parse_git_diff_startup_pair` runs before path
  handling and stays untouched).
- No macOS open-files / Apple Event changes.
- Do not touch any TypeScript file.

## File-Level Changes

### `src-tauri/src/cli/mod.rs`

- Add the `FilePair { left, right }` variant to `StartupTarget`.
- In `resolve_explicit_file_startup`, keep the loop unchanged. Replace only
  the final `match ordered_unique_paths.len().cmp(&1)` with a classification
  on `P = paths.len()` (the positional count passed in from line 266) and
  `U = ordered_unique_paths.len()`:
  - `U == 0`: existing usage error, same text.
  - `U == 1`: `File` (any `P`).
  - `P == 2 && U == 2`: `FilePair { left: first, right: second }` in
    first-occurrence order.
  - otherwise (`U >= 2`): `FileSet(ordered_unique_paths)`.
- Pitfall: do NOT classify on `U == 2` alone. `a b a` (P=3, U=2) must stay
  `FileSet([a, b])`.
- Pitfall: avoid indexing panics. Destructure the two-element vector (for
  example with a slice pattern or `into_iter`). Do not use `[0]`/`[1]` with
  `unwrap`. Follow the existing `ok_or_else(AppError::State(..))` style
  (current `Equal` arm) if an impossible branch needs an error.
- `help_text`: replace the sentence "If two or more file paths are provided,
  chilla opens file view mode with the left pane limited to those files."
  with "If two file paths are provided, chilla shows them side by side. If
  three or more file paths are provided, chilla opens file view mode with the
  left pane limited to those files." Leave every other help line unchanged.

### `src-tauri/src/viewer/types.rs`

- Add the `FilePair` variant to `BrowserRoot`, after `ExplicitFileSet`.

### `src-tauri/src/viewer/service.rs`

- Add a `StartupTarget::FilePair { left, right }` arm in `startup_context`.
  Imitate the `FileSet` arm (`display_path(p.as_path())`) and produce
  `BrowserRoot::FilePair`. Do not re-canonicalize; the paths are already
  canonical, the same as for `FileSet`.

### `src-tauri/src/verbose_log.rs`

- `startup_load_path` (around line 313): add
  `StartupTarget::FilePair { left, .. } => Some(left.as_path())`.

### Tests

- `src-tauri/src/cli/tests.rs`:
  - Update `parses_multi_file_startup_targets` (around line 813). Its
    two-file assertion now expects `FilePair`. Add or keep a three-distinct-file
    case that expects `FileSet` in argument order.
  - New cases, using the tempdir/file helpers from the existing multi-file
    tests:
    - `a b` -> `FilePair { left: a, right: b }`
    - `b a` -> `FilePair { left: b, right: a }`
    - `a b c` -> `FileSet([a, b, c])`
    - `a b a` -> `FileSet([a, b])`
    - `a a`, `a ./a`, `a a a` -> `File(a)`. Extend
      `multi_file_startup_duplicate_paths_fall_back_to_single_file`
      (around line 941).
    - `--verbose a b` and `--csv-first-row-header=true a b` -> `FilePair`
      (options do not count toward P).
  - `multi_file_startup_rejects_directory_arguments` (around line 965) still
    passes unchanged. Add `dir file` with exactly two args -> the same usage
    error and exit code 2.
  - Existing Git-diff two-argument tests (`<git_dir> <commit>`) still pass
    unchanged.
  - Help-text test, if one asserts the old sentence: update it to the new
    sentence.
- `src-tauri/src/viewer/service/tests.rs`: a new test, modeled on the
  `FileSet` startup-context test (around lines 160-175), asserts that
  `FilePair` gives `initial_mode == FileView`, `BrowserRoot::FilePair` with
  both display paths, and `serde_json::to_value` has `kind == "file_pair"`,
  `left_file_path`, and `right_file_path`.
- `src-tauri/src/viewer/service/tests/startup_options_tests.rs`: add a
  `FilePair` row to the existing options table (line 32 pattern) so that
  `file_open_options` passes through.
- `src-tauri/src/verbose_log.rs` test
  `startup_load_path_selects_file_and_first_file_set_path`: add a `FilePair`
  assertion that it returns the left path.

## Invariants

- `StartupTarget` matches stay exhaustive. No `_ =>` wildcard is added.
- Output for 0 and 1 unique files, 3 or more positional files, directories,
  and GitHub/Git targets is identical to before.

## Overwrite Safety

Wave 1 runs in parallel with plans that touch only TypeScript, so this plan's
files are not shared. Still, before each edit, freshly read the file, record a
`shasum -a 256` pre-hash, and re-hash after the edit. If a pre-hash differs
from the last read, stop and re-read; do not overwrite foreign changes.

## Verification (run from repository root)

1. `CARGO_TERM_QUIET=true cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
   must exit 0 with no warnings.
2. `NEXTEST_STATUS_LEVEL=fail NEXTEST_FAILURE_OUTPUT=immediate-final NEXTEST_HIDE_PROGRESS_BAR=1 CARGO_TERM_QUIET=true cargo nextest run --manifest-path src-tauri/Cargo.toml`
   must exit 0. The new cases above must appear and pass. Run
   `... cargo nextest run --manifest-path src-tauri/Cargo.toml cli::` to show
   that the classification tests ran.
3. `CARGO_TERM_QUIET=true cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
   must exit 0.
4. `grep -n "If two file paths are provided" src-tauri/src/cli/mod.rs` must
   return one match.

## Completion Criteria

- [ ] `StartupTarget::FilePair` and `BrowserRoot::FilePair` exist with the
      pinned shapes
- [ ] Classification uses P and U as specified; `a b a` gives `FileSet`
- [ ] verbose_log arms the left path
- [ ] Help text updated
- [ ] All listed tests added or updated; clippy, nextest, and fmt pass
- [ ] Progress log below updated

## Progress Log

(Implementer appends a session entry here: date, tasks done, command exit
statuses.)

# Link Navigation: Rust mailto Sanitizer Fix Implementation Plan

**Status**: Completed
**Completion**: 2026-11-19. Adversarial review accepted (comm-019097). Serial reconciliation gates passed (`tmp/link-nav-history-20261119-01/serial-reconcile-wave-001/`). Archived to `impl-plans/completed/link-nav-rust-mailto.md`.
**Plan ID**: link-nav-rust-mailto
**Wave**: 1 (no dependencies)
**Design Reference**: design-docs/specs/design-link-navigation-history.md#rust-change
**Created**: 2026-11-19
**Last Updated**: 2026-11-19

---

## Intent And Context

The Markdown link sanitizer rewrites every link whose scheme is not
`http`/`https` to `#`. As a result `[mail](mailto:a@b.c)` renders as `href="#"`,
and external mailto links are broken.

The design requires link URLs (not media URLs) to accept `mailto` as well. The
frontend already opens `mailto:` through `openUrl`, and `opener:default`
already permits it.

Relevant code in `src-tauri/src/markdown/mod.rs`:

- `sanitize_markdown_link_url` calls `is_safe_link_url`, which calls
  `is_safe_url(value, false)`.
- `sanitize_markdown_media_url` calls `is_safe_media_url`, which calls
  `is_safe_url(value, true)`.
- The scheme check is in `is_safe_url`:
  `matches!(&lower[..scheme_end], "http" | "https")`.
- Unit tests are in the `#[cfg(test)] mod tests` block at the end of the same
  file.

## Non-Goals

- No change to media URL rules: `mailto` must stay rejected for images and
  media.
- No `tel`, `file`, `ftp` or Windows path support.
- No change to the raw HTML sanitizers (`sanitize_raw_paragraph_tag`,
  `sanitize_raw_img_tag`).
- No Tauri command, capability, `Cargo.toml` or `Cargo.lock` change.

## Deliverables

### `src-tauri/src/markdown/mod.rs`

- Make the scheme allow-list depend on whether the URL is a link or media,
  with the smallest edit. Either:
  - add a parameter to `is_safe_url` (for example `allow_mailto: bool`), or
  - have `is_safe_link_url` accept `mailto` before delegating.

  Link URLs allow `http | https | mailto`. Media URLs keep `http | https`.
  Matching is case-insensitive, which the existing `lower` already provides.
- Keep every existing rule: empty input or `//` is rejected; `data:` is
  allowed for media images only; no scheme means allowed.
- Tests to add in `mod tests`, imitating the existing render assertions near
  `rendered.html.contains("<h1 id=\"intro\">Intro</h1>")`:
  - `[m](mailto:a@b.c)` -> html contains `href="mailto:a@b.c"`.
  - `[m](MAILTO:a@b.c)` -> href is kept (case-insensitive).
  - `[x](javascript:alert(1))` -> html contains `href="#"`.
  - `![i](mailto:a@b.c)` -> the image src is sanitized to empty, the same as
    any other disallowed media scheme today.
  - `[r](./other.md#sec)` -> href is kept unchanged (regression).

## Invariants

- The public render API signatures are unchanged.
- No other file is edited.

## Verification

Run from `src-tauri/`:

- `CARGO_TERM_QUIET=true cargo check` -> exit 0.
- `CARGO_TERM_QUIET=true cargo clippy --all-targets -- -D warnings` -> exit
  0. If the repository's clippy task uses different flags, use `mise run
  clippy` and record that.
- `NEXTEST_STATUS_LEVEL=fail NEXTEST_FAILURE_OUTPUT=immediate-final NEXTEST_HIDE_PROGRESS_BAR=1 CARGO_TERM_QUIET=true cargo nextest run markdown`
  -> exit 0, and the new tests are listed as passed.
- `CARGO_TERM_QUIET=true cargo fmt -- --check src/markdown/mod.rs`
  (or `cargo fmt --check`) -> no diff for the owned file.

Record each command's exit status in the progress log.

## Completion Criteria

- [x] Link sanitizer accepts mailto; media sanitizer unchanged
- [x] 5 new tests pass
- [x] cargo check, clippy and nextest exit 0

## Progress Log

### Session: 2026-11-19
**Tasks Completed**: Plan created
**Notes**: Edit only `src-tauri/src/markdown/mod.rs`. Read the file fresh
before editing and record its hash before and after the edit. If the file
changed unexpectedly, stop and report the drift.


### Session: 2026-11-19 implementation
**Tasks Completed**: Case-insensitive mailto links, unchanged media rules, and five regression tests. Formal review and integration remain downstream.

**Source edit SHA256** (`src-tauri/src/markdown/mod.rs`):
- Initial implementation: `13b0e3da8381768b02db804d7a9897d49eedf8d9ed6a0c9ae53521d734a51f79` -> `a49e918bd978e7a33b9ad46415e35a20a68ca828d7525bb568681fdb97670919`.
- Test import: `a49e918bd978e7a33b9ad46415e35a20a68ca828d7525bb568681fdb97670919` -> `6bef5708898c2a8db2fa149dbbbebfd0b5694d17da316b5bfa44e97330fe5eed`.
- Assertion type correction: `6bef5708898c2a8db2fa149dbbbebfd0b5694d17da316b5bfa44e97330fe5eed` -> `f150588a4597a466430928f97037c8866e923b71713bf3cda244a02883aab862`.
- An independently observed formatting-only change produced final source hash `1daa2158b2199696fc7e0c4d03136c5fd1d96bb81400166aba2a70b967ab4369`; its origin was not established. Fresh diff review confirmed the intended assertion formatting and no lost changes.

**Verification**: With `CARGO_TARGET_DIR=/tmp/chilla-link-nav-rust-mailto-check` and `CARGO_TERM_QUIET=true`, `cargo check` and `cargo clippy --all-targets -- -D warnings` exited 0; `cargo nextest run markdown` with the prescribed nextest environment exited 0 (27 passed, 0 failed). `CARGO_TERM_QUIET=true cargo fmt --check` exited 0. Complete final and prior logs are in `tmp/link-nav-history-20261119-01/link-nav-rust-mailto/check-unique/`. All checks ran on a shared moving tree; serial reconciliation owns final workspace-wide gates.

**Plan edit SHA256**: before `bd29d019716c1ce104cd74f11745904526d6b2734724be1e4a7542d5c9be63b6`; after hash recorded in `tmp/link-nav-history-20261119-01/link-nav-rust-mailto/plan-update-01/after.sha256` to avoid a self-referential hash.

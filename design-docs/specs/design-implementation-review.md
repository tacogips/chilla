# chilla Implementation and Specification Review

This document is a review of the current chilla implementation and specification. It
enumerates problems, risks, and improvement opportunities discovered by reading the
source under `src-tauri/` and `src/`, cross-checked against the README and the design
docs under `design-docs/specs/`. It intentionally contains no implementation changes;
it is a planning and prioritization artifact.

## Overview

chilla is a Tauri 2 + Bun + Solid.js desktop file/Git viewer. The Rust backend
(`src-tauri/`) owns CLI parsing, directory listing, file classification, Markdown and
EPUB rendering, syntax highlighting, filesystem watching, a local media-streaming HTTP
server, and GitHub/local Git diff loading. The Solid.js frontend (`src/`) owns the
workspace shell, file browser, preview panes, diff workspace, keyboard shortcuts, and
theme management.

The codebase is generally well-structured and well-tested (unit tests colocated with
most Rust modules; Vitest suites for frontend units; a Linux WebDriver smoke test).
The findings below are therefore mostly about hardening, contract consistency, and
specification drift rather than gross defects.

Severity legend used throughout:

| Severity | Meaning |
|----------|---------|
| High | Security exposure, data-loss, or user-facing correctness risk worth prioritizing |
| Medium | Correctness, robustness, or maintainability issue with a realistic trigger |
| Low | Polish, consistency, or documentation-quality issue |

---

## 1. Security Findings

### 1.1 Media stream server binds a token-guarded local HTTP port with permissive CORS (High)

Reference: `src-tauri/src/media_stream.rs`

The media stream service binds a TCP listener on `127.0.0.1:0` and serves file bytes
for any request matching `/media/<token>`, where the token is a Blake3 hash seeded from
PID + timestamp + counter (`new_entry_token`, `new_token_seed`). Every response sets
`Access-Control-Allow-Origin: *` (`CORS_ALLOW_ORIGIN`).

Concerns:

- The server is an unauthenticated local HTTP endpoint that streams arbitrary
  registered files. Any process/page able to reach `127.0.0.1:<port>` and guess or
  observe a token can read the corresponding file. Tokens are 256-bit Blake3 and are
  effectively unguessable, so the practical risk is low, but the design relies entirely
  on token secrecy plus loopback binding. The token is also logged to stderr
  (`eprintln!("[media-stream] register ... url=...")`), so anything with access to the
  process stderr/log stream learns a working URL.
- `Access-Control-Allow-Origin: *` is broader than necessary. The only legitimate
  consumer is the app's own WebView origin. Wildcard CORS combined with a predictable
  URL shape (`http://127.0.0.1:<port>/media/<token>`) widens the surface if a token
  ever leaks into rendered content or logs.
- Entries are never evicted (`entries` is an ever-growing `HashMap`). A long session
  that opens many media files leaks registrations and keeps file handles' canonical
  paths resolvable for the process lifetime.

Improvements to evaluate:

- Drop token logging to stderr, or gate it behind a debug flag.
- Constrain CORS to the actual WebView origin instead of `*`, or drop the header for
  same-origin `tauri://`/`http://localhost` consumption where it is not required.
- Add an eviction/replacement policy (e.g. cap entries, drop the previous entry for the
  same path, or clear on document/preview switch).
- Consider a per-process random path prefix in addition to the per-entry token so that
  the endpoint namespace is not `/media/` for every install.

### 1.2 Markdown raw-HTML sanitizer is a hand-rolled allowlist (Medium)

Reference: `src-tauri/src/markdown/mod.rs` (`sanitize_allowed_raw_html`,
`sanitize_raw_img_tag`, `sanitize_raw_paragraph_tag`, `parse_html_attributes`)

Rendered Markdown HTML is injected into the WebView via `innerHTML`
(`src/features/preview/PreviewPane.tsx:595` and the `innerHTML={props.html}` binding at
`:639`). The backend defends against XSS with a custom allowlist that passes only
`<p align=...>`, `</p>`, and `<img>` with a fixed attribute set, escaping everything
else to text.

The approach is reasonable and covered by tests (`strips_unsafe_attributes_from_raw_html_img_tags`,
`strips_unsafe_attributes_from_raw_paragraph_tags`), but hand-rolled HTML/attribute
parsers are historically fragile:

- `img` `src` is emitted after `escape_html_attribute` but is not scheme-validated. A
  Markdown source containing `<img src="javascript:...">` is preserved as an attribute.
  For `img/src` a `javascript:` URL is not directly executable in modern engines, but a
  `src` pointing at an attacker-controlled `http(s)`/`data:` resource is still an
  exfiltration/telemetry vector (image loads leak that the doc was opened). Autolinked
  plain URLs (`push_linkified_text`) and pulldown-cmark link destinations are likewise
  not scheme-filtered, so `[x](javascript:alert(1))` relies on the WebView/CSP to
  neuter it.
- `parse_html_attributes` is a bespoke byte scanner. Any divergence from real HTML
  tokenization (unusual whitespace, malformed quoting, attribute-name edge cases) is a
  potential bypass or mis-parse.

Improvements to evaluate:

- Add explicit URL-scheme allowlisting for `img src`, autolinks, and Markdown link
  destinations (permit `http`, `https`, relative, `data:image/` only; reject
  `javascript:`, `vbscript:`, arbitrary `data:`).
- Consider a vetted sanitizer library (e.g. `ammonia`) instead of the hand-rolled
  allowlist, or at least document the threat model and why the narrow allowlist is
  believed complete.

### 1.3 Content-Security-Policy is disabled (`csp: null`) with `assetProtocol` scope `**` (Medium)

Reference: `src-tauri/tauri.conf.json`

The Tauri security config sets `"csp": null` and `assetProtocol.scope: ["**"]`. With
CSP disabled, the WebView has no defense-in-depth against injected script if any
sanitizer (1.2) or EPUB renderer (1.4) allowlist is bypassed. `assetProtocol` scope
`**` grants the WebView read access to the entire filesystem through the asset
protocol.

Because the app legitimately renders arbitrary local files and loads local images via
`convertFileSrc`, a fully locked-down CSP is non-trivial, but:

- A CSP that at minimum forbids inline/eval script and restricts connect/img/media
  sources to `asset:`, the local media server origin, and the known external embeds
  (asciinema, KaTeX/mermaid assets) would substantially reduce the blast radius of any
  HTML-injection bug.
- `assetProtocol.scope` could be narrowed at runtime to the opened root(s) rather than
  the whole filesystem.

This is a defense-in-depth gap rather than an active vulnerability, but it removes the
safety net that the hand-rolled sanitizers depend on.

### 1.4 EPUB chapter HTML is re-serialized through a custom allowlist and injected via innerHTML (Medium)

Reference: `src-tauri/src/viewer/epub.rs` (`render_chapter_body`,
`rewrite_attribute_value`, `is_external_url`), injected at
`src/features/preview/EpubPreviewPane.tsx:550`

EPUB rendering walks the chapter XML with roxmltree, drops `script`/`noscript`, drops
`on*` attributes, rewrites resource references to `data:` URLs or intra-document
anchors, and re-emits HTML that the frontend injects with `innerHTML`. This is a large
attacker-influenced surface (EPUBs are untrusted input).

Concerns:

- The element allowlist is implicit (everything except `script`/`noscript` is passed
  through). Tags such as `<iframe>`, `<object>`, `<embed>`, `<form>`, `<meta http-equiv>`,
  or SVG script/`<foreignObject>` are not explicitly stripped. Whether they are harmful
  depends on the WebView and the (disabled) CSP.
- `is_external_url` allows `http://`, `https://`, `mailto:`, `tel:`, and protocol-relative
  `//`. Anchor `href`/resource `src` values passing this check are emitted verbatim, so a
  malicious EPUB can embed outbound links/resources; combined with `csp: null` this is a
  tracking/exfiltration channel.
- Attribute values other than the specifically-rewritten ones (`id`, `src`, `poster`,
  `href`, `style`) are passed through unchanged (`rewrite_attribute_value` `_ =>`), so
  e.g. `srcset`, `formaction`, `xlink:href` on non-`a` elements, or `style` on nested
  elements may carry unexpected values. `style` is URL-rewritten but not otherwise
  constrained.

Improvements to evaluate:

- Switch to an explicit element allowlist (headings, paragraphs, lists, tables, spans,
  images, anchors, etc.) and drop everything else.
- Explicitly strip or neutralize `iframe`/`object`/`embed`/`form`/`meta`/SVG-script.
- Reuse the same URL-scheme allowlist proposed in 1.2 for EPUB anchors and resources.

### 1.5 GitHub token is read from environment and sent as Bearer to any github.com/raw host (Low)

Reference: `src-tauri/src/github_pr_diff.rs` (`apply_github_token`,
`validate_github_raw_url`)

`apply_github_token` attaches `Authorization: Bearer <token>` from `GITHUB_TOKEN`/
`GH_TOKEN` to API requests and to `fetch_full_text(raw_url)`. `load_file_text` validates
that the raw URL host is `raw.githubusercontent.com` or `github.com`, which is good.
Two notes:

- The raw URL used for `fetch_full_text` originates from GitHub API responses
  (`raw_url`) and is host-validated before use — acceptable. Confirm that the same
  validation path guards every code path that forwards the bearer token (the API URLs
  are constructed internally from parsed owner/repo, so they are safe by construction).
- Document that the token is only ever sent to github.com hosts so future refactors do
  not accidentally forward it elsewhere.

### 1.6 Local media server has no request-size or concurrency bounding (Low)

Reference: `src-tauri/src/media_stream.rs` (`run_media_stream_server`,
`handle_connection`)

Each accepted connection spawns an unbounded OS thread. A local misbehaving client can
open many keep-alive connections and exhaust threads. Loopback-only binding limits the
exposure to local processes, but a small connection cap or a thread pool would be more
robust.

---

## 2. Correctness and Robustness Findings

### 2.1 `save_document` performs no optimistic-concurrency / conflict check (High for the editor roadmap)

Reference: `src-tauri/src/document/service.rs` (`save`), `commands/document.rs`
(`save_document`)

`save` writes `source_text` to disk and re-opens the file, unconditionally overwriting
whatever is there. The architecture spec explicitly calls for a conflict state when the
file changed on disk while the editor had unsaved changes ("If the editor has unsaved
changes, an external file update enters an explicit conflict state instead of silently
overwriting the buffer" — `design-docs/specs/architecture.md`). The `revision_token`
field exists on `DocumentSnapshot` and is well-suited for a compare-and-swap, but
`save_document` does not accept or check an expected revision.

Currently this is latent because the README states the editable save flow is not yet
exposed. But the command is wired into the invoke handler (`lib.rs`) and the type
carries a revision token, so a future editor slice can silently clobber concurrent
edits. Recommendation: make `save_document` take an `expected_revision_token` and return
a typed conflict error when it does not match the on-disk state.

### 2.2 File watcher watches only the file, not its directory — atomic-rename saves can be missed (Medium)

Reference: `src-tauri/src/watcher/service.rs` (`watch_active_document`)

The watcher registers `RecursiveMode::NonRecursive` on the file path itself. Many
editors save via atomic rename (write temp file, `rename` over the target). On several
platforms watching the original inode/path can miss such replacements because the watch
is tied to the replaced file, not the directory entry. The 200 ms debounce and the
250 ms poll interval further coarsen delivery. This directly affects the advertised
"Automatic refresh of opened Markdown documents when the file changes on disk" feature.

Recommendation: watch the parent directory (non-recursive) and filter events by the
target file name, which is the standard pattern for reliable single-file watching and
handles rename-based writes.

### 2.3 `list_directory` re-`stat`s each entry up to three times per page (Medium, performance)

Reference: `src-tauri/src/viewer/directory_listing.rs`

For name/extension sorts, `read_directory_entry_seeds` records only type info, then
`directory_entry_from_seed` calls `fs::metadata` again and `canonicalize_path` again for
each row on the page. For symlinked entries `directory_entry_seed_from_fs_entry` already
called `fs::metadata` once. So a single listed row can incur two `stat`s plus a
`realpath`. On large or network-backed directories this is measurable. Also,
`canonicalize_path` per row means one failing symlink at render time aborts the whole
page with `?` (`collect::<AppResult<Vec<_>>>()`), even though earlier seed collection
deliberately skips dangling symlinks.

Recommendations:

- Cache the `Metadata` obtained during seed/record collection and reuse it for the page
  slice instead of re-`stat`ing.
- Make per-row canonicalization non-fatal (fall back to the logical path) so one broken
  symlink cannot fail the listing after it survived seed collection.

### 2.4 `String::from_utf8_lossy` silently corrupts non-UTF-8 file content in several paths (Medium)

References: `viewer/service.rs` (`open_text_preview`, `open_csv_preview`),
`git_diff.rs` (`bytes_to_file_text`), `github_pr_diff.rs` (`fetch_full_text`),
`document/service.rs` uses `read_to_string` (which instead errors on non-UTF-8).

Text/CSV/diff full-file content is decoded with `from_utf8_lossy`, replacing invalid
sequences with U+FFFD. For a viewer this is a defensible choice, but it is silent: a
Latin-1/Shift-JIS/UTF-16 file is shown as mojibake with no indication. The document
service, by contrast, uses `read_to_string` and hard-errors on non-UTF-8 Markdown,
creating an inconsistent contract across preview kinds.

Recommendation: detect obvious non-UTF-8 (e.g. BOM sniff for UTF-16, or a validity
check) and either surface an encoding notice in the preview meta line or classify such
files as binary. At minimum, document the lossy behavior as intentional.

### 2.5 CSV parse-error path clears rows but formatted view still keys off `parse_error` only (Low)

Reference: `viewer/csv.rs` (`parse_csv_preview`), `viewer/service.rs`
(`open_csv_preview`)

`formatted_available = parsed.parse_error.is_none()`. When the CSV parser errors it
clears rows and sets `truncated = false`, so the UI can enter formatted mode only when
there was no error. That is consistent, but `total_row_count` becomes `None` both on
truncation and on error, so the frontend cannot distinguish "too big to count" from
"unparseable". Consider a small enum/flag to disambiguate for clearer messaging.

### 2.6 `find_syntax_for_file` reads file content, duplicating work already done (Low, performance)

Reference: `src-tauri/src/syntax_highlight/mod.rs` (`resolve_syntax` →
`find_syntax_for_file`)

`resolve_syntax` calls `ss.find_syntax_for_file(path)`, which opens and reads the first
line of the file to sniff first-line patterns (shebangs). In `highlight_file_source` the
full file content is already in memory (`source`), so the grammar is resolved by
re-reading the file from disk. For `describe_file_syntax` (called for the meta line and
`should_treat_path_as_text`) this is an extra file open per preview. Prefer
`find_syntax_by_first_line`/extension resolution against the in-memory `source` to avoid
the redundant disk read, and to keep classification consistent even if the file changes
between reads.

### 2.7 Worktree diff for many untracked files spawns one `git` process per file (Medium, performance)

Reference: `src-tauri/src/git_diff.rs` (`worktree_diff`)

Untracked files are diffed one-by-one via `git diff --no-index -- /dev/null <path>`,
i.e. one process spawn per untracked file. A repo with a large untracked tree (e.g. a
fresh `node_modules` or build output not yet ignored) produces a process storm and slow
load. Consider batching, capping the number of untracked files shown (with a warning
like the 300-file cap used for GitHub diffs), or reading untracked content directly
instead of shelling out per file.

### 2.8 `MAX_DIFF_FILES` cap applied twice; page loop can over-fetch (Low)

Reference: `src-tauri/src/github_pr_diff.rs` (`fetch_files`, `apply_file_cap`)

`fetch_files` truncates to `MAX_DIFF_FILES` and pushes a warning inside the paging loop,
then calls `apply_file_cap` again on the result, which can push a duplicate warning if
the loop exited exactly at the cap. Minor, but the double-cap logic is redundant and can
emit the same warning twice. Consolidate into a single cap point.

### 2.9 Argument parsing ambiguity between `<git-dir> <spec>` and multi-file startup (Medium)

Reference: `src-tauri/src/cli/mod.rs` (`parse_cli`, `parse_git_diff_startup_pair`,
`resolve_explicit_file_startup`)

Two-argument startup is overloaded: `chilla <dir> <commit-or-range>` (Git diff) vs.
`chilla <file> <file>` (multi-file set). Disambiguation relies on: first arg exists as a
path, second arg does not exist as a path, and `GitDiffTarget::from_repo_and_spec`
succeeds. Edge cases:

- A legitimate two-file open where the second file was deleted between shell expansion
  and process start would fall through to Git-diff parsing.
- A branch/commit name that also happens to exist as a relative path in CWD (e.g. a file
  literally named `main`) makes `spec_candidate.exists()` true and silently routes to
  multi-file mode instead of Git diff.
- The precedence (Git-diff pair checked before multi-file) is implicit and only
  documented in code.

Recommendation: document the precedence in `command.md`, and consider an explicit
subcommand or flag (e.g. `--diff`) to remove the heuristic ambiguity for power users.

### 2.10 `render_markdown_preview` command ignores document-relative context (Low)

Reference: `commands/document.rs` (`render_markdown_preview`)

`render_markdown_preview(source_text)` renders arbitrary source without a base path, so
relative image/link resolution that the file-open path provides is unavailable. If this
command is meant for live-preview of an editor buffer, it will render relative asset
references differently from `open_document`. Clarify the intended consumer, or thread
the document path through so relative resolution is consistent.

---

## 3. Architecture and Contract Consistency

### 3.1 `GitHubDiffSource` conflates GitHub and local Git sources (Medium, modeling)

Reference: `src-tauri/src/github_pr_diff.rs` (`GitHubDiffSource` with `GitWorktree`,
`GitCommit`, `GitRange` variants)

The `GitHubDiffSource` enum carries local-Git variants (`GitWorktree`, `GitCommit`,
`GitRange`) so that local diffs can reuse `PrDiffSnapshot`/`PrDiffIdentity`. This means
several `match` arms across the GitHub API client must explicitly return
"local Git sources are not loaded through the GitHub API" errors
(`fetch_metadata`, `fetch_files_page`, `api_url`). The shared snapshot type is
convenient for the frontend, but the type name and location imply "GitHub" while
modeling "any diff source", which invites the guard-arm pattern and makes the invariant
(local variants never reach the HTTP client) a runtime check rather than a compile-time
one.

Recommendation: consider a top-level `DiffSource` enum (GitHub vs. Local) with the
GitHub-only enum nested, so the HTTP client can only be handed GitHub variants by
construction. At minimum, rename to reflect that it is the unified snapshot source.

### 3.2 `list_directory` command accepts both flat params and a nested `input` object (Low)

Reference: `commands/document.rs` (`list_directory`, `ListDirectoryInput`)

The command accepts `path/sort/query/offset/limit` as top-level args and also an
optional `input: ListDirectoryInput` carrying the same fields, then merges them with
`input`-takes-precedence logic. This dual contract is a maintenance hazard (two ways to
call the same command; the precedence is non-obvious). If both shapes are genuinely in
use by different callers, document why; otherwise collapse to one shape. The frontend
IPC wrapper (`src/lib/tauri/document.ts`) should be the single source of truth for the
call shape.

### 3.3 Frontend duplicates diff-syntax language/keyword tables (Low, maintainability)

Reference: `src/features/pr-diff/prDiffSyntaxKeywords.ts` (731 lines),
`prDiffSyntaxLanguages.ts` (200), `prDiffSyntax.ts`, `prDiffSyntaxTypes.ts`

The diff viewer implements its own syntax highlighting in TypeScript with large hand-
maintained keyword/language tables, while the backend already uses syntect for file and
Markdown-fence highlighting. This is two independent highlighting engines with different
language coverage and visual output. It is a significant maintenance surface (~1,100 LOC
of tables) and a source of inconsistency between the file preview and diff preview.
Consider whether diff hunks can be highlighted by the same backend path (syntect over
reconstructed old/new line text) to unify behavior, or document why the frontend engine
is intentionally separate (e.g. per-line granularity, streaming).

### 3.4 Large frontend modules concentrate responsibility (Low, maintainability)

Reference: `src/features/workspace/WorkspaceShell.tsx` (1,496),
`src/features/pr-diff/PrDiffWorkspace.tsx` (1,492), `src/lib/tauri/document.ts` (1,281)

These three files hold a large share of frontend logic. `document.ts` is both the IPC
type contract and the invoke wrapper layer; `WorkspaceShell` and `PrDiffWorkspace` mix
state orchestration, keyboard handling, and rendering. This is not a defect but a
refactor target: splitting IPC types from invoke wrappers, and extracting diff/workspace
state machines from their view components, would improve testability and align with the
already-modular backend.

### 3.5 stderr `eprintln!` logging is scattered and unconditional (Low)

Reference: `src-tauri/src/media_stream.rs` (many `eprintln!`), and elsewhere

The media stream module logs every register/request/response to stderr unconditionally,
including tokens and full paths (see 1.1). There is no logging framework, level control,
or redaction. For a desktop app this noise ends up in the terminal that launched
`chilla`. Recommend a lightweight logging facade (`log`/`tracing`) with levels, and drop
sensitive fields from the default level.

---

## 4. Specification and Documentation Drift

### 4.1 Design specs describe a Markdown workbench the product no longer is (Medium, doc)

The README's "Current Product Shape" section already acknowledges this, but
`design-docs/specs/architecture.md` and `design-markdown-workbench.md` still lead with a
three-column editor (ToC / editor / preview) with conflict resolution as the primary
design, while the shipped product is a yazi-like multi-type viewer where Markdown source
is read-only. A reader starting from the specs will be misled about editability, the
save/conflict flow (2.1), and the central "editor" column.

Recommendation: add a clear "Status: superseded / partially implemented" banner to the
workbench architecture sections, or fold the still-accurate parts into a single current
architecture doc and archive the editor-centric material. The `notes.md`
"Scope Corrections" help but are easy to miss.

### 4.2 `command.md` does not fully document the two-argument Git-diff form or precedence (Low, doc)

Reference: `design-docs/specs/command.md` vs. `cli/mod.rs`

The CLI supports `chilla <git-dir> <commit>`, `<git-dir> <base>..<head>`,
`<git-dir> <base>...<head>`, the `--no-github-diff-cache`/`--no-pr-diff-cache` flags, and
multi-file startup. The heuristic precedence between the Git-diff pair and multi-file
startup (2.9) is only in code. `command.md` should be the authoritative surface for
subcommands/flags/precedence and exit codes (`AppError::exit_code` returns 1/2/3; those
codes are not documented for users).

### 4.3 README claims Automatic refresh but watcher reliability is limited (Low, doc)

Given 2.2, the "Automatic refresh ... when the file changes on disk" claim may not hold
for editors that save via atomic rename. Either fix the watch strategy or scope the
claim (e.g. "when the file is modified in place").

### 4.4 Active vs. completed impl-plans no longer reflect status (Low, doc)

Reference: `impl-plans/active/` still contains `local-git-diff-viewer.md`,
`github-pr-diff-viewer.md`, `heic-image-display.md`, `numeric-view-shortcuts.md`, all of
which appear shipped per the README feature list. The README itself notes the plans are
"planning artifacts, not a precise status dashboard". Moving completed work to
`impl-plans/completed/` (as the process prescribes) would restore the index's value.

---

## 5. Testing Observations

Strengths:

- Rust unit tests are colocated and cover CLI parsing, diff parsing, CSV bounds, EPUB
  nav fallbacks (nav/ncx/spine), preview classification, range parsing, and cache
  behavior. GitHub API is abstracted behind a `GitHubPrApi` trait with a mock, enabling
  hermetic service tests.
- Frontend has Vitest DOM suites for the major panes and a Linux WebDriver smoke test.

Gaps to consider:

- No test exercises the media stream HTTP server end-to-end (range requests, virtual
  faststart segmentation, keep-alive, 404/405/416 paths). `serve_virtual_file`'s segment
  walking is intricate and untested at the HTTP layer.
- No test asserts the Markdown sanitizer rejects dangerous URL schemes (1.2) — current
  tests cover `on*` attribute stripping but not `javascript:`/`data:` in `src`/links.
- No test for watcher behavior under atomic-rename saves (2.2).
- EPUB sanitization tests validate structure/anchors but do not assert that
  `iframe`/`object`/external-`src` are neutralized (1.4).
- CLI two-arg ambiguity (2.9) has happy-path tests but no test for the
  "spec name collides with an existing path" case.

---

## 6. Prioritized Summary

| # | Finding | Severity | Area |
|---|---------|----------|------|
| 1.1 | Media server: token logging, wildcard CORS, no eviction | High | Security |
| 2.1 | `save_document` has no revision/conflict check | High | Correctness |
| 1.2 | Markdown sanitizer: no URL-scheme allowlist | Medium | Security |
| 1.3 | CSP disabled + assetProtocol `**` | Medium | Security |
| 1.4 | EPUB implicit element allowlist + external URLs | Medium | Security |
| 2.2 | Watcher misses atomic-rename saves | Medium | Correctness |
| 2.3 | Directory listing re-stats/realpaths per row; fatal on symlink | Medium | Perf/Robustness |
| 2.4 | Silent lossy UTF-8 decoding, inconsistent with Markdown path | Medium | Correctness |
| 2.7 | Worktree diff spawns one git process per untracked file | Medium | Perf |
| 2.9 | CLI two-arg ambiguity (diff pair vs. multi-file) | Medium | Correctness |
| 3.1 | `GitHubDiffSource` conflates GitHub + local variants | Medium | Modeling |
| 4.1 | Specs still describe superseded Markdown workbench | Medium | Docs |
| 1.5 / 1.6 | Token forwarding docs; media server bounding | Low | Security |
| 2.5 / 2.6 / 2.8 / 2.10 | CSV flag, redundant syntax read, double cap, preview base path | Low | Correctness |
| 3.2–3.5 | Dual list_directory contract, duplicated syntax tables, large modules, logging | Low | Maintainability |
| 4.2–4.4 | command.md gaps, refresh claim, stale impl-plans | Low | Docs |

## References

See `design-docs/references/README.md` for external references. Related in-repo design
material: `design-docs/specs/architecture.md`, `design-docs/specs/design-file-viewer-mode.md`,
`design-docs/specs/design-csv-viewer.md`, `design-docs/specs/design-epub-navigation.md`,
`design-docs/specs/command.md`, and `design-docs/specs/notes.md`.

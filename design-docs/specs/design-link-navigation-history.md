# Preview Link Navigation and Back/Forward History Design

Link clicks in the rendered preview open the target inside chilla or in the
system browser. A Back/Forward history restores the previous document and its
scroll position. History works in single view and in pair view.

This document extends `design-markdown-workbench.md` (preview, TOC anchors),
`design-file-viewer-mode.md` (file browser, typed previews) and
`design-pair-view.md` (pair list, `{` / `}`). Everything not stated here keeps
the behavior those documents define.

## Scope

In scope:

- Link clicks inside `PreviewPane` (`src/features/preview/PreviewPane.tsx`):
  rendered Markdown in single view, and Markdown file previews in pair view.
- One fix in the Rust Markdown link sanitizer (`mailto:`).
- A session-only navigation history, two toolbar buttons, two keymap actions,
  and mouse side buttons.

Out of scope (behavior unchanged):

- Links inside `EpubPreviewPane` (EPUB keeps its own href navigation),
  `HtmlRenderedPreviewPane`, the PR / Git diff workspace, and the raw Markdown
  editor.
- `file:` URLs, Windows drive-letter and UNC link targets. The Rust sanitizer
  already rewrites them to `#`. chilla ships for macOS and Linux only.
- History persisted across app launches, a history list UI, and per-pane
  histories.
- A guard for unsaved Markdown edits. Link and history navigation use the same
  open path as the file browser and keep its current dirty-buffer behavior.

## Current Behavior (baseline, checked 2026-11-19)

- `PreviewPane` click handler intercepts only `http`, `https`, `mailto` and
  `tel` hrefs (`isDefaultBrowserUrl`, `preview-assets.ts`) and opens them with
  `@tauri-apps/plugin-opener` `openUrl`. Every other click falls through to the
  webview.
- Relative and absolute local links therefore make the webview itself try to
  navigate to the app origin. This fails, and it replaces the app page. This
  is the main defect.
- `#fragment` links fall through to default webview hash handling. No percent
  decoding, no history, and the scroll is not owned by the app.
- The Rust sanitizer (`is_safe_url` in `src-tauri/src/markdown/mod.rs`) allows
  only `http` / `https` schemes in link URLs. It rewrites `mailto:` links to
  `#`, so mailto links are broken today.
- `PreviewPane` scrolls to `selectedAnchorId` with
  `querySelector(`#${anchorId}`)`. Heading ids may start with a digit
  (`## 2024 notes` -> `2024-notes`), and that makes the selector invalid, so it
  throws.
- Heading ids come from Rust `slugify_heading`: lowercase alphanumerics, runs
  of other characters collapse to one `-`, trimmed, `section` when empty,
  duplicates suffixed `-2`, `-3`, and so on.
- There is no navigation history. `workspace/state.ts` only holds
  `WorkspaceSelection { anchorId, lineStart }`.
- `opener:default` in `src-tauri/capabilities/default.json` already permits
  `openUrl` for the default URL schemes (http, https, mailto, tel). No
  capability change is needed.

## Link Classification

A pure frontend function `classifyPreviewLink(href, documentPath, pathApi)` in
a new module `src/features/preview/previewLinks.ts` returns one of the
following. Path joining uses a pathname-only helper (see "Pathname resolution
boundary" below). It does not pass decoded text to `resolveDocumentResource`.

| Input `href` (trimmed) | Result |
|---|---|
| empty, `#`, or only `#` after sanitizing | `ignore` |
| `http:`, `https:`, `mailto:`, `tel:` (case-insensitive, `isDefaultBrowserUrl`) | `external { url }` |
| `#fragment` | `anchor { fragment }` (same document) |
| relative path or `/absolute/path`, with optional `?query` and `#fragment` | `file { path, fragment \| null }` |
| any other scheme (for example `ftp:`, `javascript:`) or `//host` | `ignore` |
| `documentPath` is null and the href is a path | `ignore` |

Rules:

- `isDefaultBrowserUrl` is unchanged. In practice the Rust sanitizer leaves
  only `http`, `https` and (after the fix below) `mailto` scheme links in the
  HTML.
- Split before decode. The original, still-encoded href is split exactly once
  into `pathname`, `query` and `fragment`:
  - `fragment` is everything after the first literal `#`;
  - `query` is everything after the first literal `?` that comes before that
    `#`.
  - Encoded delimiters (`%23`, `%3F`) are not delimiters at this stage.
- Decode once. `pathname` and `fragment` are each decoded exactly once with
  `decodeURIComponent`. If decoding fails, that component keeps its raw text.
  `query` is dropped for file targets. Decoded text is never decoded again and
  never split again.
- Pathname resolution boundary. `resolveDocumentResource` re-parses its input
  with `splitResourcePath`, which splits on literal `?` / `#`, so it must not
  receive a decoded pathname. Instead, `preview-assets.ts` exports
  `resolveDocumentPathname(pathname, documentPath, pathApi)`. It contains only
  the existing join/normalize step:
  - absolute path: `normalize(pathname)`;
  - relative path: `normalize(join(dirname(documentPath), pathname))`, which
    handles `./`, `../` and subdirectories.

  It does no splitting or decoding. `resolveDocumentResource` keeps its
  current split-then-resolve order and calls this helper on its own split
  pathname. Media/resource behavior and the existing `preview-assets` tests
  stay unchanged. `classifyPreviewLink` calls `resolveDocumentPathname` with
  the decoded pathname.
- Expected results with `documentPath = /docs/index.md`:
  - `chapter%23one.md` -> path `/docs/chapter#one.md`, fragment null.
  - `chapter%3Fone.md#heading` -> path `/docs/chapter?one.md`, fragment
    `heading`.
  - `name%253F.md` -> path `/docs/name%3F.md` (decoded once only).
  - `my%20doc.md` -> `/docs/my doc.md`.
  - `../a/b.md?x=1#Sec` -> `/a/b.md`, fragment `Sec`.
  - `/abs/x.md` -> `/abs/x.md`.
- No workspace-root restriction. A link may open any local file that the user
  could open through Open Files. Targets open read-only through the existing
  preview commands (`openDocument` for Markdown, `openFilePreview` otherwise).
  Link targets are never passed to `openPath` or executed.

## Click Handling (`PreviewPane`)

- Only primary-button clicks (`button === 0`) on `a[href]` inside the preview
  container are handled. For every handled link the handler calls
  `preventDefault`. The webview never navigates.
- `external`: `openUrl(url)`, as today. No history entry.
- `ignore`: nothing else happens.
- `anchor` and `file`: call a new optional prop
  `onNavigateLink(request: { path: string; fragment: string | null })`. For
  `anchor`, `path` is the current `documentPath`. When the prop is absent, the
  click is only prevented.
- `WorkspaceDocumentColumn` threads `onNavigateLink` to both `PreviewPane`
  instances. `PairView` passes a side-bound callback for each pane.

## Fragment Resolution

A shared helper `findFragmentTarget(container, fragment)`:

1. An element in the container whose `id` equals the decoded fragment exactly.
   Compare `id` values or use `CSS.escape`; never build an unescaped selector.
2. Otherwise, the first heading whose `id` equals
   `slugifyHeading(fragment)`. This TypeScript port of Rust `slugify_heading`
   applies the same rules, so GitHub-style fragments such as `#a_b` or
   `#Foo-Bar` match chilla ids `a-b` and `foo-bar`.
3. Otherwise no target. The document stays at the top for a new file, or at
   the current position for the same file. No error is shown.

The existing `selectedAnchorId` scroll effect in `PreviewPane` uses the same
lookup, which fixes the digit-leading id crash.

## Navigation History Model

A new pure module `src/features/workspace/navigationHistory.ts` holds an
immutable state `{ entries, index }`. There is one history per workspace
window.

```text
NavigationLocation =
  | { kind: "single", path, scrollTop, fragment | null }
  | { kind: "pair", pairIndex,
      left:  { path, scrollTop, fragment | null },
      right: { path, scrollTop, fragment | null } }
```

Operations, all pure and unit-tested:

- `push(state, location)`: drop entries after `index`, append, set `index` to
  the new last entry. Skip the append when the new location has the same path
  (or the same pair paths) and the same fragment as the current entry. Cap the
  history at 100 entries and drop the oldest.
- `updateCurrent(state, patch)`: record the departing scroll position on the
  current entry before any navigation.
- `back(state)` / `forward(state)`: move `index` by one and return the target
  entry; do nothing at either end.
- `canGoBack` = `index > 0`; `canGoForward` = `index < entries.length - 1`.

Pair entries are full snapshots: pair-list selection plus the path, scroll and
fragment of each side. A pair entry therefore restores both panes in one step.
Pane visibility (`{` / `}`) is not part of the history.

## What Pushes an Entry

Each push happens only after the open succeeds. A failed open shows the
existing error banner, keeps the current document, and leaves history
unchanged.

| Event | Single view | Pair view |
|---|---|---|
| Startup document/pair loaded | initial entry | initial entry |
| Link to another file | push `{path, fragment}` | push snapshot with the clicked side replaced |
| Link to `#fragment` in the same file | scroll, push the same path with the new fragment | same, for that side |
| File browser preview / confirm, reveal, Open Files dialog, macOS file-open delivery | push (forward stack truncated) | n/a |
| Pair-list selection change | n/a | push snapshot of the new pair |
| Back / Forward restore | no push | no push |
| Reload (`r`), file-watch refresh, presentation toggles, TOC clicks, `{` / `}` | no push | no push |

Before every push and every Back/Forward, the current entry's `scrollTop` is
captured from the visible scroll owner:

- single view: `getActiveDocumentScrollBody()`;
- pair view: `[data-pair-pane=<side>] .pane__body`.

Directory changes (enter directory, go to parent) clear the document area but
do not change history. Back then reopens the entry before the current index.

## Restore Behavior

- Single view: the path opens through `previewSelectedFile` (Markdown opens in
  the Preview pane). It sets `selectedBrowserPath` to the path so the tree
  highlights it when listed. It does not push history.
- Pair view: `WorkspaceShell` keeps `pairDisplayedPaths { left, right }`, and
  `PairView` receives these instead of the selected pair's paths. A pair-list
  selection change resets both to the pair's files. A link replaces one side.
  A restore sets `selectedIndex` and both displayed paths together. The pair
  list highlight follows `pairIndex`. Pair reload reloads the displayed paths.
- Scroll restore: after the restored content is rendered, set the saved
  `scrollTop`. Retry once per animation frame for up to 1000 ms while
  `scrollHeight - clientHeight` is still smaller than the target, because
  images, Mermaid and KaTeX render asynchronously. Then stop.
- First visit to an entry with a fragment and no saved scroll: scroll to
  `findFragmentTarget` with an instant (not smooth) scroll. In single view,
  `selection.anchorId` is also set when the target is a TOC heading, so the TOC
  highlight follows.
- Same-path entries (anchor hops) do not reload the document. They only
  scroll.
- A restore whose file no longer opens shows the error banner and keeps the
  index on the failed entry. The user can keep going Back or Forward.

## Triggers

All triggers call the same `goBack()` / `goForward()` in `WorkspaceShell`.
These do nothing while a Git/PR diff target is active, while the history end is
reached, or while the shortcuts help dialog is open.

Toolbar (`WorkspaceHeader.tsx`):

- Two `button workspace__icon-button` controls, `aria-label="Back"` and
  `aria-label="Forward"`. They are placed before "Open one or more files" with
  new `BackGlyph` / `ForwardGlyph` in `workspaceGlyphs.tsx`.
- `disabled` when `!canGoBack` / `!canGoForward` or in diff mode. The title
  shows the bound shortcut through the existing `title()` helper.

Keyboard (keymap system, `src/features/keymap/keymap.ts`):

- New `WORKSPACE_ACTIONS`: `history.back` and `history.forward`.
- Default `workspace` bindings, registered for both platforms the same way
  `<C-o>` / `<D-o>` are:
  - `history.back`: `<D-[>`, `<C-[>`, `<A-Left>`
  - `history.forward`: `<D-]>`, `<C-]>`, `<A-Right>`
- Conflict check against `DEFAULT_KEYMAP_INPUT`: none of these keys is bound.
  `<Left>` / `<Right>` in `file`/`diff` contexts are unmodified and stay
  distinct. `{` / `}` are separate keys (`Shift+[`), so `pair.left.toggle` and
  `pair.right.toggle` are unchanged.
- Focus guard: `KeymapProvider` already ignores `workspace` bindings when the
  target is editable (input, textarea, select, contenteditable), except
  `files.open` / `document.save`. The new actions are deliberately not added
  to that exception, so editor indent and word movement are not hijacked. The
  directory search panel guard also stays unchanged.
- Users can rebind or unbind the actions through the existing keymap config
  file. The Rust `keymap_config` passes action strings through without an
  allow-list, so no Rust change is needed. The shortcuts help dialog lists
  the actions from the keymap automatically.

Mouse side buttons:

- A window-level listener in `WorkspaceShell`: on `mouseup` with
  `event.button === 3` call `goBack()`, with `event.button === 4` call
  `goForward()`.
- `mousedown` and `auxclick` for buttons 3 and 4 call `preventDefault`, so
  WebKitGTK cannot run its own webview history navigation.
- Buttons 0 to 2 are untouched, so right/middle drag pan
  (`previewPanZoom.ts`) is unaffected.
- Best effort: if the macOS WKWebView does not deliver buttons 3 and 4 to the
  page, the feature is inert there. This is reported in verification, not
  worked around natively.

## Rust Change

- `src-tauri/src/markdown/mod.rs`: link URLs (not media URLs) accept the
  `mailto` scheme in addition to `http` / `https`. Media URL rules are
  unchanged.
- Rust unit test: `[x](mailto:a@b.c)` keeps its href, and `javascript:` is
  still rewritten to `#`.
- No Tauri command, event, capability or keymap-config contract changes.
  `src/lib/tauri/*` is untouched.

## Verification

Unit tests (vitest / bun test):

- `previewLinks`: relative, `../`, subdirectory, percent-encoded names
  (`my%20doc.md`), absolute path, `?query` dropped, `#frag` only,
  `file.md#frag`, external schemes, unknown scheme ignored, null
  `documentPath`.
- Encoded-delimiter regressions (`src/features/preview/previewLinks.test.ts`):
  - `chapter%23one.md` -> `/docs/chapter#one.md`;
  - `chapter%3Fone.md#heading` -> `/docs/chapter?one.md` with fragment
    `heading`;
  - `name%253F.md` -> `/docs/name%3F.md`, decoded once;
  - encoded fragment `#%E6%97%A5` -> decoded once;
  - malformed `%E0%A4` keeps its raw text.
- `preview-assets` (`src/features/preview/preview-assets.test.ts`):
  `resolveDocumentPathname` resolves relative, `../` and absolute paths and
  does not split on `#` / `?`. Existing `resolveDocumentResource` tests pass
  unchanged.
- `slugifyHeading` matches the Rust cases (`Child Topic` -> `child-topic`,
  empty -> `section`, `a_b` -> `a-b`).
- `findFragmentTarget`: exact id, digit-leading id, slug fallback, missing
  target.
- `navigationHistory`: push truncates forward, duplicate suppression, cap 100,
  back/forward bounds, `updateCurrent`.
- `PreviewPane`: a local link calls `onNavigateLink` with `preventDefault`; an
  external link calls `openUrl`; `#` is ignored.
- `WorkspaceShell` (mocked IPC): link -> Back restores the previous path and
  calls the scroll restore; Forward re-opens; a non-link open truncates
  forward; buttons are disabled at the ends; diff mode disables them.
- `PairView` / shell pair mode: a link in the left pane changes only the left
  displayed path; Back restores the pair; `{` / `}` still toggle visibility.
- `KeymapProvider`: `<D-[>` / `<A-Left>` dispatch `history.back` outside
  editables and do not dispatch inside a textarea or input.

Toolchain:

- `bun run typecheck`, `bun run test`, biome lint (`mise run` lint task)
- `cd src-tauri && CARGO_TERM_QUIET=true cargo check`, `cargo clippy`,
  `cargo nextest run` (with the `NEXTEST_*` quiet settings)
- Build and launch `target/debug/chilla` per `chilla-post-edit-launch`.
  Manually check one Markdown fixture with relative, `../`, encoded,
  anchor, cross-file anchor, absolute, `https` and `mailto` links. Also check
  mouse buttons 3/4 on macOS and record whether they are delivered.

## Rollout Constraints

- Frontend and the one-line Rust sanitizer change ship together in one
  release. There is no persisted format or IPC contract change.
- Pre-existing unrelated working-tree changes (`pubpage/`,
  `design-docs/references/`, `design-docs/specs/design-product-website.md`,
  `impl-plans/completed/website-current-features.md`, `.riela/`) are not
  touched or committed.

Open questions with defaults: `design-docs/user-qa/qa-link-navigation-history.md`.

# Structured Data Formatting and Syntax Coverage

Design for a raw/formatted toggle on structured data text previews and for extending backend syntax highlighting coverage.

## Overview

Text previews currently render the exact source. Minified JSON, one-record-per-line JSON Lines, and minified XML are hard to read in that form. CSV already has a `Raw` / `Formatted` pair; this design gives the same affordance to other structured data files whose readability improves with automatic formatting, and fills gaps where backend previews fall back to plain text.

## Format Inventory

| Family | Extensions | Formatted view | Notes |
| --- | --- | --- | --- |
| JSON | `json`, `geojson`, `jsonld`, `webmanifest`, `har` | Pretty-printed, 2-space indent | Strict RFC 8259; failure disables formatted view |
| JSON Lines | `jsonl`, `ndjson`, `jsonlines` | Each record pretty-printed independently | Invalid lines stay verbatim with a notice |
| XML | `xml`, `xsd`, `xsl`, `xslt`, `rss`, `atom`, `opml`, `plist`, `wsdl`, `kml`, `gpx`, `csproj`, `fsproj`, `vbproj`, `props`, `targets`, `resx`, `xaml`, `nuspec` | Re-indented element structure | Unbalanced tags disable formatted view |
| HTML | `html`, `htm`, `xhtml`, `shtml` | Lenient re-indented markup | Never disables formatted view; malformed markup is still re-indented best-effort |
| CSS | `css`, `scss`, `less` | Lenient re-indented rules/declarations | Beautifier, not a validator; never disables formatted view |
| JavaScript/TypeScript | `js`, `mjs`, `cjs`, `jsx`, `ts`, `mts`, `cts`, `tsx` | Lenient re-indented source (js-beautify-like, not Prettier-level) | Never disables formatted view; JSX/TSX are re-indented only, never re-broken |
| TSV | `tsv`, `tab`, MIME `text/tab-separated-values` | Existing CSV table view with tab delimiter | Reuses `FilePreview::Csv` |

Considered and excluded: YAML, TOML, INI, and properties are already line-oriented, so reformatting adds little and risks semantic changes. JSONC/JSON5 comments cannot be preserved by the strict formatter and remain raw-only.

## Contract

`FilePreview::Text` gains three fields, mirrored in `src/lib/tauri/document.ts`:

- `structured_format`: `"json" | "json_lines" | "xml" | "html" | "css" | "javascript" | null` — present when the path belongs to a formattable family.
- `formatted_html`: `string | null` — complete highlighted preview HTML (same `<section class="file-preview file-preview--text">` wrapper and footer as `html`) for the formatted source; `null` when formatting failed, the file exceeds the formatting size limit, or the format is not structured.
- `format_notice`: `string | null` — human-readable reason formatting is unavailable, or a partial-formatting notice (JSON Lines lines left verbatim).

TSV reuses `FilePreview::Csv` unchanged; `mime_type` is `text/tab-separated-values`, from which the frontend derives the `TSV` label.

## Formatter Behavior

Formatters are token based and never deserialize into maps, so key order, duplicate keys, string escapes, and numeric spelling are preserved exactly.

- JSON: 2-space indent, `"key": value`, trailing commas never added, empty `{}` / `[]` stay compact, leading UTF-8 BOM ignored. Invalid input returns an error with a 1-based line and column.
- JSON Lines: blank lines are skipped; each record is formatted as JSON and records are joined with a newline. Lines that fail keep their original text; the notice reports the count and the first failing line.
- XML: tokens are declarations/processing instructions, comments, CDATA, DOCTYPE, start/end/empty tags, and text. Whitespace-only text is dropped; an element whose only content is one text or CDATA node stays on a single line; other tokens go on their own line indented by depth. Attribute and entity text is copied verbatim. Mismatched or unclosed tags return an error.
- HTML, CSS, and JavaScript/TypeScript are lenient best-effort beautifiers, not validators: they never fail and always produce formatted output (below the size limit). Tag/attribute/entity text (HTML), selector/property/value and string/comment/`url()` text (CSS), and string/template-literal/regex/comment text (JavaScript) are all copied verbatim; only structural whitespace is rewritten.
  - HTML: void elements (`br`, `img`, `input`, ...) never open a stack frame; `script`/`style`/`pre`/`textarea` content is copied verbatim up to its matching close tag; implied end tags follow common HTML parsing rules (a new `li` closes an open `li`, `p` closes on a block-level sibling, `td`/`th`/`tr` close each other, `option` closes `option`); block-level elements get their own indented line, inline elements and text flow together, and a block whose content is only inline stays on one line. An end tag with no matching open element is emitted in place; unclosed tags at end of input are auto-closed.
  - CSS: nesting (including `@media`/`@supports` and SCSS/LESS nested selectors) is tracked with a depth counter; selector lists split at top-level commas; declarations get one per line as `prop: value;`; a blank line separates top-level rules.
  - JavaScript/TypeScript: a shared lexer skips strings, template literals (nested `${ }` substitutions handled with an explicit stack, not recursion), comments, and regex literals (distinguished from division by the preceding significant token). If the source already looks hand-formatted (contains indentation and an average line length under 200 chars), only leading indentation is recomputed from bracket depth and existing line breaks are kept; otherwise lines are rebuilt, breaking after `{` (except empty `{}`), before `}` (with `else`/`catch`/`finally`/`while` glued to the following `{`), and after `;` (except inside a `for (...)` header). `case`/`default` bodies get one extra indent level. JSX/TSX always use indent-only mode; this formatter does not parse JSX.
- Formatting is skipped above 16 MiB of source; the notice says so and raw view remains available.
- Formatted output is highlighted with the same path-based highlighter as raw source (dedicated JSON lexer for the JSON families, XML/HTML/CSS/JavaScript grammars otherwise).

## Frontend Interaction

- A header toggle group (`Raw` / `Formatted`) appears for text previews with non-null `structured_format`, matching the CSV control pattern; `Formatted` is disabled with `format_notice` as its title when `formatted_html` is null.
- `presentation.raw`, `presentation.rendered`, and `presentation.toggle` shortcuts apply to structured text previews.
- The chosen mode is a persistent preference (localStorage, default `formatted`) so switching between JSON files or reloading keeps the user's choice. When formatted output is unavailable, raw is shown without changing the stored preference.
- Partial-format notices are displayed in the formatted view.

## Shortcuts and Syntax Highlighting Toggle

| Action | Default key | Behavior |
| --- | --- | --- |
| `format.toggle` | `Shift+F` | Flip the persisted structured-data preference between formatted and raw when a structured preview with formatted output is active |
| `syntax.toggle` | `Shift+C` | Flip the persisted syntax-highlighting preference (default on) |
| `presentation.toggle` / `presentation.raw` / `presentation.rendered` | `Shift+P` / `1` / `2` | Existing Markdown/CSV actions, extended to TSV, JSON, JSON Lines, and XML |

Both new actions are configurable workspace actions in the keymap. `Shift+H` was rejected because `H` is bound to parent navigation. Shortcuts are ignored inside editable controls.

Syntax highlighting off is frontend-only: a root class neutralizes syntect inline token styles in source previews (text raw/formatted, CSV raw, Markdown code fences, and the diff view where cheap), falling back to the app theme's preview colors. No payload change is required. A header icon button with `aria-pressed` exposes the same toggle.

## Syntax Coverage

Backend grammars are compiled into the build-time packdump (`src-tauri/build.rs`). Additions:

- New project-authored grammars in `src-tauri/syntaxes/`: Nix, Swift, Dockerfile, Zig, Protocol Buffers, Kotlin, INI, HCL/Terraform, GraphQL.
- Path and fence aliases to existing grammars: `mjs`/`cjs`/`mts`/`cts` to JavaScript; `scss`/`less` to CSS; `vue`/`svelte` to HTML; `env`/`ksh` to shell; XML-family extensions above to XML; `jsonl`/`ndjson`/`jsonc`/`geojson` fences to JSON.
- Exact-filename resolution before lowercased extension lookup so `Makefile`, `Gemfile`, `Rakefile`, `Cargo.lock`, `Dockerfile`, `Containerfile`, and similar names select their grammars.
- The frontend diff tokenizer maps JSON Lines and XML-family extensions to its existing `json` and `xml` kinds.

Grammars are syntect-compatible `sublime-syntax` (version 1 features only, no `extends`). They target readable keyword/string/comment/number/operator scopes rather than full language fidelity.

## HTML Rendered View

HTML previews mirror the Markdown Raw / Preview pair: the same two-button header group, glyphs, and titles; `1` selects Raw, `2` selects Preview, `Shift+P` toggles, and the choice is persisted (default Raw). Formatting is a separate icon toggle (`aria-pressed`, `Shift+F`) that applies to the Raw view; pressing it while in Preview returns to Raw. JSON, XML, CSS, and JavaScript keep their Raw / Formatted group.

The Preview is frontend-only: an `<iframe sandbox="">` (no scripts, opaque origin) loads the file through the existing asset protocol with revision and refresh query parameters, like the PDF pane. The URL keeps `/` separators literal so relative stylesheets and images resolve next to the document. The existing CSP (`frame-src asset:`) is unchanged, so remote resources do not load. Enabling scripts is out of scope because local pages would execute inside the application webview.

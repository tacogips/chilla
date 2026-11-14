# Content-First Source Preview Layout

## Requirement

JSON, Python, and other source previews should devote the pane to file contents. Remove stacked outer/card/code padding and the oversized metadata block above the source. Keep only essential file information in a compact footer.

## Design

- Add an explicit frontend source-preview layout mode for text files and raw CSV. Preserve rendered Markdown, images, PDF/media, EPUB, and formatted CSV behavior.
- Let source content fill the available pane width and height. Use one code scroll area with a small readable inset, no centered width cap, and no nested decorative card.
- Generate source HTML with the existing highlighted source followed by a semantic compact footer. Show language and file size without verbose labels; retain invalid-UTF-8 notices so data-loss warnings are not hidden.
- Keep the filename identity compact. Avoid redundant source subtitle metadata above the content. Preserve zoom controls and make source zoom affect code, not footer/chrome or available pane dimensions.
- Keep the footer outside the code scroll area, including on long files and small panes. Long lines must remain complete and horizontally scrollable.
- No Tauri JSON command/payload changes or extra whole-document HTML parsing are required. Update backend HTML and frontend styling together.

## Compact Toolbar Actions

The user additionally requests icon-only Open files and Git diff actions. Use existing local SVG icon conventions, preserve click handlers, disabled/conditional state, accessible labels, and shortcut-aware tooltips. Keep the return-to-file-view counterpart consistent with the icon-only mode control. Do not add icon dependencies or change keyboard shortcuts.

## Verification

Test footer placement and escaping, empty/long source, invalid UTF-8, text/CSV wiring, source zoom, and non-source isolation. Run Rust/Bun checks and independently review the changes. Rebuild and launch the debug app with synthetic Python and JSON files. If native visual tools are unavailable, explicitly distinguish DOM/CSS checks and app command logs from visible layout verification.

## Completed Implementation and Verification

Source content now fills the pane with an 8px code inset and one scroll area. A semantic footer below the code displays language and size, retaining encoding warnings. Source mode removes the redundant subtitle and Markdown styling/enhancement pass; it inserts source HTML only once per update. Code zoom changes font size without scaling the footer or pane geometry. Open files, Git diff, and the return-to-file-view action use local SVG icons while preserving accessible labels, tooltips, and callbacks.

Independent verification passes 212 Rust tests, 351 DOM tests, 39 Bun tests, all-target Clippy, typechecking, and scoped lint. Native screenshots confirm Python and JSON filling the content area, metadata pinned below the scrolling code, and icon-only toolbar controls. Clicking the file-open icon opens the native chooser. Code-only zoom and non-source mode isolation are covered by automated tests; native zoom-key behavior was not confirmed.

The rebuilt debug binary is `target/debug/chilla`. To avoid interacting with existing user instances, native checks used an isolated temporary bundle containing the rebuilt binary/assets, with a distinct local identifier and ad-hoc signature: `open -n /tmp/chilla-exhaustive-launch.Yu69di/chilla-verify.app --args --verbose /tmp/chilla-exhaustive-launch.Yu69di/sample.json`. The user took over that window, so it was left open. Build logs and synthetic fixtures remain in `/tmp/chilla-exhaustive-launch.Yu69di/`; no private source was added to fixtures or documentation. Performance/build evidence is linked from [the syntax report](design-syntax-inventory.md#verification-status).

# Chilla file viewer artwork

Approved by the user on 2026-11-15 as chilla’s new visual identity.
`chilla-icon.png` is the adopted logo; `chilla-theme.png` is its companion
theme illustration. Native app icons, the empty screen, README, and bilingual
product-page branding use these assets.

Generated on 2026-11-15 with `runwayml-cli`. The icon uses layered documents,
a split viewer, and a graphite/ivory/teal palette. The matching theme illustration
adds image and table sheets. Both sources have transparent surroundings.

`icon-request.json` and `theme-request.json` contain the exact generation inputs.
`provenance.json` records task IDs, dimensions, source hashes, and the theme edge
cleanup task. Credential values and signed download URLs are intentionally absent.

## Regeneration

Run secret-dependent CLI commands through `kinko exec --all --`. Use
`runwayml-cli mcp call generate_image --data <request-file>` and retrieve completed
results with `get_task`. The theme request references the original icon task; use
a new icon task ID when generating a replacement identity.

Generate native formats with `bun run tauri icon doc/branding/chilla-icon.png`
and retain the existing platform filenames in `src-tauri/icons/`. The app source
`icon.png` is resized to 1024 square. The empty-screen PNG fits within 768 pixels;
the product-page illustration is WebP quality 88. The social card, touch icon,
and favicon are 512, 180, and 64 square respectively. The README uses the theme
master directly. Historical screenshots are preserved without retouching.

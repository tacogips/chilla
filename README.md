# chilla: lightweight file and Git viewer

<img src="doc/empty-state-cat.png" alt="Pixel-art cat peeking in from the side" width="320" />

`chilla` is a lightweight file and Git viewer built with Tauri, Bun, Solid.js, and Rust. It opens directories, files, Git diffs, and GitHub diff URLs from the command line, then previews Markdown, text, images, video, PDF content, and changed files inside a desktop UI.

Product website: [chilla-viewer.com](https://chilla-viewer.com/)

## Install

### macOS: Homebrew Cask

```bash
brew tap tacogips/tap
brew install --cask chilla
```

This installs the signed and notarized macOS application bundle through Homebrew. After installation, launch it from `Applications` or from the command line:

```bash
open -a chilla
chilla .
```

To upgrade later:

```bash
brew update
brew upgrade --cask chilla
```

To uninstall:

```bash
brew uninstall --cask chilla
```

Current Homebrew caveats:

- the cask installs the macOS Apple Silicon DMG release artifact
- it is currently constrained to Apple Silicon via Homebrew `depends_on arch: :arm64`
- Homebrew trust comes from the published signed and notarized DMG

### macOS: Direct DMG Download

For Apple Silicon Macs, download the signed and notarized DMG directly from the latest GitHub release:

```text
https://github.com/tacogips/chilla/releases/latest
```

Manual install steps:

1. Open the latest release page.
2. Download the Apple Silicon DMG asset named like `chilla_<version>_aarch64.dmg`.
3. Open the downloaded `.dmg` file.
4. Drag `chilla.app` into `Applications`.
5. Eject the mounted DMG.
6. Launch `chilla` from `Applications`, or run `open -a chilla` from Terminal.

If macOS Gatekeeper asks for confirmation on first launch, open the app from Finder with `Control` + click, choose `Open`, then confirm. The published DMG is signed and notarized; that prompt is the normal first-launch confirmation path when opening newly downloaded apps.

Use the direct DMG route when you do not use Homebrew, or when you want to manually download a specific release asset.

### Install Script

The repository also includes a root-level `install.sh` for installing release tarballs:

```bash
curl -fsSL https://raw.githubusercontent.com/tacogips/chilla/main/install.sh | bash
```

Specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/tacogips/chilla/main/install.sh | bash -s -- v0.1.1
```

Uninstall:

```bash
curl -fsSL https://raw.githubusercontent.com/tacogips/chilla/main/install.sh | bash -s -- uninstall
```

Installer behavior:

- resolves the current platform as one of `aarch64-darwin`, `x86_64-darwin`, `aarch64-linux`, or `x86_64-linux`
- prefers a matching archive in a local `release/` directory when present
- otherwise downloads the latest GitHub release asset named `chilla-v<version>-<target>.tar.gz`
- installs the extracted release tree under `~/.local/share/chilla/releases/`
- updates `~/.local/bin/chilla` to point at the installed wrapper
- can update the user's shell profile with a managed PATH block unless `--no-modify-path` is used
- supports `./install.sh uninstall` to remove the installed files and managed PATH block

New installer tarballs are built natively with `mise run package-native` and contain `bin/chilla`, not a `.app` bundle. Older published tarballs may still depend on `/nix/store`; use the signed DMG/Homebrew cask on macOS. Linux tarballs require compatible GTK/WebKitGTK system libraries.

For most macOS users, prefer the Homebrew Cask or direct DMG install paths above.

## Run

From an installed binary, the CLI shape is:

```bash
chilla [path]
```

Examples:

```bash
chilla
chilla .
chilla docs/
chilla notes.md
chilla movie.mp4
```

During development:

```bash
mise run dev
```

The development task accepts paths in the same style:

```bash
mise run dev --
mise run dev -- README.md
```

## Captures

README preview:

<img src="doc/captures/readme-capture.png" alt="chilla rendering the repository README in the preview pane" width="720" />

Git diff viewer:

<img src="doc/captures/git-diff-capture.png" alt="chilla showing a split Git diff with changed files in the sidebar" width="720" />

Movie preview:

<img src="doc/captures/movie-capture.png" alt="chilla showing a movie file in the preview pane" width="720" />

## Current Product Shape

The repository design documents started from a Markdown workbench concept, then evolved toward a lightweight file and Git viewer. The current implementation is closer to a yazi-like desktop viewer/browser than a full Markdown editor:

- `chilla` with no arguments opens the current working directory.
- `chilla <dir>` opens that directory in file-view mode.
- `chilla <file>` opens the file's parent directory and previews the selected file.
- Markdown files get a richer preview flow with:
  - rendered HTML
  - heading extraction
  - a toggleable table of contents
  - Mermaid rendering in the preview pane
  - local image links, including HEIC / HEIF assets when the platform WebView can decode them
- Non-Markdown files are previewed according to type:
  - images: inline image preview, including HEIC / HEIF when the platform WebView can decode the file
  - video: embedded video preview
  - PDF: embedded iframe preview
  - text-like files: syntax-highlighted source preview with prebuilt grammar data and a native regex engine for faster loading; Markdown code fences share the same engine
  - source preview layout: full-pane code with a small inset, independent scrolling/zoom, and compact language/size metadata in a footer
  - diff highlighting: shared token scanning and span coalescing across all 28 tokenizer kinds; see the [complete syntax inventory and measured results](design-docs/specs/design-syntax-inventory.md)
  - JSON files: dedicated source highlighting that preserves original formatting and avoids general-purpose grammar parsing
  - binary files: metadata/placeholder preview

Markdown source can be edited in the raw pane and saved back to disk. If the file changes on disk while the editor has unsaved changes, chilla keeps the local buffer and surfaces a conflict flow instead of silently overwriting it.

## Features

- File browser with List and Tree views and keyboard navigation inspired by terminal file managers, including toolbar icons for filtering and Git-ignored visibility, compact absolute-path display with full-path hover text, a `Tab` directory-information tree, dedicated symbolic-link icons, and link destinations relative to the current directory with full-path hover text
- Tree view roots the left pane at the current directory and expands folders inline. Ordinary browsing starts in List; Git and GitHub diffs start in Tree, with changed files grouped into folders. Use the List/Tree controls to switch views.
- Markdown heading extraction and table of contents
- Direct Markdown view selection with `1` for raw source and `2` for rendered preview
- Backend-owned Markdown parsing in Rust
- Mermaid hydration on the frontend after preview render
- Active preview headers show the selected file name across Markdown, text, image, CSV, EPUB, PDF, audio, and video views
- Local Markdown image resolution with HEIC / HEIF image fallback and open-in-default-app affordance when the WebView cannot render an image
- Direct image-file previews for AVIF, APNG, BMP/DIB, GIF, HEIC/HEIF, ICO, JPEG, PNG, SVG, TIFF, and WebP files that the platform WebView can decode
- Touch-style left-button drag panning for direct SVG and raster image previews
- GitHub diff URL viewer for pull requests, commits, and compares with changed-file browsing, GitHub jump action, cached diff loading, text modes for left/right, stack, and full-file review, plus rendered SVG image review
- Local Git diff viewer for uncommitted repository changes and commit/range startup diffs using the same review modes
- Automatic refresh of opened Markdown documents when the file changes on disk, including common atomic-replace save patterns
- Workspace refresh that re-reads the current directory or explicit file set and active local preview, and renews local image, PDF, media, and Markdown-embedded asset URLs even when file timestamps are unchanged
- Direct CSV view selection with `1` for raw source and `2` for formatted table when available
- Theme toggle with frontend CSS variables and backend syntax-theme synchronization
- Custom desktop toolbar, with a native macOS title bar for window-manager compatibility
- Startup window size and position fit the monitor's usable area, including smaller displays
- Compact window minimum (320 × 240) allows half, third, and quarter tiling with window managers

In directory Tree view, folders load as you expand them. The name filter applies
to loaded files and keeps folders available for further browsing; use Load more
for large folders. Diff filtering searches all changed paths and reveals matching
files with their parent folders.

List and Tree use icon buttons on the toolbar's left side; filter and Git-ignore
visibility controls sit on the right. Click the filter icon or press `f` or `/` to show
and focus the search field. Press `Esc` in that field to clear and close it.

The directory toolbar also has **Search file contents** (`Shift+S`) and **Find files** (`s`) icons.
Enter a query and press Enter or `Ctrl+M` to search recursively below the current
directory and focus the first result. With current results, either key returns
to the first result without repeating the search.
Content search finds literal, case-sensitive text and shows matching lines with
their paths and line numbers. Find files matches part of a filename or relative
path, ignoring case. Use the arrow keys to navigate results; `j`/`k`
also move down/up while a result is focused. Focusing a result previews the file.
Click a result or press Enter on it to open the file. Press `l` on a result, or
click its right-arrow icon, to browse its containing directory with that file
selected and focused.
From results or browsing, press `s` or `Shift+S` to focus the corresponding search
field again. Each mode retains its query when reopened; these keys still type
normal text inside input fields. Escape closes search and returns to browsing.
Both searches follow Git-ignore visibility.
Search skips symlinks and Git metadata; content search also skips binary,
non-UTF-8 and oversized files. Skipped entries and incomplete results are reported.

Each directory expansion reads only its immediate children, in pages of up to
200 entries. Switching views reuses a compatible loaded root, and reopening a
cached folder does not fetch another page. Unopened descendants remain unloaded.

## Keyboard Shortcuts

Default global shortcuts:

- `?`: show help
- `Esc`: close help
- `q`: quit the app
- `Ctrl+D`: page the active file view down; in Git diff mode, page the selected diff file view rather than the changed-file sidebar
- `Ctrl+U`: page the active file view up; in Git diff mode, page the selected diff file view rather than the changed-file sidebar
- `j` or `ArrowDown`: scroll the active file view down one line when the file tree is hidden
- `k` or `ArrowUp`: scroll the active file view up one line when the file tree is hidden
- `Shift+L`: collapse or expand the left pane; the sidebar icon in the main toolbar provides the same action, including in Git diff mode. When folded, a small tab at the left edge of the content area also expands it with the mouse.
- Collapsing the left pane moves keyboard focus to the preview and disables hidden browser controls and shortcuts. Expanding restores browser focus and navigation. Starting chilla with file arguments opens the preview with the left pane collapsed; opening a directory keeps it expanded.
- `g`: toggle local Git diff for the opened repository
- `y`: copy the selected file or directory absolute path
- `r`: refresh the current directory or explicit file set and active local file
- `Shift+T`: toggle table of contents for Markdown
- `Shift+P`: switch Markdown raw/preview pane
- `1`: select raw view for Markdown or CSV
- `2`: select Markdown preview or formatted CSV view when available
- `+` / `-`: native preview zoom, from 50%-300% for rendered content or 50%-800% for direct SVG/raster images, in 10% steps (not configured by keymap.toml)
- `Ctrl+mouse wheel`: native preview zoom under the pointer (not configured by keymap.toml)
- `Shift+D`: toggle light/dark theme, including while browsing files

Theme switching uses `Shift+D` so `Shift+S` remains dedicated to content search.
Navigation, scrolling, and numeric view shortcuts act on the active document or diff context.

File tree shortcuts:

- `t`: toggle List/Tree view in directory browsing and Git/PR diffs
- `f` or `/`: show and focus filter
- `s`: find files recursively by filename or relative path
- `Shift+S`: search file contents recursively (literal, case-sensitive)
- `.`: toggle Git-ignored entries in directory browsing
- `Tab`: show the current directory's absolute path and metadata as a root-to-leaf tree
- `Esc`: close directory information, or clear and close the filter and return to the list when the filter is focused
- `j` or `ArrowDown`: move selection down
- `k` or `ArrowUp`: move selection up
- `,` then `a` / `A`: sort by name ascending / descending
- `,` then `e` / `E`: sort by extension ascending / descending
- `,` then `m` / `M`: sort by modified time ascending / descending
- `,` then `s` / `S`: sort by size ascending / descending
- `,` then `0`, or plain `0`: reset sort to default (`name` ascending)
- `h` or `ArrowLeft`: go to the parent directory in List view; in Tree view, collapse the current folder or select its parent
- `l` or `ArrowRight`: open the selection in List view; in Tree view, expand a folder or move to its first child
- `Enter`: open a file or toggle a folder in Tree view
- `Ctrl+M`: same as `Enter` in the filter field

Press the comma prefix first, then release it and press the second key.
A popup at the app window's bottom-right lists all available next keys and their actions, remaining open while
you read it. Choose a key or press `Esc` to close it; moving focus away or
changing browser context also cancels the sequence. Uppercase second keys use
Shift. Recursive search shortcuts apply only to filesystem directory browsing.

Video preview:

- Opening a video from the file tree requests playback immediately when the webview allows it.
- The preview overlay uses a focused play button with an icon-only affordance and an accessible label for the current file.
- `Space`: play/pause when supported by the platform/webview

Image preview:

- Markdown image links resolve local image paths relative to the Markdown document, including `.heic`, `.heif`, `.heics`, and `.heifs` files.
- Direct file previews classify AVIF, APNG, BMP/DIB, GIF, HEIC/HEIF, ICO, JPEG (`.jpg`, `.jpeg`, `.jpe`, `.jfif`), PNG, SVG, TIFF, and WebP files as images instead of generic binary or text files.
- Display support depends on the platform WebView decoder; when an image cannot render, chilla shows a fallback with an option to open the file in the default app.

CSV preview:

- `1`: raw CSV source
- `2`: formatted CSV table when parsing and safety limits allow it
- Numeric CSV view shortcuts are ignored while typing in editable controls such as the file filter.

Diff viewer:

- Pass a GitHub diff URL to open read-only GitHub diff mode:
  - `https://github.com/<owner>/<repo>/pull/<number>`
  - `https://github.com/<owner>/<repo>/pull/<number>/files`
  - `https://github.com/<owner>/<repo>/commit/<sha>`
  - `https://github.com/<owner>/<repo>/compare/<base>...<head>`
- PR, commit and compare `.diff`/`.patch` URLs are accepted as equivalent startup targets. A literal trailing `.diff`/`.patch` is treated as a transport suffix; use an encoded dot (`%2E`) when it belongs to a compare ref name.
- GitHub shorthand:
  - PR: `chilla github:<owner>/<repo> <number>`
  - Branch comparison: `chilla github:<owner>/<repo> 'main...feature/branch'`
  - Commit: `chilla github:<owner>/<repo> abcdef12`
  - Explicit commit (including all-numeric SHAs): `chilla github:<owner>/<repo> commit:12345678`
  - Bare decimal numbers always mean PR numbers; commit SHAs accept 4–40 hexadecimal characters.
- Changed files open in Tree view by default; expand directories to navigate the diff like a file tree.
- Use the header reload button or `r` (configurable `document.reload`) to fetch the active diff again. GitHub reload bypasses snapshot cache reuse, preserves surviving selection/tree context, and clears stale full-file previews.
- Add `--no-github-diff-cache` before the URL or shorthand to bypass the temp-directory cache. The older `--no-pr-diff-cache` flag remains available as a compatibility alias.
- Open a directory inside a Git repository and use `Git diff` to switch to uncommitted-change diff mode.
- Start commit/range diff mode with:
  - `chilla <git-dir> <commit>`
  - `chilla <git-dir> <base>..<head>`
  - `chilla <git-dir> <base>...<head>`
- `1`: left/right diff
- `2`: stack diff
- `3`: full-file view
- `4`: rendered image view for SVG files
- `Tab`: cycle diff modes in the same order, including image view for SVG files
- `Ctrl+D`: page the selected diff file view down
- `Ctrl+U`: page the selected diff file view up
- `o`: open the pull request, commit, or compare source in GitHub when reviewing a GitHub diff
- Full-file view shows the latest file content, highlights added and modified lines, and marks deleted locations with a thin red line without rendering deleted content.
- SVG image view renders the latest complete SVG in an isolated image without replacing the existing XML/text review modes.

Workspace errors and keymap warnings appear as top-right overlays without moving
the panes. Close a message with its dismiss button, or let it disappear after
8 seconds; hovering or focusing the message pauses the timer. Conflict-resolution
prompts remain visible until addressed.

## Custom Keybindings

Create `~/.config/chilla/keymap.toml` and restart chilla to customize browser
and workspace shortcuts. This location also applies on macOS. If
`XDG_CONFIG_HOME` is an absolute path, chilla instead reads
`$XDG_CONFIG_HOME/chilla/keymap.toml`. Missing configuration keeps the defaults;
chilla does not create or overwrite the file automatically.

The format follows [Yazi's keymap model](https://yazi-rs.github.io/docs/configuration/keymap/),
using chilla's own built-in action names:

```toml
[[mgr.prepend_keymap]]
on = ["g", "f"]
run = "search.name"
desc = "Find filenames recursively"

[[mgr.prepend_keymap]]
on = ["g", "s"]
run = "search.content"
desc = "Search file contents recursively"

[[workspace.prepend_keymap]]
on = ["<C-b>", "t"]
run = "theme.toggle"
desc = "Toggle theme"
```

Pressing a prefix such as `g` shows the remaining configured keys and
descriptions in the bottom-right popup. See [examples/keymap.toml](examples/keymap.toml)
for a copyable example. `on` accepts one key or an array of up to eight keys;
`run` accepts one built-in action or an ordered array of actions. `desc` is
optional. Normal typing and native editor/media controls are not remapped.

Contexts are `[mgr]` for directory/file-set and diff browsers, and `[workspace]`
for app actions. Each supports:

- `prepend_keymap`: higher-priority overrides.
- `keymap`: replace that context's defaults; `keymap = []` disables them.
- `append_keymap`: lower-priority additions.

First matching entries win, including prefix conflicts: a prepended sequence
can take over a default single key. Use `run = "noop"` in a prepended entry to
disable a particular binding. Browser bindings take precedence over workspace
bindings in browser context. Browser defaults differ between filesystem and
diff modes; the same custom `[mgr]` entries apply to both.
Choose a workspace prefix that does not conflict with browser bindings when
you want it available there too; the example uses Ctrl+B followed by `t`.

Keys are case-sensitive: `s` and `S` differ. Named keys include `<Enter>`,
`<Esc>`, `<Space>`, `<Tab>`, arrows, `<Home>`, `<End>`, `<PageUp>`, `<PageDown>`,
and function keys. Modifiers use `<C-s>` (Ctrl), `<D-s>` (Command/Super),
`<A-s>` (Alt/Option), `<S-Tab>` (Shift), or combinations such as `<C-S-s>`.
Escape cancels a pending sequence; the popup has no timeout.
Escape therefore cannot be used as a continuation key. While typing in editable
controls, only Ctrl/Command bindings for `document.save`, `files.open`, or `noop`
are considered; ordinary text and native editing keys remain untouched.

Browser actions: `cursor.up`, `cursor.down`, `parent`, `enter`, `open`, `filter`,
`search.name`, `search.content`, `view.toggle`, `ignored.toggle`,
`directory.info`, `sort.reset`, and `sort.FIELD.DIRECTION` where FIELD is
`name`, `extension`, `mtime`, or `size` and DIRECTION is `asc` or `desc`.
Diff actions: `diff.previous`, `diff.next`, `diff.view.cycle`, `diff.view.split`,
`diff.view.stack`, `diff.view.full`, `diff.view.image`, `diff.open`,
`scroll.up`, and `scroll.down`. Actions unavailable in the current browser
mode have no effect.

Workspace actions: `help`, `quit`, `files.open`, `document.save`,
`document.reload`, `path.copy`, `sidebar.toggle`, `git.toggle`, `toc.toggle`,
`presentation.toggle`, `presentation.raw`, `presentation.rendered`,
`theme.toggle`, `scroll.up`, `scroll.down`, `document.previous`, and
`document.next`. `noop` is valid in either context.

Invalid TOML, unknown fields/actions, invalid key notation, or files larger
than 64 KiB produce a visible warning and retain built-in defaults atomically.
`run` never executes shell commands or scripts. Reloading configuration requires
restarting chilla.

## Architecture

The app is split across a typed Tauri boundary:

- `src-tauri/`
  - CLI parsing and startup target resolution
  - directory listing and file classification
  - Markdown rendering and heading extraction
  - syntax highlighting
  - filesystem watching for Markdown refresh
- `src/`
  - workspace shell and desktop UI
  - file browser interactions
  - preview panes for Markdown, image, text, PDF, and video
  - theme management
  - Mermaid enhancement after HTML injection

Key runtime contracts:

- `StartupContext`: initial workspace mode, directory, and selected file
- `DirectorySnapshot`: current directory listing
- `DocumentSnapshot`: Markdown source, rendered HTML, headings, and revision metadata
- `FilePreview`: typed preview union for Markdown, image, video, PDF, text, and binary files

## Project Layout

```text
.
├── src/                 # Solid.js frontend
├── src-tauri/           # Rust + Tauri backend
├── design-docs/         # design notes and specs
├── impl-plans/          # implementation plans
├── mise.toml            # tool versions and development/CI tasks
└── package.json         # locked Bun scripts/dependencies
```

## Development

### Prerequisites

- [mise](https://mise.jdx.dev/) 2026.8.3 or newer
- macOS: Xcode Command Line Tools (full Xcode for signing/notarization)
- Linux: native Tauri libraries, installed separately from mise

The repository follows [ign-template's tauri-v1](https://github.com/tacogips/ign-template/tree/cd4284b7c942f3b1bc38b81212525830e6c99bb8/tauri-v1): mise supplies Bun, Node and Rust (including rustfmt/clippy); the OS supplies native SDKs/libraries. Nix and direnv are not required. Frontend tools such as Biome come from the Bun lockfile.

On Ubuntu 24.04, install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/):

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config curl wget file libssl-dev \
  libwebkit2gtk-4.1-dev libxdo-dev libayatana-appindicator3-dev librsvg2-dev
# Additional packages for desktop E2E:
sudo apt-get install -y webkit2gtk-driver xvfb xauth dbus-x11 fonts-dejavu-core
```

### Set up tools and dependencies

```bash
mise install
mise run install
```

### Common commands

```bash
mise run dev
mise run build
mise run package-native
mise run test
mise run test-tauri-e2e-linux
mise run check
mise run clippy
mise run fmt
mise run verify
```

Equivalent package-manager commands:

Use `mise exec -- <command>` when your shell does not have mise activation enabled.

```bash
bun run dev
bun run build
bun run typecheck
bun run test
bun run test:tauri:e2e:linux
CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml
```

`mise run build` compiles the Tauri backend with Cargo `--release`.
`mise run tauri-build` creates the packaged desktop binary with Tauri's release build.
`mise run package-native -- [output-directory]` produces a native installer tarball
and checksum (default `release/`), refusing existing artifacts and Nix-linked
binaries. It does not publish anything. `mise run verify` includes the DOM suite.

### Linux desktop E2E

The repository also includes a Linux-only desktop smoke test that runs the real Tauri app through `tauri-driver`:

```bash
mise run test-tauri-e2e-linux
```

Notes:

- The task installs pinned `tauri-driver` through mise. `WebKitWebDriver` must be on `PATH` from the OS `webkit2gtk-driver` package, not mise.
- If `DISPLAY` is not set, the runner falls back to `Xvfb` when available.
- The smoke test opens the real workspace, filters to `README.md`, and verifies the rendered Markdown preview.

## macOS DMG Releases

The repository now also contains a separate Tauri macOS bundle flow for direct `.app` and `.dmg` builds:

```bash
mise run bundle-macos-dmg
```

That path uses `src-tauri/tauri.macos.release.conf.json` and is intended for Apple Developer ID signing/notarization on a local macOS release machine. Apple certificate material should stay in the local keychain and password manager, not in GitHub Actions secrets.

The local release task expects these environment variables to be exported by the local password-manager workflow:

- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD` (an Apple app-specific password)
- `APPLE_TEAM_ID`

Publish signed/notarized macOS release assets from the local machine with:

```bash
mise run release-macos-dmg-local -- v0.3.0
```

The release task mounts the final DMG read-only and verifies the embedded app's
Developer ID signature, stapled notarization ticket, and Gatekeeper acceptance
before uploading either release asset.

Repository-local GitHub Actions build unsigned `.app`/`.dmg` artifacts only for validation. They do not sign, notarize, or publish trusted release assets.

## Verification Status

The following commands were confirmed passing while preparing this README:

- `bun run typecheck`
- `bun run test`
- `CARGO_TERM_QUIET=true cargo test --manifest-path src-tauri/Cargo.toml`

## Design Notes

The design docs under `design-docs/specs/` still reflect two overlapping phases of the product:

- the original Markdown workbench design
- the later file-view mode extension

The implementation has already adopted file-view startup and multi-type preview behavior, so the source code is the more accurate reference for current behavior. The active implementation plans should be read as planning artifacts, not as a precise status dashboard.

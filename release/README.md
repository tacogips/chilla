# Release Directory Contract

This directory is the local staging area for packaged `chilla` release artifacts.

The repository root `install.sh` can install directly from this directory before assets are uploaded to GitHub Releases.

This contract currently covers the existing Nix tarball release path used by `install.sh` and the current custom Homebrew cask. The repository also contains a separate macOS Tauri bundle flow for `.app` / `.dmg` creation; that bundle flow does not replace this tarball contract yet.

## Expected filenames

Artifacts must use this naming scheme:

```text
chilla-v<version>-<target>.tar.gz
chilla-v<version>-<target>.sha256
```

Supported target suffixes:

- `aarch64-darwin`
- `x86_64-darwin`
- `aarch64-linux`
- `x86_64-linux`

Example:

```text
release/
├── README.md
├── chilla-v0.1.1-aarch64-darwin.tar.gz
├── chilla-v0.1.1-aarch64-darwin.sha256
├── chilla-v0.1.1-x86_64-linux.tar.gz
└── chilla-v0.1.1-x86_64-linux.sha256
```

## Archive contents

Each tarball must expand to a top-level directory whose name matches the tarball basename without `.tar.gz`.

Example:

```text
chilla-v0.1.1-x86_64-linux/
├── bin/chilla
└── lib/
```

`bin/chilla` is currently a Nix-generated wrapper script. The release is therefore a full directory tree, not a single binary and not the new Tauri `.app` / `.dmg` bundle path.

## Checksum format

The `.sha256` file must checksum the tarball itself, not `bin/chilla`.

Example:

```bash
shasum -a 256 release/chilla-v0.1.1-x86_64-linux.tar.gz | \
  awk '{ print $1 "  chilla-v0.1.1-x86_64-linux.tar.gz" }' \
  > release/chilla-v0.1.1-x86_64-linux.sha256
```

## Packaging example

```bash
mkdir -p release
cp -RL result release/chilla-v0.1.1-x86_64-linux
tar -C release -czf release/chilla-v0.1.1-x86_64-linux.tar.gz chilla-v0.1.1-x86_64-linux
shasum -a 256 release/chilla-v0.1.1-x86_64-linux.tar.gz | \
  awk '{ print $1 "  chilla-v0.1.1-x86_64-linux.tar.gz" }' \
  > release/chilla-v0.1.1-x86_64-linux.sha256
```

## Installer usage

The installer can use this directory directly:

```bash
./install.sh
./install.sh v0.1.1
./install.sh uninstall
```

If a matching local archive exists in `release/`, the installer prefers it over GitHub Releases.

## Homebrew Cask

The custom Homebrew cask lives in the tap repository `tacogips/homebrew-tap`.

That cask currently points at the published macOS Apple Silicon tarball:

```text
chilla-v<version>-aarch64-darwin.tar.gz
```

The cask links `bin/chilla` into Homebrew's `bin` directory using the `binary` artifact stanza rather than installing a `.app` bundle. Because the Darwin artifact is still produced from the Nix package output, the cask should be treated as a custom-tap convenience install and not as a fully self-contained macOS app distribution.

## macOS DMG Bundle Flow

The repository now also contains a dedicated Tauri macOS bundle config at `src-tauri/tauri.macos.release.conf.json` and a local task:

```bash
task bundle-macos-dmg
```

That flow targets `app,dmg` bundles and is intended for Apple signing/notarization. It is additive: it does not change the tarball filenames, directory layout, or installer behavior documented above.

Apple signing/notarization support is driven by CI or local environment variables:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`
- `KEYCHAIN_PASSWORD`

Until the Homebrew tap is migrated, the DMG flow should be treated as the direct-download macOS distribution path, while the tarball flow remains the installer/tap compatibility path.

Users can install it with:

```bash
brew tap tacogips/tap
brew install --cask chilla
```

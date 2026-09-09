# Release Directory Contract

This directory is the local staging area for packaged `chilla` release artifacts.

The repository root `install.sh` can install directly from this directory before assets are uploaded to GitHub Releases.

This contract covers native tarballs built through mise for `install.sh`. The macOS Homebrew cask uses the separate signed `.app` / `.dmg` flow described below. Older published Nix tarballs are historical artifacts and are not changed by the build migration.

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
└── LICENSE
```

`bin/chilla` is a native executable built with the mise-managed Rust toolchain and embedded frontend assets. Packaging rejects Nix-linked executables. Linux still requires compatible system GTK/WebKitGTK libraries; this is not a static or cross-distribution bundle. Public macOS distribution should use signed/notarized DMGs.

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
mise install
mise run install
mise run package-native
# Optional separate output directory:
mise run package-native -- /tmp/chilla-artifacts
```

The task reads the project version, builds for the current native architecture,
checks executable type/version and shared-library linkage, and emits the archive
and checksum. Existing artifact filenames are refused rather than overwritten.
No release upload, tag, or Homebrew update is performed.

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

That cask currently points at the published macOS Apple Silicon DMG:

```text
chilla_<version>_aarch64.dmg
```

The cask installs `chilla.app` from the signed and notarized DMG and links
`chilla.app/Contents/MacOS/chilla` into Homebrew's `bin` directory.

## macOS DMG Bundle Flow

The repository now also contains a dedicated Tauri macOS bundle config at `src-tauri/tauri.macos.release.conf.json` and a local task:

```bash
mise run bundle-macos-dmg
```

That flow targets `app,dmg` bundles and is intended for Apple signing/notarization. It is additive: it does not change the tarball filenames, directory layout, or installer behavior documented above.

Trusted macOS release assets are signed and notarized locally. Apple certificate material should remain in the local keychain and password manager, not in GitHub Actions secrets. Export the notarization environment from the local password-manager workflow:

- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

Then publish the trusted DMG and `.app` zip with:

```bash
mise run release-macos-dmg-local -- v0.2.0
```

The local release task mounts the final DMG and verifies the embedded app with
strict code-signing, stapler, and Gatekeeper checks before upload.

GitHub Actions only produce unsigned validation artifacts for this bundle flow.

The DMG flow now backs both direct-download macOS distribution and the Homebrew cask, while the tarball flow remains the `install.sh` compatibility path.

Users can install it with:

```bash
brew tap tacogips/tap
brew install --cask chilla
```

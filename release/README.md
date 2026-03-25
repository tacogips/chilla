# Release Directory Contract

This directory is the local staging area for packaged `chilla` release artifacts.

The repository root `install.sh` can install directly from this directory before assets are uploaded to GitHub Releases.

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

`bin/chilla` is currently a Nix-generated wrapper script. The release is therefore a full directory tree, not a single binary and not a `.app` bundle.

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

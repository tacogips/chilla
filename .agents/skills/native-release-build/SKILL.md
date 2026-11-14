---
name: native-release-build
description: Build and validate installer-compatible chilla tarballs through mise on macOS or Linux. For signed macOS DMGs use macos-release-build instead.
---

# Native Tarball Builds

Read `release/README.md` for the archive and installer contract. Use
`mise install`, `mise run install`, then `mise run package-native` (optional
output directory after `--`). Native SDKs/WebKitGTK are OS prerequisites listed
in README, not supplied by mise. No Nix shell or store is required.

The packaging task builds the current native target, checks architecture,
version and linkage, refuses Nix-linked executables and existing artifact paths,
and writes the versioned tarball and SHA-256 sidecar. Do not bypass these checks
to publish an artifact. Verify archive paths, checksum and extracted `--version`.
Linux artifacts require compatible system GTK/WebKitGTK libraries. A native
tarball is not evidence of macOS signing/notarization or Linux portability.

Building does not authorize creating tags, GitHub releases, uploads, installer
profile changes, or Homebrew updates. Perform those only when requested.
Older published Nix-based tarballs remain historical; do not claim this local
migration repairs them. Preserve preexisting release artifacts and report
build target, output paths, validation and platform limitations.

# macOS DMG Release Design

This document describes the first repository-local step from the current Nix tarball release toward a notarizable macOS distribution for `chilla`.

## Overview

The current Darwin release artifact is a Nix-packaged directory tree (`bin/chilla` + `lib/`) published as a `.tar.gz`. That shape works for local Nix users and the existing custom Homebrew cask, but it is a poor fit for Gatekeeper because the linked binary is not shipped as a standard signed macOS bundle.

The target direction is to add a second Darwin distribution track:

- keep the existing Nix tarball contract for `install.sh` and the current Homebrew tap
- add a Tauri-produced `app,dmg` bundle flow for direct macOS distribution
- wire signing and notarization through Apple-provided CI secrets

## Release Shape

The repository should support two Darwin outputs with different purposes:

1. Nix tarball release
   - current `chilla-v<version>-aarch64-darwin.tar.gz`
   - remains the compatibility path for `install.sh`
   - remains the fallback path for the existing custom Homebrew cask until that cask is migrated

2. Tauri macOS bundle release
   - `.app` and `.dmg` built through Tauri on a macOS runner
   - intended for signing, notarization, and direct user download
   - should use the same application identifier as the desktop app (`com.tacogips.chilla`)

## Build Configuration

The base `src-tauri/tauri.conf.json` should remain compatible with the current Nix package flow. macOS bundle settings should therefore live in a dedicated override config used only for release bundling.

Representative override shape:

```json
{
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "macOS": {
      "minimumSystemVersion": "12.0"
    }
  }
}
```

This keeps the current Linux/Nix release contract stable while allowing explicit macOS bundling commands and CI jobs to opt into DMG creation.

## Signing And Notarization

The macOS bundle flow should support unsigned local builds and signed CI builds from the same config.

CI should use Apple secrets supported by Tauri:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`
- `KEYCHAIN_PASSWORD`

The workflow should import the `.p12` certificate into a temporary keychain before invoking the Tauri build. When the Apple notarization secrets are present, the same build should produce a notarized DMG/app pair. When they are absent, the workflow may still build an unsigned DMG for development validation.

## Release Automation

The repository currently has no release workflow. The first automation slice should add one macOS-only GitHub Actions workflow that:

- runs on `workflow_dispatch`
- runs on version tags such as `v0.1.4`
- builds the frontend and Tauri app on `macos-latest`
- creates `.app` and `.dmg` bundles via the macOS override config
- uploads artifacts to a GitHub release on tag builds
- uploads artifacts as workflow artifacts on manual builds

## Documentation Contract

Repository docs must stop presenting the Darwin tarball as the only release shape.

The docs should distinguish:

- the existing Nix tarball contract used by `install.sh`
- the new DMG release flow intended for signed/notarized direct downloads
- the fact that `homebrew-tap` remains a consumer repository that only needs URL/SHA updates after the new artifact is published

## Scope

Included in this slice:

- macOS Tauri override config for `app,dmg`
- local task automation for DMG builds
- secure GitHub Actions workflow for macOS bundle builds
- release/docs updates describing the new macOS release path

Excluded from this slice:

- immediate migration of `install.sh` away from tarballs
- immediate migration of `homebrew-tap` to a DMG- or app-based cask
- certificate issuance or Apple account setup
- release signing validation on CI without real secrets

## References

See `design-docs/references/README.md` for external references.

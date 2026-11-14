---
name: macos-release-build
description: Use when building, signing, notarizing, validating, or publishing macOS `.app` and `.dmg` release artifacts for this repository. Covers the Tauri macOS release config, local `task bundle-macos-dmg`, Apple signing/notarization inputs, GitHub Actions release workflow, and post-release tap follow-up.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
user-invocable: true
---

# macOS Release Build Skill

This skill covers the repository-specific workflow for producing macOS `.app` and `.dmg` artifacts for `chilla`, validating them locally, and preparing them for Apple signing/notarization and GitHub release publication.

## When to Apply

Apply this skill when:
- building a macOS `.app` or `.dmg`
- validating the local macOS bundle output
- preparing or debugging Apple signing/notarization inputs
- creating or reviewing the macOS GitHub release workflow
- publishing or verifying macOS release artifacts

Do not use this skill for the installer tarball contract or Linux tarball releases. Use `nix-release-build` for those.

## Repository Facts

- `src-tauri/tauri.conf.json` keeps the base bundle flow disabled for the Nix tarball path.
- `src-tauri/tauri.macos.release.conf.json` enables the macOS bundle path with `app,dmg`.
- `Taskfile.yml` exposes `task bundle-macos-dmg`.
- `.github/workflows/release-macos-dmg.yml` is the repository workflow for macOS bundles.
- local macOS bundle outputs land under:

```text
target/release/bundle/macos/chilla.app
target/release/bundle/dmg/chilla_<version>_aarch64.dmg
```

## Local Build Workflow

### 1. Build the macOS bundle

```bash
bun install --frozen-lockfile
task bundle-macos-dmg
```

Equivalent direct command:

```bash
CARGO_TERM_QUIET=true bun run tauri build \
  --config src-tauri/tauri.macos.release.conf.json \
  --bundles app,dmg
```

### 2. Verify the outputs exist

```bash
ls -la target/release/bundle/macos/chilla.app
ls -lh target/release/bundle/dmg/*.dmg
```

### 3. Inspect signing state

```bash
codesign -dv --verbose=4 target/release/bundle/macos/chilla.app
spctl --assess -vv target/release/bundle/macos/chilla.app
```

Interpretation:
- ad-hoc signing is acceptable for local unsigned validation
- Gatekeeper rejection is expected for unsigned bundles
- notarized distribution requires Apple signing inputs and CI or local Apple tooling

## Apple Signing And Notarization Inputs

The workflow is designed to consume these secrets:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`
- `KEYCHAIN_PASSWORD`

Meaning:
- `APPLE_CERTIFICATE` is the base64-encoded Developer ID Application `.p12`
- `APPLE_CERTIFICATE_PASSWORD` unlocks that `.p12`
- `APPLE_SIGNING_IDENTITY` is the codesigning identity name
- `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` support notarization
- `KEYCHAIN_PASSWORD` is used for the temporary CI keychain

If these are absent, the repo can still build unsigned `.app` / `.dmg` artifacts for local validation.

## GitHub Workflow

The canonical workflow lives at:

```text
.github/workflows/release-macos-dmg.yml
```

It should:
- use pinned action SHAs
- build on `macos-latest`
- run on `workflow_dispatch` and version tags
- import the Apple certificate only when secrets are present
- upload release assets on tag builds
- upload workflow artifacts on manual builds

When modifying this workflow, also use the `secure-github-action` skill.

## Release Publication

For a tagged release, verify:

```bash
gh release view v<version> --repo tacogips/chilla --json url,assets
```

Confirm the release contains the macOS `.dmg` and any additional macOS bundle artifacts you intentionally publish.

## Homebrew Tap Follow-Up

The tap repository does not create or sign macOS artifacts. It only consumes them.

After switching the macOS distribution artifact shape, update `tacogips/homebrew-tap` when:
- the artifact URL changes
- the SHA-256 changes
- the cask artifact type/path changes
- the cask should move from the tarball `binary` path to a DMG/app-based install flow

## Validation Notes

- a successful local DMG build does not prove notarization
- Gatekeeper rejection on an unsigned local build is expected
- if users should run the app without quarantine workarounds, the published macOS artifact must be properly signed and notarized

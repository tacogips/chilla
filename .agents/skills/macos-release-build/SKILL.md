---
name: macos-release-build
description: Build, sign, notarize, validate, or publish chilla macOS app and DMG artifacts using mise tasks and local Apple credentials.
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

For installer tarballs use `native-release-build` and `release/README.md`.

## Repository Facts

- `src-tauri/tauri.conf.json` keeps bundling disabled for native binary builds.
- `src-tauri/tauri.macos.release.conf.json` enables the macOS bundle path with `app,dmg`.
- `mise.toml` exposes `mise run bundle-macos-dmg`.
- `.github/workflows/release-macos-dmg.yml` is the repository workflow for macOS bundles.
- local macOS bundle outputs land under:

```text
target/release/bundle/macos/chilla.app
target/release/bundle/dmg/chilla_<version>_aarch64.dmg
```

## Local Build Workflow

### 1. Build the macOS bundle

```bash
mise install
mise run install
mise run bundle-macos-dmg
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

The local signing workflow uses the installed Developer ID keychain identity
and these secret names through `kinko exec`:

- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

Meaning:
- `APPLE_SIGNING_IDENTITY` is the codesigning identity name
- `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` support notarization

Do not add Apple credentials to the validation-only GitHub Actions workflow.
Publication remains the explicitly requested local `mise run release-macos-dmg-local` task.

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
- use mise for the toolchain and native macOS SDKs
- build unsigned validation artifacts only, without Apple credentials
- upload workflow artifacts on tag and manual builds

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

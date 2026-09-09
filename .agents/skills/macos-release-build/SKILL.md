---
name: macos-release-build
description: Build, sign, notarize, validate, and publish chilla macOS releases across GitHub, the Homebrew cask, and Apple App Store Connect using mise tasks and local Apple credentials.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# macOS Release Build Skill

This skill covers the repository-specific workflow for producing macOS release
artifacts, validating them locally, publishing the GitHub/DMG release, and
registering a sandboxed Mac release in Apple Developer and App Store Connect.

## When to Apply

Apply this skill when:
- building a macOS `.app` or `.dmg`
- validating the local macOS bundle output
- preparing or debugging Apple signing/notarization inputs
- creating or reviewing the macOS GitHub release workflow
- publishing or verifying macOS release artifacts
- creating or updating the Apple bundle identifier, provisioning profile, App
  Store Connect app/version record, listing metadata, build, and review submission

For installer tarballs use `native-release-build` and `release/README.md`.

## Repository Facts

- `src-tauri/tauri.conf.json` keeps bundling disabled for native binary builds.
- `src-tauri/tauri.macos.release.conf.json` enables the macOS bundle path with `app,dmg`.
- `mise.toml` exposes `mise run bundle-macos-dmg`.
- `.github/workflows/release-macos-dmg.yml` is the repository workflow for macOS bundles.
- `src-tauri/tauri.appstore.conf.json` and
  `src-tauri/Entitlements.appstore.plist.in` define the isolated Mac App Store
  variant.
- `mise run release-macos-app-store-local -- build|upload` builds, validates,
  signs, and optionally uploads the Mac App Store package.
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

## Apple Release Registration

When the user requests a Mac App Store or Apple release, do not stop after
uploading the package. Complete the Apple Developer and App Store Connect record
through the requested release stage: register identifiers and profiles when
missing, create or update the app/version record, attach the processed build,
complete listing and compliance metadata, add compliant screenshots, validate
the submission, and submit for App Review when submission is in scope.

Read [references/app-store-connect-release.md](references/app-store-connect-release.md)
before performing this mode. It defines the required order, verification, secret
handling, and authorization boundaries.

A request limited to build, signing, notarization, DMG, GitHub, or Homebrew does
not authorize App Store Connect mutations. Conversely, an explicit Apple/App
Store release request authorizes ordinary record creation, metadata entry,
package upload, build attachment, and submission steps needed for that release,
subject to the legal and owner-decision gates in the reference.

## Homebrew Tap Follow-Up

The tap repository does not create or sign macOS artifacts. It only consumes them.

Every public version release that publishes a GitHub macOS artifact must also
publish the matching cask update in `tacogips/homebrew-tap`. The release is not
complete until the cask is updated and verified. For each version:

1. Read and follow the tap repository's `AGENTS.md`, if present.
2. Update `Casks/chilla.rb` to the released version, exact SHA-256 of the
   published DMG, and current artifact URL/type/install flow.
3. Run the tap's cask validation tasks and verify Homebrew can fetch the
   published artifact.
4. Commit and push the tap change when the release request includes publication.
5. Verify the remote cask contains the released version and checksum.

Do not compute the cask checksum from a pre-publication artifact when the
published asset can be downloaded; validate against the asset users will fetch.
An App Store-only operation that does not publish a GitHub macOS artifact does
not require a cask update.

## Validation Notes

- a successful local DMG build does not prove notarization
- Gatekeeper rejection on an unsigned local build is expected
- if users should run the app without quarantine workarounds, the published macOS artifact must be properly signed and notarized
- a successful package upload does not prove that App Store Connect processed,
  attached, validated, or submitted the build; verify each state explicitly

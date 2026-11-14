# macOS DMG Release Design

This document records the original transition from Nix tarballs to notarizable
macOS distribution. As of the mise migration, new tarballs are native builds
(`mise run package-native`), the Homebrew cask uses the signed DMG, and CI uses
mise with native SDKs. Nix references below describe the original design context,
not current build instructions; see [Mise Native Toolchain](architecture.md#mise-native-toolchain)
and `release/README.md` for the current contract.

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

## Mounted Artifact Trust Gate

The local release path must validate the exact application bundle contained in
the final DMG, not only the pre-packaging app directory. Before any GitHub release
asset is uploaded, the release automation must:

- attach the final DMG read-only at an isolated temporary mount point
- locate `chilla.app` inside that mounted image
- verify its Developer ID signature with strict deep validation
- verify that its notarization ticket is stapled
- require Gatekeeper to accept the mounted app as executable
- detach the image on both success and failure

This gate protects the Homebrew cask boundary because the cask installs the app
from that DMG. A successful validation of the build-directory app alone is not
sufficient evidence that the distributed container preserved a launchable bundle.

## Official Homebrew Cask Distribution

The final Homebrew distribution target is the official `Homebrew/homebrew-cask`
repository. Once accepted there, the supported install command becomes:

```bash
brew install --cask chilla
```

This path must not require `brew tap tacogips/tap`. The custom tap remains the
fallback until the official cask is merged and available through Homebrew's API.
Repository installation documentation must not claim the official command works
before that upstream state is verified.

The official cask should consume the stable GitHub release DMG and preserve the
current Apple Silicon constraint until an Intel or universal artifact is published.
Its required release contract is:

- stable versioned GitHub release URL
- immutable SHA-256 for the selected DMG
- `chilla.app` installed through the `app` artifact stanza
- optional CLI symlink from the app bundle through the `binary` stanza
- GitHub latest-release livecheck
- no Gatekeeper workaround or signing caveat

Before submission, the selected release must be verified with `codesign` and
`spctl` as Developer ID signed and notarized. The candidate cask must pass the
official new-cask audit, style, install, and uninstall checks.

Homebrew's notability policy is an external acceptance gate. For a cask submitted
by the owner of its source repository, the audit rejects the submission while all
three metrics remain below 90 forks, 90 watchers, and 225 stars. Reaching any one
of those thresholds satisfies the automated notability condition. An upstream pull
request must not be opened while this mandatory gate fails because Homebrew
documents that such submissions will be rejected. Once eligible, the contribution
should contain one cask and follow the official repository's minimal-diff and
validation requirements.

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

The official Homebrew migration is tracked separately in
`impl-plans/active/official-homebrew-cask.md`.

## Mac App Store Distribution

The Mac App Store is a separate distribution channel from the Developer ID DMG.
It must preserve the v0.2.0 product version while using an independently
increasing `CFBundleVersion`, and it must not replace or weaken the notarized DMG
flow. The first App Store build remains Apple Silicon-only and requires macOS
12.0 or later.

The App Store variant must be built through a dedicated Tauri override so its
App Sandbox entitlements and embedded Mac App Store provisioning profile do not
affect the Developer ID artifact. The committed release inputs must not contain
the Apple team identifier, signing identities, provisioning-profile contents,
private keys, account identifiers, or passwords. A local release script renders
ephemeral entitlements/configuration from injected secrets and deletes those
files after packaging.

The sandbox entitlement set is intentionally narrow:

- App Sandbox enabled
- user-selected files and directories readable and writable
- outbound network connections allowed for GitHub diff retrieval
- application and team identifiers derived from the release environment

Paths supplied by shell arguments do not pass through the macOS Powerbox and
therefore are not a supported App Store access mechanism. The App Store listing
and QA evidence must describe and exercise the in-app file/folder picker flow.
The direct DMG and Homebrew variants continue to support `chilla .`.

The release pipeline follows the evidence discipline used by Konjac while
adapting it to a macOS Tauri application:

1. verify version/build-number consistency and placeholder-free metadata
2. verify Apple Distribution and Mac Installer Distribution identities by
   status only
3. validate the Mac App Store provisioning profile against
   `com.tacogips.chilla` without recording its contents
4. build and sign the sandboxed `.app`, then inspect its entitlements
5. launch and exercise the packaged app in its sandbox
6. create a Mac Installer Distribution-signed `.pkg`
7. validate and upload the package, then record build-processing evidence
8. submit only after the owner has fixed price, availability, release timing,
   review contact information, and any required review notes

App Store Connect record creation and final review submission are external
state changes. The default record identity is product name `chilla`, bundle ID
`com.tacogips.chilla`, primary language English (U.S.), and a stable macOS SKU;
if any value is unavailable or conflicts with an existing record, stop rather
than silently changing product identity. Pricing, countries/regions, release
mode, and review contact details are owner decisions and must never be inferred.

The Mac App Store work is tracked in
`impl-plans/active/macos-app-store-release.md`.

## References

See `design-docs/references/README.md` for external references.

#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/release-macos-dmg-local.sh v<version>

Required local environment variables:
  APPLE_SIGNING_IDENTITY  Developer ID Application identity in the local keychain
  APPLE_ID                Apple ID email for notarization
  APPLE_PASSWORD          Apple app-specific password for notarization
  APPLE_TEAM_ID           Apple Developer Team ID

The Developer ID certificate must already be installed in the local macOS
keychain. This script intentionally does not read APPLE_CERTIFICATE or
APPLE_CERTIFICATE_PASSWORD because certificate material should stay local.
USAGE
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 1
  fi
}

require_env() {
  if [ -z "${!1:-}" ]; then
    echo "error: required environment variable is not set: $1" >&2
    exit 1
  fi
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

release_tag="${1:-}"
if [ -z "$release_tag" ]; then
  usage >&2
  exit 1
fi

case "$release_tag" in
  v*) ;;
  *)
    echo "error: release tag must start with v, for example v0.1.5" >&2
    exit 1
    ;;
esac

if [ "$(uname -s)" != "Darwin" ]; then
  echo "error: macOS release signing must run on Darwin" >&2
  exit 1
fi

require_command bun
require_command codesign
require_command ditto
require_command git
require_command gh
require_command security
require_command shasum
require_command spctl
require_command xcrun

require_env APPLE_SIGNING_IDENTITY
require_env APPLE_ID
require_env APPLE_PASSWORD
require_env APPLE_TEAM_ID

if ! git rev-parse -q --verify "refs/tags/$release_tag" >/dev/null; then
  echo "error: local git tag does not exist: $release_tag" >&2
  exit 1
fi

if ! git ls-remote --exit-code --tags origin "refs/tags/$release_tag" >/dev/null; then
  echo "error: git tag has not been pushed to origin: $release_tag" >&2
  exit 1
fi

security find-identity -v -p codesigning | grep -F -- "$APPLE_SIGNING_IDENTITY" >/dev/null

rm -rf target/release/bundle/macos target/release/bundle/dmg

bun install --frozen-lockfile
bun run build
CARGO_TERM_QUIET=true bun run tauri build \
  --config src-tauri/tauri.macos.release.conf.json \
  --bundles app,dmg

app_path="target/release/bundle/macos/chilla.app"
dmg_path=""
for candidate in target/release/bundle/dmg/*.dmg; do
  if [ -f "$candidate" ]; then
    dmg_path="$candidate"
    break
  fi
done

test -d "$app_path"
test -n "$dmg_path"
test -f "$dmg_path"

codesign --verify --deep --strict --verbose=2 "$app_path"
xcrun stapler validate "$app_path"
xcrun stapler validate "$dmg_path"
spctl --assess --type execute --verbose=4 "$app_path"
spctl --assess --type open --context context:primary-signature --verbose=4 "$dmg_path"

app_zip_path="target/release/bundle/macos/chilla.app.zip"
ditto -c -k --keepParent "$app_path" "$app_zip_path"

release_notes="macOS app and DMG bundles for this release."
if ! gh release view "$release_tag" >/dev/null 2>&1; then
  gh release create "$release_tag" \
    --title "chilla $release_tag" \
    --notes "$release_notes"
fi

gh release upload "$release_tag" "$dmg_path" "$app_zip_path" --clobber

shasum -a 256 "$dmg_path"
shasum -a 256 "$app_zip_path"

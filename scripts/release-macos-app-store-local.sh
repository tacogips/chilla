#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/release-macos-app-store-local.sh build
  scripts/release-macos-app-store-local.sh upload

Required environment variables:
  APPLE_TEAM_ID                 Apple Developer Team ID
  CHILLA_APP_STORE_PROFILE      Mac App Store Connect provisioning profile

Additional variables for upload:
  APPLE_ID                      Apple account email
  APPLE_PASSWORD                Apple app-specific password

The local keychain must contain one Apple Distribution identity and one Mac
Installer Distribution identity. Generated entitlements and copied provisioning
material remain in an isolated temporary directory and are deleted on exit.
USAGE
}

fail() {
  echo "error: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

require_env() {
  [ -n "${!1:-}" ] || fail "required environment variable is not set: $1"
}

single_identity() {
  local pattern="$1"
  local policy="${2:-codesigning}"
  local identities
  local count

  identities="$(security find-identity -v -p "$policy" | awk -F '"' -v pattern="$pattern" '$2 ~ pattern { print $2 }')"
  count="$(printf '%s\n' "$identities" | awk 'NF { count += 1 } END { print count + 0 }')"
  [ "$count" -eq 1 ] || fail "expected exactly one valid $pattern identity; found $count"
  printf '%s' "$identities"
}

plist_value() {
  local key_path="$1"
  local plist_path="$2"
  plutil -extract "$key_path" raw -o - "$plist_path" 2>/dev/null
}

mode="${1:-}"
case "$mode" in
  build | upload) ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac

[ "$(uname -s)" = "Darwin" ] || fail "Mac App Store packaging must run on macOS"

for command_name in awk bun codesign date git jq openssl pkgutil plutil productbuild security sed shasum xcrun; do
  require_command "$command_name"
done

require_env APPLE_TEAM_ID
require_env CHILLA_APP_STORE_PROFILE
if [ "$mode" = upload ]; then
  require_env APPLE_ID
  require_env APPLE_PASSWORD
fi

[[ "$APPLE_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]] || fail "APPLE_TEAM_ID must contain exactly 10 uppercase letters or digits"
[ "$(uname -m)" = arm64 ] || fail "the first Mac App Store release must build on Apple Silicon"

profile_source="$CHILLA_APP_STORE_PROFILE"
[ -f "$profile_source" ] || fail "provisioning profile is not a readable file"

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

bundle_id="$(jq -er '.identifier' src-tauri/tauri.conf.json)"
product_version="$(jq -er '.version' src-tauri/tauri.conf.json)"
package_version="$(jq -er '.version' package.json)"
cargo_version="$(awk -F ' *= *' '/^version *=/ { gsub(/"/, "", $2); print $2; exit }' src-tauri/Cargo.toml)"
[ "$bundle_id" = "com.tacogips.chilla" ] || fail "unexpected bundle identifier"
[ "$product_version" = "$package_version" ] || fail "Tauri and package versions differ"
[ "$product_version" = "$cargo_version" ] || fail "Tauri and Cargo versions differ"

app_identity="$(single_identity '^Apple Distribution:')"
installer_identity="$(single_identity '^(Mac Installer Distribution|3rd Party Mac Developer Installer):' basic)"

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/chilla-app-store.XXXXXX")"
cleanup() {
  case "$work_dir" in
    "${TMPDIR:-/tmp}"/chilla-app-store.*) rm -rf -- "$work_dir" ;;
    *) echo "warning: refused to clean unexpected temporary path" >&2 ;;
  esac
}
trap cleanup EXIT
chmod 700 "$work_dir"

profile_plist="$work_dir/profile.plist"
security cms -D -i "$profile_source" >"$profile_plist"

profile_app_id="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:com.apple.application-identifier' "$profile_plist" 2>/dev/null || /usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$profile_plist" 2>/dev/null)"
[ "$profile_app_id" = "$APPLE_TEAM_ID.$bundle_id" ] || fail "profile application identifier does not match chilla"

profile_platform="$(/usr/libexec/PlistBuddy -c 'Print :Platform:0' "$profile_plist" 2>/dev/null || true)"
[ "$profile_platform" = OSX ] || fail "profile is not a macOS profile"

get_task_allow="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:get-task-allow' "$profile_plist" 2>/dev/null || true)"
[ "$get_task_allow" != "true" ] || fail "development provisioning profiles are not accepted"
provisions_all_devices="$(/usr/libexec/PlistBuddy -c 'Print :ProvisionsAllDevices' "$profile_plist" 2>/dev/null || true)"
[ "$provisions_all_devices" != "true" ] || fail "Developer ID provisioning profiles are not accepted"
if /usr/libexec/PlistBuddy -c 'Print :ProvisionedDevices' "$profile_plist" >/dev/null 2>&1; then
  fail "device-scoped provisioning profiles are not accepted"
fi

expiration_date="$(LC_ALL=C /usr/libexec/PlistBuddy -c 'Print :ExpirationDate' "$profile_plist" 2>/dev/null || true)"
expiration_epoch="$(LC_ALL=C date -j -f '%a %b %d %T %Z %Y' "$expiration_date" '+%s' 2>/dev/null || true)"
[ -n "$expiration_epoch" ] || fail "profile expiration date is invalid"
[ "$expiration_epoch" -gt "$(date '+%s')" ] || fail "provisioning profile has expired"

installed_certificate_der="$work_dir/apple-distribution.cer"
security find-certificate -c "$app_identity" -p | openssl x509 -outform DER >"$installed_certificate_der"
installed_certificate_sha="$(shasum -a 256 "$installed_certificate_der" | awk '{ print $1 }')"
profile_contains_certificate=false
certificate_index=0
while true; do
  profile_certificate_der="$work_dir/profile-certificate-$certificate_index.cer"
  if ! /usr/libexec/PlistBuddy -c "Print :DeveloperCertificates:$certificate_index" "$profile_plist" >"$profile_certificate_der" 2>/dev/null; then
    break
  fi
  profile_certificate_sha="$(openssl x509 -inform DER -in "$profile_certificate_der" -outform DER | shasum -a 256 | awk '{ print $1 }')"
  if [ "$profile_certificate_sha" = "$installed_certificate_sha" ]; then
    profile_contains_certificate=true
  fi
  certificate_index=$((certificate_index + 1))
done
[ "$certificate_index" -gt 0 ] || fail "profile contains no signing certificates"
[ "$profile_contains_certificate" = true ] || fail "profile does not include the selected Apple Distribution certificate"

runtime_entitlements="$work_dir/Entitlements.plist"
sed \
  -e "s/__TEAM_ID__/$APPLE_TEAM_ID/g" \
  -e "s/__BUNDLE_ID__/$bundle_id/g" \
  src-tauri/Entitlements.appstore.plist.in >"$runtime_entitlements"
plutil -lint "$runtime_entitlements" >/dev/null

runtime_profile="$work_dir/chilla.provisionprofile"
cp "$profile_source" "$runtime_profile"
chmod 600 "$runtime_profile"

runtime_config="$work_dir/tauri.appstore.runtime.conf.json"
jq -s \
  --arg entitlements "$runtime_entitlements" \
  --arg profile "$runtime_profile" \
  'reduce .[] as $item ({}; . * $item) * {
    bundle: {
      macOS: {
        entitlements: $entitlements,
        files: {"embedded.provisionprofile": $profile}
      }
    }
  }' \
  src-tauri/tauri.appstore.conf.json >"$runtime_config"

env -u APPLE_ID -u APPLE_PASSWORD -u APPLE_API_KEY -u APPLE_API_ISSUER -u APPLE_API_KEY_PATH bun install --frozen-lockfile
env -u APPLE_ID -u APPLE_PASSWORD -u APPLE_API_KEY -u APPLE_API_ISSUER -u APPLE_API_KEY_PATH bun run build
env -u APPLE_ID -u APPLE_PASSWORD -u APPLE_API_KEY -u APPLE_API_ISSUER -u APPLE_API_KEY_PATH \
  -u CARGO_BUILD_TARGET -u CARGO_TARGET_DIR \
  CARGO_TERM_QUIET=true APPLE_SIGNING_IDENTITY="$app_identity" bun run tauri build \
  --config "$runtime_config" \
  --bundles app

app_path="target/release/bundle/macos/chilla.app"
[ -d "$app_path" ] || fail "Tauri did not produce the macOS app bundle"
[ -f "$app_path/Contents/embedded.provisionprofile" ] || fail "built app does not embed the provisioning profile"

codesign --verify --deep --strict --verbose=2 "$app_path"
codesign -d --extract-certificates="$work_dir/app-signing-certificate" "$app_path" 2>/dev/null
app_certificate_sha="$(shasum -a 256 "$work_dir/app-signing-certificate0" | awk '{ print $1 }')"
[ "$app_certificate_sha" = "$installed_certificate_sha" ] || fail "built app was signed with an unexpected certificate"
effective_entitlements="$work_dir/effective-entitlements.plist"
codesign -d --entitlements :- "$app_path" >"$effective_entitlements" 2>/dev/null
effective_entitlements_json="$work_dir/effective-entitlements.json"
plutil -convert json -o "$effective_entitlements_json" "$effective_entitlements"
[ "$(jq -r '.["com.apple.security.app-sandbox"] // false' "$effective_entitlements_json")" = "true" ] || fail "built app is not sandboxed"
[ "$(jq -r '.["com.apple.security.files.user-selected.read-write"] // false' "$effective_entitlements_json")" = "true" ] || fail "built app lacks user-selected file access"
[ "$(jq -r '.["com.apple.security.network.client"] // false' "$effective_entitlements_json")" = "true" ] || fail "built app lacks outbound network access"
[ "$(jq -er '.["com.apple.application-identifier"]' "$effective_entitlements_json")" = "$APPLE_TEAM_ID.$bundle_id" ] || fail "signed app identifier is inconsistent"

output_dir="${CHILLA_APP_STORE_OUTPUT_DIR:-$repo_root/target/app-store}"
mkdir -p "$output_dir"
pkg_path="$output_dir/chilla-$product_version-macos-aarch64.pkg"
staged_pkg_path="$work_dir/chilla-$product_version-macos-aarch64.pkg"
xcrun productbuild \
  --sign "$installer_identity" \
  --component "$app_path" /Applications \
  "$staged_pkg_path"
pkgutil --check-signature "$staged_pkg_path" | grep -F -- "$installer_identity" >/dev/null
mv -f -- "$staged_pkg_path" "$pkg_path"

echo "Mac App Store package ready: $pkg_path"
shasum -a 256 "$pkg_path"

if [ "$mode" = upload ]; then
  xcrun altool --validate-app \
    --type macos \
    --file "$pkg_path" \
    --username "$APPLE_ID" \
    --password '@env:APPLE_PASSWORD'
  xcrun altool --upload-app \
    --type macos \
    --file "$pkg_path" \
    --username "$APPLE_ID" \
    --password '@env:APPLE_PASSWORD'
  echo "Mac App Store package upload accepted for processing."
fi

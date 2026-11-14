#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
if [[ $# -gt 1 ]]; then
  echo "Usage: mise run package-native -- [output-directory]" >&2
  exit 2
fi
output_dir="${1:-$repo_root/release}"
version="$(bun -e 'console.log(JSON.parse(await Bun.file("package.json").text()).version)')"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]; then
  echo "Invalid package version" >&2
  exit 2
fi
case "$(uname -s)" in
  Darwin) platform=darwin ;;
  Linux) platform=linux ;;
  *) echo "Native tarballs support macOS and Linux only" >&2; exit 2 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch=aarch64 ;;
  x86_64) arch=x86_64 ;;
  *) echo "Unsupported native architecture" >&2; exit 2 ;;
esac
name="chilla-v${version}-${arch}-${platform}"
mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"
archive="$output_dir/$name.tar.gz"
checksum="$output_dir/$name.sha256"
if [[ -e "$archive" || -L "$archive" || -e "$checksum" || -L "$checksum" ]]; then
  echo "Refusing to overwrite existing artifacts: $name" >&2
  exit 1
fi
if [[ -n "${CARGO_BUILD_TARGET:-}" ]]; then
  echo "Native packaging does not accept CARGO_BUILD_TARGET" >&2
  exit 2
fi
mise run build
target_dir="$(CARGO_TERM_QUIET=true cargo metadata --no-deps --format-version 1 |
  bun -e 'console.log((await Bun.stdin.json()).target_directory)')"
binary="$target_dir/release/chilla"
if [[ ! -x "$binary" ]]; then
  echo "Native build did not produce $binary" >&2
  exit 1
fi
description="$(file -b "$binary")"
case "$platform:$arch:$description" in
  darwin:aarch64:*Mach-O*arm64*|darwin:x86_64:*Mach-O*x86_64*|linux:aarch64:*ELF*aarch64*|linux:x86_64:*ELF*x86-64*) ;;
  *) echo "Build output is not a matching native executable: $description" >&2; exit 1 ;;
esac
if [[ "$platform" == darwin ]]; then
  links="$(otool -L "$binary"; otool -l "$binary")"
else
  links="$(ldd "$binary")"
  if [[ "$links" == *"not found"* ]]; then
    echo "Native executable has unresolved shared libraries" >&2
    exit 1
  fi
fi
if [[ "$links" == *"/nix/store/"* ]]; then
  echo "Refusing to package a Nix-linked executable; rebuild outside a Nix shell" >&2
  exit 1
fi
if [[ "$("$binary" --version)" != "$version" ]]; then
  echo "Built binary version does not match package.json" >&2
  exit 1
fi

staging="$(mktemp -d "$output_dir/.chilla-package.XXXXXX")"
cleanup() { rm -rf -- "$staging"; }
trap cleanup EXIT
mkdir -p "$staging/$name/bin"
cp "$binary" "$staging/$name/bin/chilla"
cp LICENSE "$staging/$name/LICENSE"
COPYFILE_DISABLE=1 tar -C "$staging" -czf "$staging/$name.tar.gz" "$name"
if command -v sha256sum >/dev/null 2>&1; then
  digest="$(sha256sum "$staging/$name.tar.gz")"
else
  digest="$(shasum -a 256 "$staging/$name.tar.gz")"
fi
printf '%s  %s.tar.gz\n' "${digest%% *}" "$name" >"$staging/$name.sha256"
# Hard-link publication refuses clobbering, even if another process races us.
ln "$staging/$name.tar.gz" "$archive"
ln "$staging/$name.sha256" "$checksum"
printf 'Created %s\nCreated %s\n' "$archive" "$checksum"

#!/usr/bin/env bash

set -euo pipefail

REPO="${REPO:-tacogips/chilla}"
APP_NAME="${APP_NAME:-chilla}"
INSTALL_ROOT="${INSTALL_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/$APP_NAME}"
RELEASES_DIR="${RELEASES_DIR:-$INSTALL_ROOT/releases}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
LOCAL_RELEASE_DIR="${LOCAL_RELEASE_DIR:-release}"

BLOCK_START="# >>> chilla install >>>"
BLOCK_END="# <<< chilla install <<<"

TMP_DIR="$(mktemp -d)"
COMMAND="install"
VERSION_TAG=""
TARGET=""
PROFILE_FILE=""
PROFILE_ACTION="auto"

Color_Off=''
Red=''
Green=''
Dim=''
Bold_White=''
Bold_Green=''

if [[ -t 1 ]]; then
  Color_Off='\033[0m'
  Red='\033[0;31m'
  Green='\033[0;32m'
  Dim='\033[0;2m'
  Bold_White='\033[1m'
  Bold_Green='\033[1;32m'
fi

cleanup() {
  chmod -R u+w "$TMP_DIR" 2>/dev/null || true
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

error() {
  echo -e "${Red}error${Color_Off}: $*" >&2
  exit 1
}

info() {
  echo -e "${Dim}$*${Color_Off}"
}

info_bold() {
  echo -e "${Bold_White}$*${Color_Off}"
}

success() {
  echo -e "${Green}$*${Color_Off}"
}

tildify() {
  if [[ "$1" == "$HOME" ]]; then
    printf '~\n'
  elif [[ "$1" == "$HOME/"* ]]; then
    printf '~/%s\n' "${1#"$HOME/"}"
  else
    printf '%s\n' "$1"
  fi
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || error "required command not found: $1"
}

sha256_file() {
  local path="$1"

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
    return 0
  fi

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{print $1}'
    return 0
  fi

  return 1
}

normalize_version() {
  if [[ -z "$1" ]]; then
    printf '\n'
  elif [[ "$1" == v* ]]; then
    printf '%s\n' "$1"
  else
    printf 'v%s\n' "$1"
  fi
}

print_help() {
  cat <<EOF
Usage:
  ./install.sh [install] [version] [options]
  ./install.sh uninstall [options]
  ./install.sh --help

Commands:
  install               Install chilla. This is the default command.
  uninstall             Remove the installed chilla files and managed PATH block.

Arguments:
  version               Optional GitHub release tag such as v0.1.1 or 0.1.1.

Options:
  --repo <owner/name>           GitHub repository to download from.
  --target <triple>             Override detected target.
  --install-root <path>         Installation root. Default: $INSTALL_ROOT
  --bin-dir <path>              Directory for the chilla symlink. Default: $BIN_DIR
  --local-release-dir <path>    Local archive directory. Default: $LOCAL_RELEASE_DIR
  --profile-file <path>         Explicit shell profile file to modify.
  --no-modify-path              Do not add or remove a PATH block in shell config.
  --help                        Show this help.

Examples:
  ./install.sh
  ./install.sh v0.1.1
  ./install.sh --target x86_64-linux
  ./install.sh uninstall
  curl -fsSL https://raw.githubusercontent.com/tacogips/chilla/main/install.sh | bash -s -- v0.1.1
EOF
}

detect_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin)
      case "$arch" in
        arm64|aarch64)
          printf 'aarch64-darwin\n'
          ;;
        x86_64)
          if [[ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" == "1" ]]; then
            info "Your shell is running in Rosetta 2. Installing the arm64 build."
            printf 'aarch64-darwin\n'
          else
            printf 'x86_64-darwin\n'
          fi
          ;;
        *)
          error "unsupported Darwin architecture: $arch"
          ;;
      esac
      ;;
    Linux)
      case "$arch" in
        arm64|aarch64)
          printf 'aarch64-linux\n'
          ;;
        x86_64)
          printf 'x86_64-linux\n'
          ;;
        *)
          error "unsupported Linux architecture: $arch"
          ;;
      esac
      ;;
    *)
      error "unsupported operating system: $os"
      ;;
  esac
}

detect_shell_name() {
  basename "${SHELL:-bash}"
}

choose_bash_profile() {
  local candidate
  local candidates=(
    "$HOME/.bash_profile"
    "$HOME/.bashrc"
  )

  if [[ -n "${XDG_CONFIG_HOME:-}" ]]; then
    candidates+=(
      "$XDG_CONFIG_HOME/.bash_profile"
      "$XDG_CONFIG_HOME/.bashrc"
      "$XDG_CONFIG_HOME/bash_profile"
      "$XDG_CONFIG_HOME/bashrc"
    )
  fi

  for candidate in "${candidates[@]}"; do
    if [[ -e "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  printf '%s\n' "$HOME/.bashrc"
}

default_profile_file() {
  local shell_name
  shell_name="$(detect_shell_name)"

  case "$shell_name" in
    fish)
      printf '%s\n' "${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish"
      ;;
    zsh)
      printf '%s\n' "$HOME/.zshrc"
      ;;
    bash)
      choose_bash_profile
      ;;
    *)
      printf '\n'
      ;;
  esac
}

ensure_parent_dir() {
  local target_path="$1"
  mkdir -p "$(dirname "$target_path")"
}

remove_managed_block() {
  local file_path="$1"
  local temp_path

  if [[ ! -f "$file_path" ]]; then
    return 0
  fi

  temp_path="$TMP_DIR/$(basename "$file_path").cleaned"
  awk -v start="$BLOCK_START" -v end="$BLOCK_END" '
    $0 == start { skip = 1; next }
    $0 == end { skip = 0; next }
    !skip { print }
  ' "$file_path" >"$temp_path"
  mv "$temp_path" "$file_path"
}

append_profile_block() {
  local file_path="$1"
  local shell_name="$2"
  local bin_dir_display

  ensure_parent_dir "$file_path"
  touch "$file_path"
  remove_managed_block "$file_path"

  bin_dir_display="$(tildify "$BIN_DIR")"

  {
    printf '\n%s\n' "$BLOCK_START"
    case "$shell_name" in
      fish)
        printf 'set -gx PATH "%s" $PATH\n' "$BIN_DIR"
        ;;
      *)
        printf 'export PATH="%s:$PATH"\n' "$BIN_DIR"
        ;;
    esac
    printf '%s\n' "$BLOCK_END"
  } >>"$file_path"

  info "Added \"$bin_dir_display\" to PATH in \"$(tildify "$file_path")\""
}

path_contains_bin_dir() {
  [[ ":$PATH:" == *":$BIN_DIR:"* ]]
}

configure_shell_profile() {
  local shell_name profile_path

  if [[ "$PROFILE_ACTION" == "never" ]]; then
    return 0
  fi

  if path_contains_bin_dir; then
    info "\"$(tildify "$BIN_DIR")\" is already in PATH. No shell profile update was needed."
    return 0
  fi

  shell_name="$(detect_shell_name)"
  profile_path="${PROFILE_FILE:-$(default_profile_file)}"

  if [[ -z "$profile_path" ]]; then
    info "Could not determine a supported shell profile automatically."
    print_manual_path_instructions
    return 0
  fi

  append_profile_block "$profile_path" "$shell_name"
}

remove_shell_profile_block() {
  local profile_path

  if [[ "$PROFILE_ACTION" == "never" ]]; then
    return 0
  fi

  profile_path="${PROFILE_FILE:-$(default_profile_file)}"
  if [[ -z "$profile_path" ]]; then
    return 0
  fi

  remove_managed_block "$profile_path"
}

print_manual_path_instructions() {
  local shell_name
  shell_name="$(detect_shell_name)"

  info "Manually add \"$(tildify "$BIN_DIR")\" to PATH if needed."
  case "$shell_name" in
    fish)
      info_bold " set -gx PATH \"$BIN_DIR\" \$PATH"
      ;;
    *)
      info_bold " export PATH=\"$BIN_DIR:\$PATH\""
      ;;
  esac
}

find_local_archive() {
  local pattern archive_path

  if [[ ! -d "$LOCAL_RELEASE_DIR" ]]; then
    return 1
  fi

  if [[ -n "$VERSION_TAG" ]]; then
    pattern="${APP_NAME}-${VERSION_TAG}-${TARGET}.tar.gz"
  else
    pattern="${APP_NAME}-v*-${TARGET}.tar.gz"
  fi

  archive_path="$(find "$LOCAL_RELEASE_DIR" -maxdepth 1 -type f -name "$pattern" | sort | tail -n 1)"
  if [[ -z "$archive_path" ]]; then
    return 1
  fi

  printf '%s\n' "$archive_path"
}

find_local_checksum() {
  local archive_path="$1"
  local checksum_path="${archive_path%.tar.gz}.sha256"

  if [[ -f "$checksum_path" ]]; then
    printf '%s\n' "$checksum_path"
    return 0
  fi

  return 1
}

read_release_json() {
  if [[ -n "$VERSION_TAG" ]]; then
    curl -fsSL "https://api.github.com/repos/${REPO}/releases/tags/${VERSION_TAG}"
  else
    curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest"
  fi
}

find_release_asset_url() {
  local suffix="$1"
  local json="$2"

  printf '%s' "$json" |
    grep -o "\"browser_download_url\": *\"[^\"]*${suffix}\"" |
    head -n 1 |
    cut -d '"' -f 4 ||
    true
}

verify_checksum_if_possible() {
  local checksum_file="$1"
  local target_path="$2"
  local expected actual referenced referenced_basename

  expected="$(awk 'NR == 1 { print $1 }' "$checksum_file")"
  referenced="$(awk 'NR == 1 { print $2 }' "$checksum_file")"
  referenced_basename="$(basename "$referenced" 2>/dev/null || true)"

  if [[ -z "$expected" ]]; then
    info "Skipping checksum verification: checksum file is empty."
    return 0
  fi

  if [[ -n "$referenced" && "$referenced_basename" != "$(basename "$target_path")" ]]; then
    info "Skipping checksum verification: checksum references $referenced, not $(basename "$target_path")."
    return 0
  fi

  if ! actual="$(sha256_file "$target_path")"; then
    info "Skipping checksum verification: no sha256 tool is available."
    return 0
  fi

  if [[ "$actual" != "$expected" ]]; then
    error "checksum mismatch for $(basename "$target_path"): expected $expected, got $actual"
  fi

  success "Verified checksum for $(basename "$target_path")."
}

extract_archive_root() {
  local archive_path="$1"
  local extract_dir="$TMP_DIR/extract"
  local root

  mkdir -p "$extract_dir"
  tar -xzf "$archive_path" -C "$extract_dir"

  root="$(find "$extract_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  if [[ -z "$root" ]]; then
    if [[ -x "$extract_dir/bin/$APP_NAME" ]]; then
      printf '%s\n' "$extract_dir"
      return 0
    fi

    error "archive did not contain an installable directory"
  fi

  printf '%s\n' "$root"
}

install_release_tree() {
  local source_dir="$1"
  local release_name="$2"
  local destination_dir="$RELEASES_DIR/$release_name"

  mkdir -p "$INSTALL_ROOT" "$RELEASES_DIR" "$BIN_DIR"
  chmod -R u+w "$destination_dir" 2>/dev/null || true
  rm -rf "$destination_dir"
  cp -R "$source_dir" "$destination_dir"

  ln -sfn "$destination_dir" "$INSTALL_ROOT/current"
  ln -sfn "$destination_dir/bin/$APP_NAME" "$BIN_DIR/$APP_NAME"

  printf '%s\n' "$destination_dir"
}

warn_if_nix_store_missing() {
  if [[ ! -d /nix/store ]]; then
    info "Warning: /nix/store is not present on this machine."
    info "Warning: current chilla release artifacts are produced from Nix and may not run correctly without Nix."
  fi
}

install_command() {
  local archive_path archive_name source_kind checksum_path release_json archive_url checksum_url
  local package_root package_name install_path refresh_command profile_path shell_name

  archive_path=""
  archive_name=""
  source_kind=""
  checksum_path=""

  info_bold "Installing chilla"
  info "Resolved target: $TARGET"

  if archive_path="$(find_local_archive)"; then
    archive_name="$(basename "$archive_path")"
    source_kind="local"
    checksum_path="$(find_local_checksum "$archive_path" || true)"
    info "Using local release archive: $archive_path"
  else
    if [[ -n "$VERSION_TAG" ]]; then
      info "Fetching release metadata for $VERSION_TAG from GitHub..."
    else
      info "Fetching latest release metadata from GitHub..."
    fi

    release_json="$(read_release_json)"
    archive_url="$(find_release_asset_url "${TARGET}\\.tar\\.gz" "$release_json")"
    checksum_url="$(find_release_asset_url "${TARGET}\\.sha256" "$release_json" || true)"

    if [[ -z "$archive_url" ]]; then
      if [[ -n "$VERSION_TAG" ]]; then
        error "could not find a ${TARGET} tarball in release ${VERSION_TAG} for ${REPO}"
      fi
      error "could not find a ${TARGET} tarball in the latest release for ${REPO}"
    fi

    archive_name="$(basename "$archive_url")"
    archive_path="$TMP_DIR/$archive_name"
    source_kind="github"

    info "Downloading $archive_name..."
    curl -fL --progress-bar "$archive_url" -o "$archive_path"

    if [[ -n "$checksum_url" ]]; then
      checksum_path="$TMP_DIR/$(basename "$checksum_url")"
      info "Downloading $(basename "$checksum_url")..."
      curl -fL --progress-bar "$checksum_url" -o "$checksum_path"
    fi
  fi

  if [[ -n "$checksum_path" ]]; then
    verify_checksum_if_possible "$checksum_path" "$archive_path"
  fi

  package_root="$(extract_archive_root "$archive_path")"
  package_name="${archive_name%.tar.gz}"
  install_path="$(install_release_tree "$package_root" "$package_name")"

  configure_shell_profile
  warn_if_nix_store_missing

  success "chilla was installed successfully to ${Bold_Green}$(tildify "$install_path")${Color_Off}"
  info "CLI symlink: $(tildify "$BIN_DIR/$APP_NAME")"

  if command -v "$APP_NAME" >/dev/null 2>&1; then
    printf '\n'
    info "To get started, run:"
    info_bold " $APP_NAME --help"
    return 0
  fi

  shell_name="$(detect_shell_name)"
  profile_path="${PROFILE_FILE:-$(default_profile_file)}"
  refresh_command=""

  case "$shell_name" in
    fish)
      if [[ "$PROFILE_ACTION" != "never" && -n "$profile_path" ]]; then
        refresh_command="source $profile_path"
      fi
      ;;
    bash)
      if [[ "$PROFILE_ACTION" != "never" && -n "$profile_path" ]]; then
        refresh_command="source $profile_path"
      fi
      ;;
    zsh)
      if [[ "$PROFILE_ACTION" != "never" && -n "$profile_path" ]]; then
        refresh_command="exec $SHELL"
      fi
      ;;
  esac

  printf '\n'
  info "To get started, run:"
  if [[ -n "$refresh_command" ]]; then
    info_bold " $refresh_command"
  else
    print_manual_path_instructions
  fi
  info_bold " $APP_NAME --help"
  info "Installed from $source_kind release: $archive_name"
}

uninstall_command() {
  local removed_anything="false"

  info_bold "Uninstalling chilla"

  if [[ -L "$BIN_DIR/$APP_NAME" || -f "$BIN_DIR/$APP_NAME" ]]; then
    chmod u+w "$BIN_DIR/$APP_NAME" 2>/dev/null || true
    rm -f "$BIN_DIR/$APP_NAME"
    removed_anything="true"
    info "Removed $(tildify "$BIN_DIR/$APP_NAME")"
  fi

  if [[ -e "$INSTALL_ROOT/current" || -L "$INSTALL_ROOT/current" ]]; then
    rm -f "$INSTALL_ROOT/current"
    removed_anything="true"
  fi

  if [[ -d "$INSTALL_ROOT" ]]; then
    chmod -R u+w "$INSTALL_ROOT" 2>/dev/null || true
    rm -rf "$INSTALL_ROOT"
    removed_anything="true"
    info "Removed $(tildify "$INSTALL_ROOT")"
  fi

  remove_shell_profile_block

  if [[ "$removed_anything" == "true" ]]; then
    success "chilla was uninstalled successfully."
  else
    info "No installed chilla files were found under $(tildify "$INSTALL_ROOT") or $(tildify "$BIN_DIR")."
  fi
}

parse_args() {
  local positional_version_seen="false"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      install)
        COMMAND="install"
        shift
        ;;
      uninstall)
        COMMAND="uninstall"
        shift
        ;;
      --help|-h)
        COMMAND="help"
        shift
        ;;
      --repo)
        [[ $# -ge 2 ]] || error "--repo requires a value"
        REPO="$2"
        shift 2
        ;;
      --target)
        [[ $# -ge 2 ]] || error "--target requires a value"
        TARGET="$2"
        shift 2
        ;;
      --install-root)
        [[ $# -ge 2 ]] || error "--install-root requires a value"
        INSTALL_ROOT="$2"
        RELEASES_DIR="$INSTALL_ROOT/releases"
        shift 2
        ;;
      --bin-dir)
        [[ $# -ge 2 ]] || error "--bin-dir requires a value"
        BIN_DIR="$2"
        shift 2
        ;;
      --local-release-dir)
        [[ $# -ge 2 ]] || error "--local-release-dir requires a value"
        LOCAL_RELEASE_DIR="$2"
        shift 2
        ;;
      --profile-file)
        [[ $# -ge 2 ]] || error "--profile-file requires a value"
        PROFILE_FILE="$2"
        shift 2
        ;;
      --no-modify-path)
        PROFILE_ACTION="never"
        shift
        ;;
      --version)
        [[ $# -ge 2 ]] || error "--version requires a value"
        VERSION_TAG="$(normalize_version "$2")"
        shift 2
        ;;
      -*)
        error "unknown option: $1"
        ;;
      *)
        if [[ "$COMMAND" == "uninstall" ]]; then
          error "unexpected argument for uninstall: $1"
        fi

        if [[ "$positional_version_seen" == "true" ]]; then
          error "too many positional arguments"
        fi

        VERSION_TAG="$(normalize_version "$1")"
        positional_version_seen="true"
        shift
        ;;
    esac
  done
}

main() {
  parse_args "$@"

  if [[ "$COMMAND" == "help" ]]; then
    print_help
    exit 0
  fi

  need_cmd curl
  need_cmd tar
  need_cmd grep
  need_cmd awk
  need_cmd find
  need_cmd mkdir
  need_cmd ln
  need_cmd cp
  need_cmd rm
  need_cmd uname
  need_cmd basename
  need_cmd touch

  TARGET="${TARGET:-$(detect_target)}"

  case "$COMMAND" in
    install)
      install_command
      ;;
    uninstall)
      uninstall_command
      ;;
    *)
      error "unsupported command: $COMMAND"
      ;;
  esac
}

main "$@"

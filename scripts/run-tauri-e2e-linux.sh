#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Linux Tauri E2E is only supported on Linux."
  exit 1
fi

if ! command -v tauri-driver >/dev/null 2>&1; then
  echo "Missing tauri-driver. Install it with: CARGO_TERM_QUIET=true cargo install tauri-driver --locked"
  exit 1
fi

if ! command -v WebKitWebDriver >/dev/null 2>&1; then
  echo "Missing WebKitWebDriver. Enter the Nix dev shell or install WebKitGTK's WebDriver binary."
  exit 1
fi

export CARGO_TERM_QUIET=true
export WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"
export CHILLA_TAURI_E2E_REPO_ROOT="$repo_root"
export CHILLA_TAURI_E2E_APP="$repo_root/target/debug/chilla"
export CHILLA_TAURI_E2E_WEBKIT_DRIVER="$(command -v WebKitWebDriver)"

echo "Building debug Tauri binary for Linux E2E..."
bun run tauri build --debug --no-bundle

if [[ ! -x "$CHILLA_TAURI_E2E_APP" ]]; then
  echo "Expected built app at $CHILLA_TAURI_E2E_APP"
  exit 1
fi

run_e2e() {
  bun run tests/tauri/tauri-smoke.e2e.ts
}

if [[ -n "${DISPLAY:-}" ]]; then
  run_e2e
  exit 0
fi

if command -v xvfb-run >/dev/null 2>&1; then
  xvfb-run -a -s "-screen 0 1440x900x24" bun run tests/tauri/tauri-smoke.e2e.ts
  exit 0
fi

if ! command -v Xvfb >/dev/null 2>&1; then
  echo "Missing Xvfb. Install xorg-server or provide DISPLAY for Linux Tauri E2E."
  exit 1
fi

XVFB_DISPLAY=":99"
xvfb_log="$(mktemp -t chilla-xvfb.XXXXXX.log)"
Xvfb "$XVFB_DISPLAY" -screen 0 1440x900x24 >"$xvfb_log" 2>&1 &
xvfb_pid=$!
cleanup() {
  kill "$xvfb_pid" >/dev/null 2>&1 || true
  rm -f "$xvfb_log"
}
trap cleanup EXIT
sleep 1

if ! kill -0 "$xvfb_pid" >/dev/null 2>&1; then
  cat "$xvfb_log" >&2
  exit 1
fi

export DISPLAY="$XVFB_DISPLAY"

run_e2e

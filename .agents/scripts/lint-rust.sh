#!/bin/bash

set -euo pipefail

manifest_path="src-tauri/Cargo.toml"

if [ ! -f "${manifest_path}" ]; then
  echo "${manifest_path} not found; skipping Rust lint"
  exit 0
fi

CARGO_TERM_QUIET=true cargo clippy --manifest-path "${manifest_path}" --all-targets -- -D warnings

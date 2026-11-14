#!/bin/bash

set -euo pipefail

if ! command -v bunx >/dev/null 2>&1; then
  exit 0
fi

shopt -s nullglob globstar

frontend_files=(
  src/**/*.ts
  src/**/*.tsx
  src/**/*.js
  src/**/*.jsx
  src/**/*.mjs
  src/**/*.cjs
  src/**/*.svelte
  tests/**/*.ts
  tests/**/*.tsx
  test/**/*.ts
  test/**/*.tsx
  scripts/**/*.ts
  scripts/**/*.tsx
)

if [ ${#frontend_files[@]} -eq 0 ]; then
  exit 0
fi

bunx prettier --write "${frontend_files[@]}"

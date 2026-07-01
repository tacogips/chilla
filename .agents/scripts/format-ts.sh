#!/bin/bash

set -euo pipefail

if ! command -v biome >/dev/null 2>&1; then
  echo "biome not found; install it through the Nix dev shell or bun install"
  exit 1
fi

frontend_files=(
)

for directory in src tests test scripts; do
  if [ ! -d "${directory}" ]; then
    continue
  fi

  while IFS= read -r -d '' file; do
    frontend_files+=("${file}")
  done < <(
    find "${directory}" -type f \
      \( -name '*.ts' \
      -o -name '*.tsx' \
      -o -name '*.js' \
      -o -name '*.jsx' \
      -o -name '*.mjs' \
      -o -name '*.cjs' \
      -o -name '*.css' \
      -o -name '*.svelte' \) \
      -print0
  )
done

if [ ${#frontend_files[@]} -eq 0 ]; then
  exit 0
fi

biome format --write "${frontend_files[@]}"

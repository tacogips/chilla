#!/bin/bash

set -euo pipefail

if [ ! -f package.json ]; then
  echo "package.json not found; skipping TypeScript lint"
  exit 0
fi

bun run lint:ts

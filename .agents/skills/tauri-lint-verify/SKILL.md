---
name: tauri-lint-verify
description: Run mixed Tauri Rust and TypeScript lint, typecheck, formatting, and verification commands. Use when Codex is asked to lint, check, test, verify, or prepare Rust/TypeScript/Tauri changes in this repository, especially after editing src-tauri, src, package.json, Taskfile.yml, flake.nix, or agent lint scripts.
---

# Tauri Lint Verify

## Workflow

Prefer the Taskfile entry points so frontend and backend checks stay consistent:

- Run `task lint-ts` for Biome checks and TypeScript typechecking.
- Run `task lint-rust` for Rust clippy with `CARGO_TERM_QUIET=true`.
- Run `task lint` before handoff when linting was requested.
- Run `task verify` after behavior-changing Rust, TypeScript, or Tauri edits.

Use the underlying scripts only when a task target is unavailable:

```bash
bash .agents/scripts/lint-ts.sh
bash .agents/scripts/lint-rust.sh
```

## Expectations

- Keep Cargo commands quiet with `CARGO_TERM_QUIET=true`.
- Prefer `bun run lint:biome`, `bun run typecheck`, `bun run test`, and `bun run test:dom` over ad-hoc frontend commands.
- Report skipped checks explicitly when local dependencies or platform requirements are unavailable.

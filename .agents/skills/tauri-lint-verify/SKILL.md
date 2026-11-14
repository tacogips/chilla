---
name: tauri-lint-verify
description: Run mixed Tauri Rust and TypeScript lint, typecheck, formatting, and verification through mise tasks and locked Bun tools.
---

# Tauri Lint Verify

## Workflow

Prefer mise entry points so frontend and backend checks stay consistent:

- Run `mise run lint-ts` for locked Biome checks and TypeScript typechecking.
- Run `mise run lint-rust` for Rust clippy with `CARGO_TERM_QUIET=true`.
- Run `mise run lint` before handoff when linting was requested.
- Run `mise run verify` for typecheck, lint, Bun/DOM and Rust tests.

Use the underlying scripts only when a task target is unavailable:

```bash
bash .agents/scripts/lint-ts.sh
bash .agents/scripts/lint-rust.sh
```

## Expectations

- Keep Cargo commands quiet with `CARGO_TERM_QUIET=true`.
- Prefer `bun run lint:biome`, `bun run typecheck`, `bun run test`, and `bun run test:dom` over ad-hoc frontend commands.
- Report skipped checks explicitly when local dependencies or platform requirements are unavailable.

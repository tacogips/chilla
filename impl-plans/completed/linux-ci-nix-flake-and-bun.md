# Linux CI (Nix Flake Check And Bun) Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/notes.md#linux-tauri-webdriver-e2e-notes` (CI follow-up); `design-docs/specs/design-markdown-workbench.md` (tooling expectations)
**Created**: 2026-05-01
**Last Updated**: 2026-05-01
**Completed**: 2026-05-01

---

## Design Document Reference

### Summary

Add continuous integration on Linux that exercises the same Nix-defined checks as local development (`nix flake check`) plus Bun typecheck and unit tests inside `nix develop`, so mixed-stack regressions are caught before merge. Linux Tauri WebDriver E2E remains a local/manual path until a follow-up plan adds runner kits for `tauri-driver` and `WebKitWebDriver` in CI.

### Scope

**Included**:

- GitHub Actions workflow triggered on `push` / `pull_request` to `main`
- `nix flake check` job (frontend derivation, release `chilla` build, `clippy`, `fmt`)
- `nix develop` job running `bun install --frozen-lockfile`, `bun run typecheck`, `bun run test:dom`, `bun run test`
- Supply-chain hardening for the workflow (pinned actions, minimal permissions, timeouts, concurrency)
- Fix for duplicate `--manifest-path` in `flake.nix` `cargoClippy` check so `nix flake check` succeeds

**Excluded**:

- Linux desktop Tauri E2E in CI (depends on `WebKitWebDriver`, `tauri-driver`, and display or Xvfb on the runner)
- macOS / Windows CI matrix jobs
- Cachix or extra Nix binary caches (optional future optimization)

---

## Modules

### 1. Flake Clippy Check Configuration

#### `flake.nix`

**Status**: COMPLETED

**Deliverables**:

- `checks.*.clippy` must invoke `cargo clippy` with a single `--manifest-path src-tauri/Cargo.toml` (via `cargoExtraArgs` only); `cargoClippyExtraArgs` carries only `--all-targets` and lint flags.

**Checklist**:

- [x] Remove duplicate `--manifest-path` from `cargoClippyExtraArgs`
- [x] `nix flake check -L` passes on `x86_64-linux`

---

### 2. GitHub Actions CI Workflow

#### `.github/workflows/ci.yml`

**Status**: COMPLETED

**Deliverables**:

- Workflow name `CI`
- Triggers: `push` and `pull_request` to `main`
- `permissions: contents: read`
- `concurrency` with `cancel-in-progress: true` for PR stacks
- Job `nix-flake-check`: Ubuntu, Nix installer action pinned by SHA, `nix flake check -L`, `timeout-minutes: 60`
- Job `bun-verify`: Ubuntu, same Nix install, `nix develop -c` running Bun install, typecheck, Vitest, `bun test`, `timeout-minutes: 30`
- `actions/checkout` pinned by SHA with `persist-credentials: false`
- `DeterminateSystems/nix-installer-action` pinned by SHA

**Checklist**:

- [x] Workflow file added and hardened
- [x] No unsafe `github.event` interpolation in `run:` scripts

---

### 3. Index And Follow-Up

#### `impl-plans/README.md`

**Status**: COMPLETED

**Checklist**:

- [x] Active plan registered in **Active Plans** table (while plan was active)
- [x] Moved to `impl-plans/completed/` and **Completed Plans** updated

---

## Module Status

| Module            | File Path                    | Status      | Tests / Verification        |
| ----------------- | ---------------------------- | ----------- | --------------------------- |
| Flake clippy args | `flake.nix`                  | COMPLETED   | `nix flake check -L`        |
| CI workflow       | `.github/workflows/ci.yml`   | COMPLETED   | GHA run on `main` / PRs     |
| Plan index        | `impl-plans/README.md`       | COMPLETED   | Review                      |

## Dependencies

| Feature        | Depends On                         | Status   |
| -------------- | ---------------------------------- | -------- |
| CI flake check | Working `checks.x86_64-linux.*`    | COMPLETED |
| Bun job        | `devShells.default` with `bun`     | AVAILABLE |

## Completion Criteria

**Implementation (repository)**:

- [x] `nix flake check -L` passes locally on Linux x86_64 after flake fix
- [x] CI workflow added with pinned actions and minimal permissions
- [x] `bun run typecheck`, `bun run test:dom`, `bun run test` pass in dev shell
- [x] Local re-verification on 2026-05-01 with full v0.1.4 dirty worktree (CSV viewer, workbench, smoke E2E updates): `nix flake check -L` and CI `bun-verify` command both pass

**Post-merge (operational)**:

- [ ] Confirm at least one green GitHub Actions `CI` workflow run on `main` after this workflow lands (check Actions tab)

## Unresolved TODOs

- [ ] Post-merge: verify first successful `CI` workflow on `main` in GitHub Actions UI

## Progress Log

### Session: 2026-05-01

**Tasks Completed**: Diagnosed failing `checks.*.clippy` (duplicate `--manifest-path`); fixed `flake.nix`; verified `nix flake check`; added `.github/workflows/ci.yml`; registered this plan.

**Tasks In Progress**: Awaiting upstream CI run post-merge for final completion criterion.

**Blockers**: None.

**Notes**: Tauri smoke E2E (`tests/tauri/tauri-smoke.e2e.ts`) was updated separately to use `.markdown-source-editor` and `value` for raw Markdown assertion, matching the workbench editor DOM.

### Session: 2026-05-01 (follow-up)

**Tasks Completed**: Re-ran `nix flake check -L` and the `bun-verify` command line from CI on Linux with the dirty worktree containing CSV viewer + workbench changes; both passed. Confirmed `.github/workflows/ci.yml` follows pinned-SHA checkout and `permissions: contents: read`.

**Tasks In Progress**: Same as prior session: first green GitHub Actions run after merge for the final completion checkbox.

**Blockers**: None.

**Notes**: `flake.nix` clippy fix (single `--manifest-path` via `cargoExtraArgs` only) was present in the working tree but unstaged relative to index; staging it together with `ci.yml` keeps `nix flake check` green on CI.

### Session: 2026-05-01 (archive)

**Tasks Completed**: Re-ran `nix flake check -L` (full checks including frontend, clippy, fmt, release build) and the exact `bun-verify` `nix develop -c ...` line from `.github/workflows/ci.yml` on the current branch; both succeeded. Plan archived under `impl-plans/completed/`; `impl-plans/README.md` Phase 4 set to completed.

**Tasks In Progress**: None (implementation). Post-merge GHA confirmation remains a manual checkbox above.

**Blockers**: None.

**Notes**: Git diff review: branch adds `.github/workflows/ci.yml`, `flake.nix` clippy args fix, CSV viewer stack, markdown workbench/document refresh work, and `tests/tauri/tauri-smoke.e2e.ts` updates; all are compatible with the two CI jobs as exercised locally.

## Related Plans

- **Previous**: `impl-plans/completed/linux-tauri-e2e-webdriver.md` (local E2E; excluded CI)
- **Next** (optional): `impl-plans/active/linux-tauri-e2e-github-actions.md` (Linux Tauri E2E on GHA with WebKitWebDriver + Xvfb)

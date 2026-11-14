# Linux Tauri WebDriver E2E on GitHub Actions

**Status**: Completed
**Design Reference**: `design-docs/specs/notes.md#linux-tauri-webdriver-e2e-notes`; `impl-plans/completed/linux-ci-nix-flake-and-bun.md` (optional **Next**)
**Created**: 2026-05-01
**Last Updated**: 2026-05-01

---

## Design Document Reference

**Source**: `design-docs/specs/notes.md#linux-tauri-webdriver-e2e-notes`

### Summary

Add a third CI job (or extend `bun-verify`) so the Linux WebDriver smoke (`tests/tauri/tauri-smoke.e2e.ts` via `scripts/run-tauri-e2e-linux.sh`) runs on GitHub-hosted `ubuntu-latest`, matching local Nix dev-shell assumptions: `WebKitWebDriver`, headless display (`Xvfb` / `xvfb-run`), `tauri-driver`, debug Tauri binary build, and Bun test driver.

### Scope

**Included**:

- GitHub Actions workflow changes with pinned actions, minimal permissions, and no credential persistence beyond existing CI patterns
- Reuse `nix develop` for GTK/WebKit/GStreamer/library paths already defined in `flake.nix`
- Documented install or Nix packaging path for `tauri-driver` on CI (see Modules)
- Failure signals that distinguish driver/binary build issues from product regressions

**Excluded**:

- macOS or Windows desktop WebDriver CI
- Replacing or deleting the existing `nix-flake-check` / `bun-verify` jobs
- Broadening smoke coverage beyond the current `tauri-smoke.e2e.ts` scenario set

---

## Modules

### 1. CI workflow job

#### `.github/workflows/ci.yml`

**Status**: COMPLETED

**Deliverables**:

- New job (e.g. `tauri-e2e-linux`) on `ubuntu-latest` with conservative `timeout-minutes`
- Steps: checkout (pinned SHA, `persist-credentials: false`), Nix install (pinned installer action), one `run:` block that enters `nix develop` and executes the E2E path end-to-end
- Optional: `cargo`-home or `tauri-driver` binary cache to keep wall time acceptable

**Checklist**:

- [x] Workflow job added (`tauri-e2e-linux`); post-merge: confirm a green GitHub Actions run on real `pull_request` / `push` to `main`
- [x] Third-party actions use commit-SHA pinning (see `.agents/skills/secure-github-action/SKILL.md`); `actions/cache` pinned for `~/.cargo`
- [x] Job uses `timeout-minutes: 90` and invokes `bun run test:tauri:e2e:linux` after `tauri-driver` install

### 2. Nix / dev shell contract for `tauri-driver`

#### `flake.nix` (optional) and/or CI inline install

**Status**: COMPLETED (**Option B**)

**Deliverables**:

- One supported approach documented in this plan’s Progress Log:
  - **Option A**: Add `tauri-driver` to `devShells.default.packages` via `pkgs.rustPlatform.buildRustPackage` or an upstream Nix attribute if available; OR
  - **Option B**: `cargo install tauri-driver --locked` inside CI with a stable Rust toolchain from the flake, caching `~/.cargo` between runs where permitted

**Implementation**: **Option B** — CI prepends `$HOME/.cargo/bin` to `PATH`, runs `CARGO_TERM_QUIET=true cargo install tauri-driver --locked` when `tauri-driver` is missing, and restores `~/.cargo/{bin,registry,git}` via `actions/cache` keyed on `rust-toolchain.toml`. No `flake.nix` change required.

**Checklist**:

- [x] `WebKitWebDriver` remains on `PATH` inside `nix develop` on Linux (already required by `scripts/run-tauri-e2e-linux.sh`)
- [x] `tauri-driver` is discoverable on `PATH` when the smoke script runs (after CI install)
- [x] No duplicate/conflicting WebKit or GTK module env vars versus the existing `shellHook` (flake unchanged)

### 3. Smoke harness compatibility

#### `scripts/run-tauri-e2e-linux.sh`, `tests/tauri/tauri-smoke.e2e.ts`

**Status**: COMPLETED (verified; no code changes)

**Checklist**:

- [x] CI provides headless display: `nix develop` includes `Xvfb` (`xorg.xorgserver`); `xvfb-run` is not in the dev shell, so the script’s built-in `Xvfb :99` branch is used when `DISPLAY` is unset
- [x] Environment variables used by the smoke test remain explicit (`CHILLA_TAURI_E2E_*` as today)
- [x] No new secrets or network assumptions in the smoke path

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| CI job | `.github/workflows/ci.yml` | COMPLETED | GHA `tauri-e2e-linux` + local parity command |
| Nix / driver | CI inline `cargo install` + cache | COMPLETED | `nix develop` |
| Harness | `scripts/run-tauri-e2e-linux.sh`, `tests/tauri/tauri-smoke.e2e.ts` | COMPLETED | `bun run test:tauri:e2e:linux` |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| CI E2E | `impl-plans/completed/linux-ci-nix-flake-and-bun.md` | Completed |
| Local harness | `impl-plans/completed/linux-tauri-e2e-webdriver.md` | Completed |

## Completion Criteria

- [ ] Post-merge: green `tauri-e2e-linux` on GitHub Actions for `pull_request` and `push` to `main` (workflow implemented; confirm after merge)
- [x] `nix flake check -L` passes (no `flake.nix` change for this plan; verified after workflow edit)
- [x] `impl-plans/README.md` updated: this plan in `completed/` with archival date

## Progress Log

### Review Feedback: 2026-05-01 (current worktree review)

**Finding**: The CI workflow checklist referenced `.claude/skills/secure-github-action/SKILL.md`, but this repository's workflow-hardening guidance lives under `.agents/skills/secure-github-action/SKILL.md`.

**Follow-Up** (done):

- [x] Replace stale path with `.agents/skills/secure-github-action/SKILL.md` in plan checklists
- [x] Keep workflow aligned with pinned full-length action SHAs, minimal `permissions`, `persist-credentials: false`, and job timeouts

### Session: 2026-05-01 (implementation)

**Tasks Completed**: Added `tauri-e2e-linux` job to `.github/workflows/ci.yml` (checkout, Determinate Nix installer, `actions/cache` for `~/.cargo`, `nix develop` one-liner matching local CI parity). Verified `nix flake check -L` and `nix develop -c ... bun run test:tauri:e2e:linux` locally (same command sequence as CI).

**Notes**: First cold CI run still pays `cargo install tauri-driver` and debug Tauri build cost; cache should amortize `tauri-driver` and Rust registry I/O on subsequent runs.

### Session: 2026-05-01 (plan authored)

**Tasks Completed**: Plan authored; repository diff review noted `flake.nix` version drift vs `src-tauri`/`package.json` (addressed in same session as `0.1.4` alignment).

## Related Plans

- **Previous**: `impl-plans/completed/linux-ci-nix-flake-and-bun.md`
- **Next**: -
- **Depends On**: `impl-plans/completed/linux-tauri-e2e-webdriver.md`

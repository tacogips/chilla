# Chilla Product Website — Foundation And Coordination Implementation Plan

**Status**: Ready (authored; Step 5 independent review pending; implementation not started)
**Design Reference**: [Accepted product website design](../../design-docs/specs/design-product-website.md#build-and-hosting-boundary)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09
**Issue Reference**: `tacogips/chilla`, “Create and deploy the Chilla product page”; issueNumber=null; issueUrl=null; intake `comm-000002`.
**Design Review**: Step 3 `comm-000004`, accepted, findings=[]; no Step 5 feedback supplied.

## Execution Metadata

```json
{
  "planId": "CPW-FOUNDATION",
  "planPath": "impl-plans/active/chilla-product-website.md",
  "dependsOn": [],
  "writePaths": [
    "pubpage/package.json",
    "pubpage/bun.lock",
    "pubpage/.gitignore",
    "pubpage/tsconfig.json",
    "pubpage/vite.config.ts",
    "pubpage/README.md",
    "impl-plans/active/chilla-product-website.md"
  ],
  "sharedPaths": [
    "impl-plans/README.md",
    "pubpage/package.json",
    "pubpage/bun.lock",
    "pubpage/README.md",
    "pubpage/public/_headers",
    "design-docs/user-qa/qa-product-website.md",
    "design-docs/user-qa/README.md"
  ],
  "workflowMode": "design-plan-only"
}
```

`writePaths` are ownership bounds, not permission to overwrite existing work. Shared paths require the serial ownership rules in [the main plan](chilla-product-website.md#shared-workspace-protocol). Every worker updates only its own plan progress log; the finalizer alone reconciles shared indexes and archives plans.

## Agent And Reference Trace

- `.agents/agents/ts-coding.md`: use the Codex TypeScript coding role for any TypeScript edits, with purpose, design reference, implementation target and completion criteria in its task input.
- `.agents/agents/check-and-test-after-modify.md`: invoke the separate Codex verification role after TypeScript changes, supplying changed files, affected layers and the scoped commands below. Do not invoke unavailable Claude model names from legacy role metadata.
- `.agents/skills/design-doc/SKILL.md` and `.agents/skills/impl-plan/SKILL.md`: preserve accepted design scope and documentation/progress conventions. This website plan needs no Rust interfaces or implementation bodies.
- [Reference mapping](../../design-docs/specs/design-product-website.md#reference-and-agent-mapping) and [reference index](../../design-docs/references/README.md#chilla-product-website) govern the local Konjac reference. Adopt static localized entrypoints, Worker-first assets, canonical redirects and deterministic validation. Accepted divergences: Bun/TypeScript, Chilla assets/macOS distribution, strict shared headers, no analytics/QR/App Store/terms, and no copied Konjac identifiers or legal claims. Codex/Cursor runtime adapters are not applicable.

## Related Plans And Dependencies

| Plan | Path | Relationship |
|------|------|--------------|
| `CPW-CONTENT` | [chilla-product-website-content.md](chilla-product-website-content.md) | Related; see DAG in main plan |
| `CPW-EDGE` | [chilla-product-website-edge.md](chilla-product-website-edge.md) | Related; see DAG in main plan |
| `CPW-VALIDATION` | [chilla-product-website-validation.md](chilla-product-website-validation.md) | Related; see DAG in main plan |
| `CPW-ROLLOUT` | [chilla-product-website-rollout.md](chilla-product-website-rollout.md) | Related; see DAG in main plan |

## Scope And Intended Changes

Create the isolated private Bun/Vite package and freeze contracts for four static HTML entrypoints. This is the required primary handoff path from the accepted design. The four companion plans decompose independently owned work; this file coordinates their DAG. No root package/lockfile, desktop source, Tauri configuration, release workflow, or existing capture is changed.

## Shared Workspace Protocol

1. Current Step 4 authors all plans and updates only the plan index. Step 5 reviews all plans. Step 9/final git nodes perform adversarial review and commit only the accepted design and these plans/index before native Riela implementation/review fanout. Record that commit ID; do not stage `.riela/`, `riela-lock.json`, or unrelated files. This node does not commit or start fanout.
2. The future coordinator snapshots initial dirty/untracked paths and SHA-256 hashes. Before each edit, the worker freshly reads the target, relevant imports/contracts and current diff, and stores an immutable intent snapshot in the Riela execution artifact directory: task/plan ID, base commit, target path, pre-hash (or ABSENT), intended change/acceptance, read-dependency hashes and evidence location. Do not place snapshots in product assets.
3. Immediately before writing compare the live hash with the pre-hash; unexpected drift pauses that edit. Re-read and reconcile intent before writing; never restore an entire file from a stale copy. Immediately after writing save post-hash and exact diff to a new immutable artifact. Compare post-hashes and read contracts at task completion and at every join. Hashes detect overwritten edits but do not prove semantic intent survived; review both.
4. Workers edit only their listed paths and own progress log. New path discovery requires coordinator reassignment before editing. All workers share the existing branch/directory. No worktrees, private branches, parallel git operations or blanket checkout/reset/staging. Commands may read shared files concurrently; mutations with shared generated output remain serial.
5. Shared ownership schedule: F02 alone creates package/scripts and initial `pubpage/bun.lock` in a serial bootstrap reconciliation. Content/edge workers submit dependency/runbook/QA updates as immutable evidence, not edits to shared files. V01 alone integrates dependency requests, regenerates the lockfile, assembles `pubpage/README.md`, and performs scoped broad formatting after both workers join. V02/V03 alone generate `_headers` and `dist` during integrated checks. Edge development may write `_headers` only while no build is active. R01 alone applies owner-confirmed QA/runbook updates; R04 alone updates indexes and globally archives plans.
6. After joining, the coordinator compares all declared post-hashes with current files, detects unexpected new paths/deletions and reconciles content against every intent snapshot. Queue any repair serially with a fresh pre/post snapshot. Repair impacted contracts first, rerun affected checks, then the complete website check before review acceptance. No worker overwrites another worker's log.
7. Save complete stdout/stderr, exact commands, cwd, final exit status and log paths for verification. Run foreground processes to terminal exit; retain/poll yielded handles. Long-lived Wrangler/browser services use an explicitly owned Riela service lifecycle with URL, handle, readiness evidence and shutdown/exit evidence, never shell backgrounding. No live browser/deployment in this design-plan-only run.

## Plan DAG And Successive Waves

| Wave | Plan IDs | Depends On | Concurrency |
|------|----------|------------|-------------|
| 0 | `CPW-FOUNDATION` | Accepted design/plans committed by workflow gate | Serial bootstrap |
| 1 | `CPW-CONTENT`, `CPW-EDGE` | `CPW-FOUNDATION` | Parallel with disjoint owned paths; no shared build/install |
| 2 | `CPW-VALIDATION` | `CPW-CONTENT`, `CPW-EDGE` | Serial reconciliation, then integrated checks |
| 3 | `CPW-ROLLOUT` | `CPW-VALIDATION` | Serial prerequisites, deployment, browser verification, finalization |

Only wave 1 is native implementation fanout. Review roles may inspect immutable artifacts independently; acceptance still requires joined shared-directory validation. QA-01 is a content completion gate, QA-02 a rollout gate; neither is a circular plan dependency.

## Modules And Task Status

| Task | Module / Deliverables | dependsOn | Status | Verification |
|------|-----------------------|-----------|--------|--------------|
| F01 | Contract manifest in this plan and `pubpage/README.md` | [] | NOT_STARTED | Fresh design/README/reference comparison |
| F02 | Package, local lockfile, ignore rules, strict TS config, Vite config | F01 | NOT_STARTED | Frozen install; foundation typecheck |
| F03 | Foundation handoff and own progress log | F02 | NOT_STARTED | Ownership/hash audit; agent verification |

### F01 — Freeze Shared Contracts

**Parallelizable**: No. Confirm exact entrypoints: `/` -> `index.html`, `/ja/` -> `ja/index.html`, `/privacy/` -> `privacy/index.html`, `/ja/privacy/` -> `ja/privacy/index.html`. Freeze canonical origin `https://chilla-viewer.com`, Worker name `chilla-product`, `ASSETS` binding, and policy generator output `public/_headers`.

Public function specifications (signatures only, no bodies): Worker default export `fetch(request: Request, env: Env): Promise<Response>`; Env has read-only ASSETS exposing `fetch(request: Request): Promise<Response>`. Header module exports `securityHeaders(isHttps: boolean): Readonly<Record<string, string>>`; generator consumes that policy. Validator exports `validateBuild(distPath: string): Promise<readonly ValidationFinding[]>`; findings carry file/route, assertion identifier and message. Tests use independent expectations. No runtime data API or frontend framework is introduced. QA-05 keeps the issue number/URL null unless a real reference is later supplied.

**Acceptance**: [ ] Routes/exports, ownership and output names documented before fanout; [ ] accepted design matched without new architecture.

### F02 — Isolated Build Setup

**Parallelizable**: No. Use a private `pubpage/package.json`; choose and pin reviewed compatible Bun tooling, Vite, TypeScript, Bun/Worker types, Wrangler and validator parsing/format tooling based on current primary documentation when implemented. Record versions/rationale. No reference-version copying or root dependency changes. `pubpage/tsconfig.json` checks config, Worker, scripts and tests with strict options including unchecked-index/unknown-catch/exact-optional checks; no Rust files.

Vite outputs exactly the four HTML entrypoints under `dist`. Add package-local ignores for node_modules, dist, .wrangler, dry-run output and local verification artifacts. Build is deterministic after install and network-independent; no timestamps, release API requests or credentials. Expose command contracts below even though dependent source files arrive in later waves; do not claim build/check passed at foundation completion.

**Acceptance**: [ ] Package-isolated scripts/config and committed local lockfile prepared; [ ] frozen install and foundation typecheck succeed; [ ] root files unchanged; [ ] dependent command readiness explicitly deferred.

### F03 — Review And Handoff

**Parallelizable**: No. Run the separate check-and-test role on foundation TS/config only, record installed tool versions, exact hashes and exported contracts. Explain to wave 1 workers which build/test scripts are waiting for their deliverables. Worker unit tests may run without starting an asset build. Record foundation review decision and progress, keeping overall product completion pending.

**Acceptance**: [ ] Foundation checks/review recorded; [ ] content/edge workers receive stable contract and immutable baseline; [ ] no shared-path writes remain active at fanout.

## Verification Commands And Script Contracts

Run from repository root unless specified; every command records a complete log and terminal exit status.

| Command | Intended contract / stage |
|---------|---------------------------|
| `bun install --cwd pubpage` | Serial F02 initial lockfile generation, repeated only by V01 for approved dependency reconciliation |
| `bun install --cwd pubpage --frozen-lockfile` | F02/V01 reproducibility; network allowed for installation, never build/check |
| `bun run --cwd pubpage typecheck` | Local `tsc --noEmit`; no deployment |
| `bun run --cwd pubpage build` | Generate shared `_headers`, then four-entry Vite build; runnable after wave 1 |
| `bun run --cwd pubpage validate` | Parse built output using `scripts/validate-build.ts`, aggregate failures and exit nonzero |
| `bun run --cwd pubpage test` | Bun Worker/validator tests and negative fixtures |
| `bun run --cwd pubpage format:check` | Package-local formatting check; no writes |
| `bun run --cwd pubpage check` | Sequential typecheck, format check, build, validate, tests; stop nonzero; no network/credentials |
| `bun run --cwd pubpage verify:determinism` | V02 bounded network-isolated rebuild verifier, complete file-set/SHA-256 comparison |
| `bun run --cwd pubpage test:integration` | Bounded real-ASSETS probes against already ready Riela-owned local Wrangler service; V03 |
| `bun run --cwd pubpage deploy:dry-run` | Local pinned Wrangler dry run, explicit production config and ignored output; no production mutation |
| `bun run --cwd pubpage deploy` | Sequential full check then local pinned Wrangler deploy; R02 only, secret invocation resolved in R01 |
| `git diff --check` | Whitespace and conflict hygiene at every join |

`pubpage/README.md` documents local dev/preview commands and the lifecycle restriction. Root Cargo/Bun application tests and app launch are not required for isolated website changes; unexpected cross-boundary scope pauses work for design/plan amendment. Any Cargo invocation uses `CARGO_TERM_QUIET=true`.

## Completion Criteria

- [ ] F01–F03 reviewed with explicit command exit statuses and complete logs.
- [ ] Initial package setup is reproducible and website source stays in `pubpage/`.
- [ ] Committed accepted design/plan gate and per-edit protocol are recorded before fanout.
- [ ] Own progress log updated; no deployment or whole-project completion inferred from foundation completion.

## Progress Log Expectations

At every session end, the owning worker records task IDs completed/in progress, changed paths, immutable intent/hash evidence, command plus final exit status and complete log path, review decisions and blockers. Update acceptance checkboxes only when supported by evidence. Record explicit NOT_RUN/BLOCKED for missing prerequisites; do not call partial logs passing. The finalizer updates shared documentation and moves all completed plans only after the full join/review/verification gate.

## Progress Log

### Session: 2026-09-09 — Step 4 plan authoring
**Tasks Completed**: Plan specification only; no implementation task completed.
**Tasks In Progress**: None.
**Blockers**: Current workflow is design-plan-only; Step 5 plan review and subsequent authorized implementation are pending. Production facts remain gated by QA-01/QA-02 as assigned below.
**Notes**: Source design accepted by Step 3 `comm-000004`; no revision feedback supplied. Author self-check evidence: `/tmp/chilla-step4-plan/author-self-check.log`. Future task verification is prescribed, not executed by this node.

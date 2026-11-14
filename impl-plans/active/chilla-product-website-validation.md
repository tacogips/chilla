# Chilla Product Website — Reconciliation And Validation Implementation Plan

**Status**: Ready (authored; Step 5 independent review pending; implementation not started)
**Design Reference**: [Accepted product website design](../../design-docs/specs/design-product-website.md#deterministic-validation-and-acceptance-matrix)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09
**Issue Reference**: `tacogips/chilla`, “Create and deploy the Chilla product page”; issueNumber=null; issueUrl=null; intake `comm-000002`.
**Design Review**: Step 3 `comm-000004`, accepted, findings=[]; no Step 5 feedback supplied.

## Execution Metadata

```json
{
  "planId": "CPW-VALIDATION",
  "planPath": "impl-plans/active/chilla-product-website-validation.md",
  "dependsOn": [
    "CPW-CONTENT",
    "CPW-EDGE"
  ],
  "writePaths": [
    "pubpage/scripts/validate-build.ts",
    "pubpage/scripts/verify-local.ts",
    "pubpage/wrangler.local.jsonc",
    "pubpage/scripts/verify-determinism.ts",
    "pubpage/tests/validate-build.test.ts",
    "pubpage/tests/fixtures/**",
    "pubpage/evidence/validation.md",
    "impl-plans/active/chilla-product-website-validation.md"
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
| `CPW-FOUNDATION` | [chilla-product-website.md](chilla-product-website.md) | Related; see DAG in main plan |
| `CPW-CONTENT` | [chilla-product-website-content.md](chilla-product-website-content.md) | Prerequisite |
| `CPW-EDGE` | [chilla-product-website-edge.md](chilla-product-website-edge.md) | Prerequisite |
| `CPW-ROLLOUT` | [chilla-product-website-rollout.md](chilla-product-website-rollout.md) | Related; see DAG in main plan |

## Scope And Intended Changes

Join content and edge output serially, validate the built site structurally, prove validator failures and exercise actual local Wrangler ASSETS behavior. Shared dependency/lockfile/README integration belongs to V01 under the main plan protocol. `validateBuild(distPath)` returns aggregated file/route/assertion/message findings, and its CLI exits nonzero for any findings. Do not hide unresolved content/QA-01 failures to make `check` green.

## Modules And Task Status

| Task | Module / Deliverables | dependsOn | Status | Verification |
|------|-----------------------|-----------|--------|--------------|
| V01 | Shared package/lockfile/README reconciliation; validation evidence | C03, E03 | NOT_STARTED | Intent/hash comparison; frozen install; scoped formatting |
| V02 | Build validator, failure fixtures/tests | V01 | NOT_STARTED | Full check; deterministic rebuild; negative fixtures |
| V03 | Real local probes and dry run; `scripts/verify-local.ts` | V02 | NOT_STARTED | Riela-owned Wrangler integration; dry-run artifact |

### V01 — Serial Join And Repair

**Parallelizable**: No. Re-read current shared files and all content/edge snapshots; compare expected post-hashes and semantics, detect overwritten edits/unexpected files. Repair drift serially with new intent snapshots. Integrate only reviewed dependency/script requests into `pubpage/package.json`; generate `pubpage/bun.lock` serially and verify frozen install. Assemble `pubpage/README.md` from evidence: commands/contracts, source/asset provenance/optimization/checksums, deployment gates and later runbook sections. Read QA-01 evidence from content; do not invent facts or mark QA-02 resolved.

Only here perform broad website formatting, scoped to `pubpage/`; never root-wide format or lockfile generation. Use `.agents/scripts/format-ts.sh` only after confirming it can restrict writes to owned website TS paths; otherwise use pinned local formatter with explicit pubpage path scope. The agent role/skill standards still apply. Test scripts/fixtures themselves remain owned by this plan.

**Acceptance**: [ ] Intent/hash audit and serial repairs preserve both worker outputs; [ ] frozen install and formatting pass; [ ] runbook contains provenance and future rollout gates; [ ] no unrelated worktree change.

### V02 — Deterministic Build Validation And Negative Fixtures

**Parallelizable**: No; shared dist/_headers output has one writer. Implement parsed HTML/XML validation against independent expected routes/locales/metadata. Require four outputs; single H1, proper lang, nonempty equivalent localized fields, counterpart/home/privacy anchors and fragment IDs; href/src/srcset/JS/CSS target existence; exact canonical/hreflang/OG/Twitter/image dimensions; reciprocal sitemap equality and robots; capture provenance, actual dimensions and byte budgets; exact brew/latest release/Apple Silicon contract; expected external-origin allowlist; no placeholders, secrets, foreign product/domain/analytics/App Store/terms leakage. Production config must match exact domains, Worker-first, no fallback/previews. Validate no inline scripts/styles/handlers, forbidden resources or development CSP override. Check generated `_headers` and actual Worker policy parity.

Invoke the exported Worker with deterministic ASSETS stubs as part of validation, while retaining E03 independent tests. Missing outputs must produce aggregated findings, not throw before checking remaining pages. Mutation fixtures cover missing page/image, wrong canonical/locale, removed header, changed redirect, forbidden script and malformed sitemap; every fixture fails with a specific finding/nonzero CLI status. Use disposable fixture copies outside source/dist; do not mutate shared output during another check. Test multiple defects aggregate. Unit tests must not merely mirror the implementation.

Add `pubpage/scripts/verify-determinism.ts` and package command `verify:determinism`: run check, SHA-256 every dist file by sorted relative path, rebuild with dependencies already installed and networking unavailable, compare complete file sets/hashes. The bounded verifier owns and awaits every child to terminal exit, saves both complete build logs and manifests, and exits nonzero on build failure, file-set/hash mismatch or unavailable network isolation. Choose and document a supported network-isolation mechanism for the implementation host; do not silently run an unrestricted build and claim offline proof. No wall-clock metadata or remote release resolution. Exact reproducibility commands/tool network restriction and manifest paths go into validation evidence. Static budgets are checked offline; compressed CSS <=40 KiB and optional compressed JS <=15 KiB. R03 measures actual 390px selected resources/transfer/LCP/CLS.

**Acceptance**: [ ] `check` passes from frozen dependencies without credentials/network; [ ] all negative fixtures fail for intended reasons; [ ] aggregate diagnostics useful; [ ] identical rebuild manifests; [ ] distinct output/content/Worker failures tested.

### V03 — Actual Asset Routing And Dry Run

**Parallelizable**: No. Have Riela own a local Wrangler service launched from `pubpage/` using the pinned local command `bunx --no-install wrangler dev --local --ip 127.0.0.1 --port 8787`. Supply `pubpage/wrangler.local.jsonc` via `--config wrangler.local.jsonc`: local-only allowlist, the same Worker/static binding and no production domains. Production config must not inherit that allowlist. This file is explicitly owned by V03. Record readiness, effective config and service handle. `pubpage/scripts/verify-local.ts` is a bounded client invoked by `test:integration`; it consumes the recorded local service URL and terminates with aggregated route/assertion failures. It must never spawn an orphan or silently use a live host.

Probe actual ASSETS GET/HEAD on all four pages, static captures/OG/icons/robots/sitemap, all HTML aliases, real unknown 404, conditional ETag/304 behavior and matching body/content-type/security/cache policy. Exercise HTTP/www redirect and production-host logic through supported local host simulation; if the harness cannot preserve the URL host, record that case as not locally testable and retain deterministic tests plus mandatory production probes. Do not equate Vite preview with Worker integration. Shut down the Riela-owned service and record final exit status before completing the node.

Run local pinned Wrangler `deploy:dry-run` with production config and ignored output, inspect artifact/routes/binding/header source and forbidden preview exposure, and record artifact SHA-256. This is no production mutation. Verify current Wrangler flags against installed help/primary docs during implementation. Missing local runtime support blocks V03 and requires remediation/evidence, not a passing claim.

**Acceptance**: [ ] Real ASSETS probes pass with bounded logs and service shutdown evidence; [ ] stub/integration/live coverage limitations separately recorded; [ ] dry run succeeds with complete log, final exit status and artifact hash; [ ] independent verification review accepted.

## Verification Commands

| Command | Evidence |
|---------|----------|
| `bun install --cwd pubpage --frozen-lockfile` | Reconciled dependency reproducibility |
| `bun run --cwd pubpage format:check` | Scoped formatting result |
| `bun run --cwd pubpage typecheck` | Worker/config/scripts/test contracts |
| `bun run --cwd pubpage check` | Build, validator, Worker and negative-fixture tests |
| `bun run --cwd pubpage verify:determinism` | Bounded verifier; two network-disabled builds and sorted SHA-256 manifests |
| `bun run --cwd pubpage test:integration` | Explicit local URL via documented script input; actual ASSETS assertions |
| `bun run --cwd pubpage deploy:dry-run` | Pinned Wrangler artifact and production configuration |
| `git diff --check` | Joined whitespace hygiene |

Commands planned here are not executed in Step 4. `test:integration` accepts the local URL via `LOCAL_SITE_URL=http://127.0.0.1:8787` and rejects non-loopback destinations. Evidence files/logs go into ignored `pubpage/.verification/` or the owned Riela artifact directory; committed `pubpage/evidence/validation.md` contains concise sanitized results and durable artifact references, never secrets.

## Completion Criteria

- [ ] V01–V03 meet acceptance; high/mid review findings repaired serially and reverified.
- [ ] Full offline check, negative fixtures, deterministic manifests, local integration and dry run pass with complete logs.
- [ ] Root packages/app files/unrelated dirty work preserved; no implementation fanout writer remains active.
- [ ] QA-01-backed content ready; QA-02, current release evidence, production HTTP and browser acceptance explicitly remain R01–R03 gates.

## Progress Log Expectations

At every session end, the owning worker records task IDs completed/in progress, changed paths, immutable intent/hash evidence, command plus final exit status and complete log path, review decisions and blockers. Update acceptance checkboxes only when supported by evidence. Record explicit NOT_RUN/BLOCKED for missing prerequisites; do not call partial logs passing. The finalizer updates shared documentation and moves all completed plans only after the full join/review/verification gate.

## Progress Log

### Session: 2026-09-09 — Step 4 plan authoring
**Tasks Completed**: Plan specification only; no implementation task completed.
**Tasks In Progress**: None.
**Blockers**: Current workflow is design-plan-only; Step 5 plan review and subsequent authorized implementation are pending. Production facts remain gated by QA-01/QA-02 as assigned below.
**Notes**: Source design accepted by Step 3 `comm-000004`; no revision feedback supplied. Author self-check evidence: `/tmp/chilla-step4-plan/author-self-check.log`. Future task verification is prescribed, not executed by this node.

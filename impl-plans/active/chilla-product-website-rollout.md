# Chilla Product Website — Production And Finalization Implementation Plan

**Status**: Ready (authored; Step 5 independent review pending; implementation not started)
**Design Reference**: [Accepted product website design](../../design-docs/specs/design-product-website.md#rollout-review-and-plan-handoff)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09
**Issue Reference**: `tacogips/chilla`, “Create and deploy the Chilla product page”; issueNumber=null; issueUrl=null; intake `comm-000002`.
**Design Review**: Step 3 `comm-000004`, accepted, findings=[]; no Step 5 feedback supplied.

## Execution Metadata

```json
{
  "planId": "CPW-ROLLOUT",
  "planPath": "impl-plans/active/chilla-product-website-rollout.md",
  "dependsOn": [
    "CPW-VALIDATION"
  ],
  "writePaths": [
    "pubpage/evidence/rollout.md",
    "pubpage/evidence/browser/**",
    "impl-plans/active/chilla-product-website-rollout.md"
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
| `CPW-CONTENT` | [chilla-product-website-content.md](chilla-product-website-content.md) | Related; see DAG in main plan |
| `CPW-EDGE` | [chilla-product-website-edge.md](chilla-product-website-edge.md) | Related; see DAG in main plan |
| `CPW-VALIDATION` | [chilla-product-website-validation.md](chilla-product-website-validation.md) | Prerequisite |

## Scope And Intended Changes

Resolve authorized hosting prerequisites, publish the validated Worker/static assets to the two exact domains, verify live HTTP and visual behavior, and finalize evidence/rollback documentation. These remain future tasks: this design-plan-only workflow does not build/deploy/open a live browser, even if credentials are available. Unresolved QA facts are gates, not permission to omit production work or to claim completion.

## Modules And Task Status

| Task | Module / Deliverables | dependsOn | Status | Verification |
|------|-----------------------|-----------|--------|--------------|
| R01 | Owner QA decisions, release/preflight/rollback evidence; shared QA and README | V03; QA-01; QA-02 | NOT_STARTED | Account/zone/domain/release checks; adversarial gate |
| R02 | Production Worker deployment and live HTTP evidence | R01 | NOT_STARTED | Check-before-deploy; HTTP/status/header/TLS probes |
| R03 | Desktop/mobile screenshots and interaction/performance evidence | R02 | NOT_STARTED | Browser matrix and findings |
| R04 | Runbook/evidence review, shared indexes and plan archival | R03 | NOT_STARTED | Final scope/hash/check/review/rollback audit |

### R01 — Resolve Facts And Review Concrete Release

**Parallelizable**: No. Reuse C03 QA-01 owner/source evidence, serially update `design-docs/user-qa/qa-product-website.md` and its index with decision/date; obtain only still-missing facts. QA-02 requires the authorized account/zone and kinko profile. Once supplied, inspect installed `kinko exec --help` and Wrangler help, then record the exact approved invocation with profile identifier and command (no secret values) in `pubpage/README.md` and rollout evidence. Until this exists, secret-dependent probes/deployment are BLOCKED; do not provide a guessed runnable credential command.

Authenticate through kinko; confirm account/zone ownership, permissions, apex/www DNS/routes/redirect rules/Custom Domains and active or pending certificates. Record non-secret account/zone identifiers and previous Worker deployment/version, owned DNS/route state, and conflicts. No unrelated DNS replacement. Missing account facts or conflicting service ownership stops mutation until resolved. Verify current README installation text against actual latest `tacogips/chilla` release asset names and signed/notarized release/build evidence. Record release URL/version/asset and evidence source/date; revise copy through serial C02 repair if claims changed, then rerun V02/V03 before deployment.

Review concrete current dry-run artifact/hash, repository commit and rollback procedure through workflow adversarial review. The original request authorizes intended deployment in a later implementation workflow; ask permission only for an unresolved ownership/fact or an explicit review gate, explaining its source. No duplicate confirmation merely because deployment is external.

**Acceptance**: [ ] QA-01/QA-02 resolved with exact non-secret kinko invocation; [ ] release claims evidenced; [ ] account/domain/conflict/TLS inspection and rollback baseline complete; [ ] concrete deployment action accepted by adversarial review.

### R02 — Deploy And Verify HTTP

**Parallelizable**: No. Run `bun run --cwd pubpage deploy` through the R01 recorded kinko invocation; command must run check first and deploy only on success using pinned Wrangler. Record final exit status, complete sanitized log, deployment/version ID, commit and artifact hash. Attach only exact apex/www Custom Domains. Await and verify DNS/cert readiness with bounded owned commands, recording remaining blockers rather than declaring success from CLI output.

HTTP probes cover GET/HEAD for `/`, `/ja/`, `/privacy/`, `/ja/privacy/`, robots/sitemap/icons/captures/both OG images. Probe `https://www.chilla-viewer.com/ja/privacy/?a=1&a=2&next=%2Ffoo`, www static/unknown paths, HTTP apex/www, every alias, repeated/empty/encoded query and Unicode/%2F/trailing slash cases. Assert exact status/Location/security/cache/content-type, bodyless HEAD and bounded redirect chains; unknown paths stay 404/noindex/no-store; POST returns 405/Allow and no asset action. Verify ETag conditional behavior/304 against real successful assets; preserve cache validators. Distinguish synthetic exception 503 from live behavior; never damage production merely to force an exception. Active TLS must work for both hosts. Detect Cloudflare zone rule loops/query loss and route precedence changes.

If canonical pages fail, redirects loop, assets/CSP break, privacy claims are wrong or material accessibility failures appear, use the reviewed rollback: restore previous Worker version and separately only changed owned DNS/routes. For first deployment restore saved domain state and remove only newly owned bindings/deployment. Verify restored behavior and record results. DNS/certificates and cached 301/HSTS can outlive Worker rollback. Do not execute a destructive rollback rehearsal on a healthy live site just to tick a box.

**Acceptance**: [ ] Check-before-deploy succeeded; [ ] deployment/version/hash recorded; [ ] HTTP/TLS/headers/routes pass, with exact assertions beyond curl exit code; [ ] rollback ready, or executed with restored-state evidence when triggered.

### R03 — Browser And Performance Acceptance

**Parallelizable**: No. Use the available browser control skill/tool at execution time and record the exact tool calls or automated commands. At minimum Chromium desktop 1440×900 and mobile emulation 390×844, plus widths 320 and 768 CSS pixels; check WebKit/Safari when available and explicitly record its absence. Visit all four live canonical routes in desktop and mobile contexts. Capture URL, viewport, browser/version, date, screenshots and findings under `pubpage/evidence/browser/`; label emulation accurately.

Operate language/privacy/home/repository/install links; verify external release destination without installing software. Test keyboard skip/navigation/focus, 200% zoom, 400% reflow, reduced motion and no-JS navigation. Check content visibility, target sizes, headings/alt/caption locale, contrast and no horizontal overflow at 320/390/768/1440. Copy controls are absent by the accepted initial default; if subsequently added, test keyboard and accessible success/failure messages.

Inspect console/network/CSP; require no unexpected third-party/cookie/storage/telemetry requests. Record 390px first-view transfer <=1 MiB, selected image <=500 KiB, social images <=400 KiB, compressed CSS <=40 KiB and optional JS <=15 KiB. Record cache state, browser/network/CPU profile, LCP target <=2.5s and CLS <=0.1. Budget failure needs repair or documented design amendment, not waived silently. Do not equate HTTP success with browser acceptance. Fix high/mid findings serially via relevant owner, rerun impacted checks, redeploy through R01/R02 gates, then repeat affected visual checks.

**Acceptance**: [ ] Four-page desktop/mobile evidence and breakpoint/zoom/no-JS/keyboard checks pass; [ ] transfer/performance profile and results recorded; [ ] no material console/CSP/privacy/accessibility defects; [ ] review decisions and remaining low risks explicit.

### R04 — Reconcile Documentation And Archive Globally

**Parallelizable**: No. Fresh-read/hash all owned/shared paths and compare every intent snapshot; repair any drift serially and rerun `check` when repairs affect source. Merge actual QA/release/commands/deployment/browser/rollback evidence into `pubpage/README.md` and evidence files. Keep source provenance and exact operation commands, omit credential values. Review complete logs, artifact durability, domain ownership and rollback scope. Preserve unrelated `.riela/`, `riela-lock.json`, app and existing worktree edits.

Only the serial finalizer updates `impl-plans/README.md`, all plan statuses and cross-links, and moves the five files to `impl-plans/completed/`. Keep plans active/blocked if any prerequisite, test, production or browser criterion is unresolved. Website completion is distinct from this planning node's completion. Final git operations use the workflow's adversarial review and path-scoped staging, no concurrent git operations and no tool attribution/co-authorship. Record final review decision, commit and sanitized durable evidence references.

**Acceptance**: [ ] All five plans' acceptance evidence survives the join; [ ] final review accepts with no high/mid findings; [ ] README/QA/index/progress and archived cross-links accurate; [ ] only owned files staged by final git node.

## Verification Commands And Evidence

- `kinko exec --help` — inspect invocation syntax without exposing secrets; R01 must replace the deferred credential invocation with the exact approved profile/command before running it. This unresolved input blocks production, not planning.
- `gh release view --repo tacogips/chilla --json tagName,url,assets` — read-only current release check; signing/notarization requires separate release/build evidence, not inference from a filename.
- `bun run --cwd pubpage check` and `bun run --cwd pubpage deploy:dry-run` — final concrete artifact validation; use existing V03 evidence only if current hashes unchanged.
- `bun run --cwd pubpage deploy` — only inside exact approved R01 kinko invocation and after adversarial review.
- `curl --fail-with-body -sS -D - https://chilla-viewer.com/` — repeat for all canonical pages and static metadata/assets; assert expected headers/body/content type explicitly.
- `curl -sS -I 'https://www.chilla-viewer.com/ja/privacy/?a=1&a=2&next=%2Ffoo'` — expect 301 with exact apex path/query; repeat for HTTP/aliases/unknown routes and assert expected status independently of curl exit.
- `curl -sS -D - -o /dev/null -X POST https://chilla-viewer.com/` — expect 405, Allow: GET, HEAD and error policy.
- `curl --fail-with-body -sS -I https://www.chilla-viewer.com/` — TLS validation stays enabled; inspect exact redirect, do not use insecure flags.
- Browser tool actions recorded by R03; availability-specific commands cannot be invented in this planning node. Missing browser support blocks required browser acceptance until an owned available tool is supplied.
- `git diff --check` and `git diff --cached --name-only` — final whitespace/staging scope audit, alongside baseline and immutable intent/hash comparison.

Retain terminal handles through exit. HTTP probes should use bounded timeouts during implementation and store separate complete logs for expected failures. Foreground deployment commands and explicitly owned Riela services only. Store log path plus terminal exit status for each command; partial/live output is never passing evidence.

## Completion Criteria

- [ ] R01–R04 accepted; QA-01/QA-02 resolved, exact credential invocation documented without secrets.
- [ ] Production apex/www, release links, TLS, canonical routing and security policy verified against deployed artifact.
- [ ] Desktop/mobile browser/accessibility/performance evidence passes; review findings fixed or explicitly residual low risks.
- [ ] Rollback baseline/procedure reviewed, applicable rollback outcomes recorded, final runbook and global archival complete.
- [ ] No outstanding high/mid finding or required blocked check; otherwise remain active with explicit blocker and owner.

## Progress Log Expectations

At every session end, the owning worker records task IDs completed/in progress, changed paths, immutable intent/hash evidence, command plus final exit status and complete log path, review decisions and blockers. Update acceptance checkboxes only when supported by evidence. Record explicit NOT_RUN/BLOCKED for missing prerequisites; do not call partial logs passing. The finalizer updates shared documentation and moves all completed plans only after the full join/review/verification gate.

## Progress Log

### Session: 2026-09-09 — Step 4 plan authoring
**Tasks Completed**: Plan specification only; no implementation task completed.
**Tasks In Progress**: None.
**Blockers**: Current workflow is design-plan-only; Step 5 plan review and subsequent authorized implementation are pending. Production facts remain gated by QA-01/QA-02 as assigned below.
**Notes**: Source design accepted by Step 3 `comm-000004`; no revision feedback supplied. Author self-check evidence: `/tmp/chilla-step4-plan/author-self-check.log`. Future task verification is prescribed, not executed by this node.

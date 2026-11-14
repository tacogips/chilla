# Chilla Product Website — Worker And Security Implementation Plan

**Status**: Ready (authored; Step 5 independent review pending; implementation not started)
**Design Reference**: [Accepted product website design](../../design-docs/specs/design-product-website.md#build-and-hosting-boundary)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09
**Issue Reference**: `tacogips/chilla`, “Create and deploy the Chilla product page”; issueNumber=null; issueUrl=null; intake `comm-000002`.
**Design Review**: Step 3 `comm-000004`, accepted, findings=[]; no Step 5 feedback supplied.

## Execution Metadata

```json
{
  "planId": "CPW-EDGE",
  "planPath": "impl-plans/active/chilla-product-website-edge.md",
  "dependsOn": [
    "CPW-FOUNDATION"
  ],
  "writePaths": [
    "pubpage/src/worker.ts",
    "pubpage/src/security-headers.ts",
    "pubpage/scripts/generate-headers.ts",
    "pubpage/wrangler.jsonc",
    "pubpage/tests/worker.test.ts",
    "pubpage/evidence/edge.md",
    "impl-plans/active/chilla-product-website-edge.md"
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
| `CPW-FOUNDATION` | [chilla-product-website.md](chilla-product-website.md) | Prerequisite |
| `CPW-CONTENT` | [chilla-product-website-content.md](chilla-product-website-content.md) | Related; see DAG in main plan |
| `CPW-VALIDATION` | [chilla-product-website-validation.md](chilla-product-website-validation.md) | Related; see DAG in main plan |
| `CPW-ROLLOUT` | [chilla-product-website-rollout.md](chilla-product-website-rollout.md) | Related; see DAG in main plan |

## Scope And Intended Changes

Implement the accepted fixed-origin Worker routing, shared response policy and exact Custom Domain configuration. Extend the reference with header parity for Worker-generated responses, strict CSP, safe HEAD/304/error handling and no user-selected upstream. Use the F01 signatures. This plan may run beside content, but it cannot install packages or build shared output concurrently.

## Modules And Task Status

| Task | Module / Deliverables | dependsOn | Status | Verification |
|------|-----------------------|-----------|--------|--------------|
| E01 | `src/security-headers.ts`, `scripts/generate-headers.ts` | F03 | NOT_STARTED | Independent exact-policy unit assertions |
| E02 | `src/worker.ts`, `wrangler.jsonc` | E01 | NOT_STARTED | Routing/config tests |
| E03 | `tests/worker.test.ts`, edge evidence | E02 | NOT_STARTED | Bun unit tests and typecheck via check agent |

### E01 — Shared Security Policy

**Parallelizable**: Yes, with content. Implement `securityHeaders(isHttps)` and build-time `_headers` generation (allow an explicit output path for isolated temporary test outputs), with one policy source and independent expected constants in tests. Follow every exact header value in [SEO, Headers, And Caching Contract](../../design-docs/specs/design-product-website.md#seo-headers-and-caching-contract): CSP self-only/default/script/style/img/font, connect/object/frame/base/form none as specified, upgrade-insecure-requests; HSTS max-age=31536000 only on HTTPS, no includeSubDomains/preload; nosniff; DENY; strict-origin-when-cross-origin; denied camera/microphone/geolocation/payment/usb; COOP/CORP same-origin.

Apply once to all delegated assets and Worker redirects/errors even if ASSETS lacks `_headers`. No wildcard CORS, inline/eval/remote/analytics or production HMR allowance. HTML/robots/sitemap/unversioned media revalidate; only fingerprinted Vite `/assets/` output is immutable for one year. Redirect cache 300s, errors no-store plus noindex; 304 uses matching resource cache policy and retains status/ETag. Do not classify arbitrary `/assets/` names as immutable merely by directory.

**Acceptance**: [ ] Exact policy reusable by generator and Worker; [ ] parity tests have independent expected values; [ ] HTTP responses omit HSTS, HTTPS response classes include it; [ ] cache classes explicit.

### E02 — Request Precedence And Hosting Configuration

**Parallelizable**: Yes, with content. Implement the design's precedence: URL-host allowlist first (unknown 404); allowed production GET/HEAD only (others 405 with Allow, no body processing/asset call); then HTTP/www 301 to fixed HTTPS apex retaining encoded pathname/search without query parsing; then exact known aliases 301 preserving query; then ASSETS.fetch of the original remaining request. HEAD always bodyless. Aliases are `/index.html`, `/ja`, `/ja/index.html`, `/privacy`, `/privacy/index.html`, `/ja/privacy`, `/ja/privacy/index.html` only. Unknowns remain real 404. Asset exception -> generic 503/no-store without exception detail or logs. Preserve successful body/status/content-type/ETag/validators, including conditional 304. Never construct destinations from forwarding headers or fetch user-selected origins. Strip authority credentials/port from redirects.

Configure `chilla-product`, `src/worker.ts`, tested pinned compatibility date, `assets.directory=./dist`, binding ASSETS, run_worker_first=true, HTML auto-trailing-slash, not_found_handling=none, workers_dev=false, preview_urls=false, and exact Custom Domains apex/www. No wildcard or unrelated DNS mutations. Local-only allowlist uses explicit development configuration; production must reject it. Preview configuration is unnecessary initially; if introduced after design review it excludes production domains and sets noindex/nofollow.

**Acceptance**: [ ] Full precedence matches accepted design; [ ] encoded path/query maintained and redirects bounded; [ ] direct static and unknown paths reach correct response classes; [ ] config tests reject SPA fallback/preview publication/foreign domains.

### E03 — Independent Routing Regression Suite

**Parallelizable**: Yes, with content. Exercise exported Worker with deterministic ASSETS stubs, counting calls and asserting outgoing request identity. Cover GET/HEAD on all four pages; www nested/asset/unknown; HTTP apex/www; all aliases; repeated/empty/encoded query values, `%2F`, Unicode and trailing slashes; spoofed Host/Forwarded/X-Forwarded-Host; lookalike/non-allowlisted hosts, credentials/ports; POST and other methods; 404/503; delegated 304/ETag/body/content type; header/cache parity and bodyless HEAD on every branch. Check redirect chains terminate and fixed Location authority cannot be escaped. Failures report route/method/assertion details. Read expectations from design, not the module under test.

**Acceptance**: [ ] Tests prove no ASSETS call for rejected/redirected requests and no unsafe origin fetch; [ ] all response branches covered with independent expectations; [ ] coding and separate verification reviews recorded; [ ] stub proof explicitly distinguished from V03 real-ASSETS integration.

## Verification Commands

- `bun test --cwd pubpage tests/worker.test.ts` — bounded Worker unit suite; no asset build or production credentials.
- `bun run --cwd pubpage typecheck` — full package types after owned TS changes; classify missing downstream files explicitly rather than hiding failures.
- `bun run --cwd pubpage format:check` — read-only formatting; worker applies only path-scoped formatting to owned TS files.
- `bun run --cwd pubpage check` and `bun run --cwd pubpage deploy:dry-run` — later serial V02/V03 integration; package script ownership remains F02/V01.
- `git diff --check` — whitespace check. Save complete logs/exit statuses and hashes in edge evidence and own plan log.

## Completion Criteria

- [ ] E01–E03 implemented/reviewed with passing unit/type/format evidence and explicit downstream gaps.
- [ ] Worker config and headers match accepted design; no public deployment performed by this plan.
- [ ] Shared generator output ownership handed to V02/V03 at join; no concurrent dist/_headers writer.
- [ ] Independent tests and immutable intent snapshots available to validation/review roles.

## Progress Log Expectations

At every session end, the owning worker records task IDs completed/in progress, changed paths, immutable intent/hash evidence, command plus final exit status and complete log path, review decisions and blockers. Update acceptance checkboxes only when supported by evidence. Record explicit NOT_RUN/BLOCKED for missing prerequisites; do not call partial logs passing. The finalizer updates shared documentation and moves all completed plans only after the full join/review/verification gate.

## Progress Log

### Session: 2026-09-09 — Step 4 plan authoring
**Tasks Completed**: Plan specification only; no implementation task completed.
**Tasks In Progress**: None.
**Blockers**: Current workflow is design-plan-only; Step 5 plan review and subsequent authorized implementation are pending. Production facts remain gated by QA-01/QA-02 as assigned below.
**Notes**: Source design accepted by Step 3 `comm-000004`; no revision feedback supplied. Author self-check evidence: `/tmp/chilla-step4-plan/author-self-check.log`. Future task verification is prescribed, not executed by this node.

# Chilla Product Website — Localized Content And Assets Implementation Plan

**Status**: Ready (authored; Step 5 independent review pending; implementation not started)
**Design Reference**: [Accepted product website design](../../design-docs/specs/design-product-website.md#routes-and-visitor-behavior)
**Created**: 2026-09-09
**Last Updated**: 2026-09-09
**Issue Reference**: `tacogips/chilla`, “Create and deploy the Chilla product page”; issueNumber=null; issueUrl=null; intake `comm-000002`.
**Design Review**: Step 3 `comm-000004`, accepted, findings=[]; no Step 5 feedback supplied.

## Execution Metadata

```json
{
  "planId": "CPW-CONTENT",
  "planPath": "impl-plans/active/chilla-product-website-content.md",
  "dependsOn": [
    "CPW-FOUNDATION"
  ],
  "writePaths": [
    "pubpage/index.html",
    "pubpage/ja/index.html",
    "pubpage/privacy/index.html",
    "pubpage/ja/privacy/index.html",
    "pubpage/src/styles.css",
    "pubpage/public/captures/**",
    "pubpage/public/favicon.png",
    "pubpage/public/apple-touch-icon.png",
    "pubpage/public/og-image-en.png",
    "pubpage/public/og-image-ja.png",
    "pubpage/public/robots.txt",
    "pubpage/public/sitemap.xml",
    "pubpage/evidence/content.md",
    "impl-plans/active/chilla-product-website-content.md"
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
| `CPW-EDGE` | [chilla-product-website-edge.md](chilla-product-website-edge.md) | Related; see DAG in main plan |
| `CPW-VALIDATION` | [chilla-product-website-validation.md](chilla-product-website-validation.md) | Related; see DAG in main plan |
| `CPW-ROLLOUT` | [chilla-product-website-rollout.md](chilla-product-website-rollout.md) | Related; see DAG in main plan |

## Scope And Intended Changes

Build the four accessible static pages and localized metadata, using existing Chilla art only. Implement the accepted screenshot-led light design and macOS file/Git viewer description. Initial implementation uses selectable installation commands with no copy enhancement, avoiding unnecessary browser JavaScript; this is the accepted optional-feature default. A later copy button needs explicit assigned `src/main.ts` ownership and keyboard/result tests before integration.

## Modules And Task Status

| Task | Module / Deliverables | dependsOn | Status | Verification |
|------|-----------------------|-----------|--------|--------------|
| C01 | Captures/icons/social images; provenance in `pubpage/evidence/content.md` | F03 | NOT_STARTED | Source/derivative hashes, dimensions, byte budgets |
| C02 | Four localized HTML pages and shared CSS | C01 | NOT_STARTED | Translation, route/metadata/link and accessibility review |
| C03 | Privacy facts, robots/sitemap and content evidence | C02; QA-01 | NOT_STARTED | Owner confirmations; output validation in V02 |

### C01 — Prepare Website Assets

**Parallelizable**: Yes, with E01–E03 only; no shared build/install. Freshly inspect `doc/captures/readme-capture.png`, `doc/captures/git-diff-capture.png`, `doc/captures/movie-capture.png`, `src-tauri/icons/icon.png`, and optional `doc/chilla-cat-face-icon-clean.png` for private paths/secrets. Preserve originals; crop/redact derivatives when necessary without changing demonstrated behavior. Put responsive WebP and PNG fallback variants in `pubpage/public/captures/`, at widths no larger than native. Record actual filenames as the content-to-validator handoff.

Generate root public `favicon.png` (64×64), `apple-touch-icon.png` (180×180), `og-image-en.png` and `og-image-ja.png` (1200×630) from existing icon art. Record source path/hash, derivative hash/dimensions, exact optimization commands/tool versions and any redaction in content evidence for V01 to merge into README. Images remain self-hosted.

**Acceptance**: [ ] Three captures represented with provenance and unmodified originals; [ ] each selected screenshot <=500 KiB and social image <=400 KiB; [ ] dimensions and localization verified.

### C02 — Localized Product, Layout And Metadata

**Parallelizable**: Yes, with edge plan. Use semantic header/main/footer, home/privacy/repository links, skip link, one H1 and ordered headings. Language anchors preserve product/privacy context, name the target language and use destination lang/hreflang. English root default, no locale sniffing, no `/en/`, clean counterpart queries. Translate headings, copy, captions, alt, controls, metadata and privacy content; literal filenames/commands remain literal. Captions explain English app UI where needed.

Order product sections: concise hero, install CTAs plus Apple Silicon label, README hero capture, file/Markdown, Git diff, media preview, install instructions, footer. Match README capabilities and examples `chilla .`, `chilla notes.md`, `chilla movie.mp4`; no editor-first, unmeasured speed, Intel/universal, minimum macOS or App Store claims. Show `brew tap tacogips/tap` then `brew install --cask chilla`. Under QA-03’s accepted default, the DMG CTA opens `https://github.com/tacogips/chilla/releases/latest` with `chilla_<version>_aarch64.dmg` selection, open/drag/eject/launch instructions. No release-fetch runtime API. New-tab links, if any, require noopener/noreferrer.

Each page gets the design's unique localized title/description, viewport, exact HTML lang, HTTPS apex canonical, reciprocal en/ja/x-default, all OG locale/alternate/url/type/site/image/dimension/alt fields and Twitter summary_large_image; icons on all pages. No fabricated schema ratings/handles. Hero eager/high-priority; other captures lazy with width/height, srcset/sizes. All href/src/fragment references resolve.

System fonts, external CSS only; no inline handlers/styles/scripts or third-party resources. Visible focus, semantic controls targeting 44×44, normal text contrast >=4.5:1 and large text/controls >=3:1. No hover requirement; reduced motion, 200% zoom and 400% reflow supported. At 320/390/768/1440 CSS pixels no page overflow; mobile clearly says Mac download. First-view 390px transfer <=1 MiB, compressed CSS <=40 KiB, optional compressed JS <=15 KiB, CLS <=0.1 and mobile LCP target <=2.5s under a recorded profile.

**Acceptance**: [ ] English/Japanese parity and install facts reviewed; [ ] four pages work without JS; [ ] static accessibility/metadata inspection passes; [ ] measured browser acceptance remains assigned to R03, not presumed here.

### C03 — Resolve Privacy Content And Crawl Metadata

**Parallelizable**: Yes, with edge plan. Local privacy drafting may precede QA-01, but this task and content release readiness stay BLOCKED until owner-confirmed operator/contact, hosting data/purpose/retention/control facts and effective date exist. Ask only for missing facts; preserve existing authorizations. Audit app network/storage behavior including GitHub diffs/remote resources read-only before broad app claims. Record evidence, date and proposed QA resolution in `pubpage/evidence/content.md`; R01 serially updates shared QA documents. Both languages disclose website scope, hosting versus app processing, external links, policy changes and privacy contact. No invented addresses, absolute zero-collection, imported Konjac legal text or unresolved placeholders. No cookies/storage/forms/accounts/analytics/fonts/embeds added. QA-04 retains the accepted screenshot-led copy and no-terms default; new legal/analytics scope needs a design amendment.

Create robots allowing crawl and pointing to apex sitemap. Sitemap contains exactly the four canonical URLs and reciprocal language alternates; omit lastmod absent meaningful maintained date. No alias/www/preview URLs, locale fallback or dead terms links.

**Acceptance**: [ ] QA-01 confirmations and source audit support both privacy pages; [ ] no placeholders or unsupported privacy claims; [ ] robots/sitemap match route contract; [ ] content provenance and review evidence ready for serial README/QA integration.

## Verification Commands

- `shasum -a 256 doc/captures/readme-capture.png doc/captures/git-diff-capture.png doc/captures/movie-capture.png src-tauri/icons/icon.png` — compare before/after; record derivative hashes with their actual paths.
- `sips -g pixelWidth -g pixelHeight pubpage/public/favicon.png pubpage/public/apple-touch-icon.png pubpage/public/og-image-en.png pubpage/public/og-image-ja.png` — exact art dimensions; optimization commands and screenshot dimensions recorded separately with actual filenames.
- `git diff --check` — task-local whitespace check.
- `bun run --cwd pubpage check` — executed serially in V02 after edge join; C tasks supply expected localized metadata, images, anchors and approved external-origin allowlist.
- Browser checks and real transfer/LCP/CLS measurements are R03 commands/tool actions, not claimed by source inspection. If TS is added, the coding and separate verification agents are mandatory and V01 integrates any package changes.

## Completion Criteria

- [ ] C01–C03 acceptance and progress evidence complete, including owner facts for QA-01.
- [ ] Four localized pages, all three captures and required metadata/SEO outputs exist with explicit filenames.
- [ ] No root/app/source-image changes or overlap with Worker `_headers` output.
- [ ] V01 receives immutable content intent/hash/provenance evidence; full build/browser acceptance remains tracked in dependent plans.

## Progress Log Expectations

At every session end, the owning worker records task IDs completed/in progress, changed paths, immutable intent/hash evidence, command plus final exit status and complete log path, review decisions and blockers. Update acceptance checkboxes only when supported by evidence. Record explicit NOT_RUN/BLOCKED for missing prerequisites; do not call partial logs passing. The finalizer updates shared documentation and moves all completed plans only after the full join/review/verification gate.

## Progress Log

### Session: 2026-09-09 — Step 4 plan authoring
**Tasks Completed**: Plan specification only; no implementation task completed.
**Tasks In Progress**: None.
**Blockers**: Current workflow is design-plan-only; Step 5 plan review and subsequent authorized implementation are pending. Production facts remain gated by QA-01/QA-02 as assigned below.
**Notes**: Source design accepted by Step 3 `comm-000004`; no revision feedback supplied. Author self-check evidence: `/tmp/chilla-step4-plan/author-self-check.log`. Future task verification is prescribed, not executed by this node.

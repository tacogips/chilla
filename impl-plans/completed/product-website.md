# Chilla Product Website Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/design-product-website.md`
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

## Scope

### Installation heading clarification — completed 2026-09-09

- [x] Replace the promotional installation eyebrow with "INSTALLATION" /
  "インストール方法", retaining the direct "Install chilla" heading.
- [x] Add a regression check against "MAKE YOURSELF AT HOME", build, and deploy.

Deployment: `40088fba-b9b8-402b-ae32-bfebb495659b`.

### Non-interactive screenshots follow-up

- [x] Remove browsing/diff screenshot links in both locales, preserving images
  and alternative text (`pubpage/index.html`, `pubpage/ja/index.html`).
- [x] Run regression checks, deploy, and verify no screenshot links remain in
  production (`pubpage/scripts/validate-build.mjs`).

**Completion log (2026-09-09)**: Build and validator passed. Both production
locales serve the browsing and diff pictures without anchor wrappers.
Deployment: `1c675089-7ca0-4470-bb7f-ec63968f0e56`.

### Installation placement follow-up

- [x] Move installation immediately below the introduction in both locales,
  before screenshots and detailed features; preserve installation content.
- [x] Check section order, build, deploy, and verify the published page.

Deliverables: localized HTML, shared presentation CSS, and build validator.

**Completion log (2026-09-09)**: Installation now precedes screenshots and detailed
features in both locales. Updated the benefit label to "Fast and responsive" /
"軽快な動作" and aligned metadata and hero descriptions. Build and validation
passed; production HTML confirms the wording and installation-first order.
Deployment: `0927037d-24b6-4603-ac4f-6939037f22f7`.

### Installation instructions follow-up

- [x] Add numbered DMG installation and Homebrew setup/launch instructions to
  both locales; preserve the existing compact headline and cat-led design.
- [x] Validate installation content, build, deploy, and verify production HTML.

Deliverables: `pubpage/index.html`, `pubpage/ja/index.html`, shared CSS, and
`pubpage/scripts/validate-build.mjs`. Verification depends on content completion.

September 9 redesign: replace the original visual direction with the cute cat
identity, make Yazi-like/keyboard/lightweight/Git-diff messaging prominent, and
retake real app screenshots. Existing completion checks below describe the first
deployment; redesign checks are tracked separately here.

### Redesign tasks

- [x] TASK-001: Fresh public-content browsing and Git diff captures; record provenance.
- [x] TASK-002: Replace English/Japanese presentation and shared styles with cream,
  sage, peach, cat artwork, primary feature messaging, and default shortcut guide.
- [x] TASK-003: Update validation, verify desktop/mobile layouts, and redeploy.

TASK-002 depends on TASK-001 imagery; TASK-003 depends on TASK-002. All redesign tasks are
Completed, not parallelized. Deliverables stay within the existing website,
website documentation, and screenshot assets; app runtime behavior is unchanged.

Create, validate, deploy, and browser-test the bilingual Chilla product website.
Desktop application runtime code and release artifact production are out of
scope; the website links to the existing release channels.

## Modules

### Product pages and presentation

**Files**: `pubpage/index.html`, `pubpage/ja/index.html`,
`pubpage/src/styles.css`, `pubpage/src/main.js`

**Status**: COMPLETE

**Checklist**:

- [x] English and Japanese product copy reflects the shipped app
- [x] Real screenshots and app icon are bundled
- [x] Responsive navigation and progressive reveal behavior are accessible
- [x] Download, Homebrew, source, and privacy links are present

### Privacy pages and crawl metadata

**Files**: `pubpage/privacy/index.html`, `pubpage/ja/privacy/index.html`,
`pubpage/public/robots.txt`, `pubpage/public/sitemap.xml`,
`pubpage/public/_headers`, `pubpage/public/og.png`

**Status**: COMPLETE

**Checklist**:

- [x] Local-first privacy behavior is described accurately in both languages
- [x] Canonical, alternate-language, Open Graph, and crawl metadata are complete
- [x] Security headers use a self-only content policy

### Build and deployment

**Files**: `pubpage/package.json`, `pubpage/package-lock.json`,
`pubpage/vite.config.js`, `pubpage/wrangler.jsonc`,
`pubpage/src/worker.js`, `pubpage/scripts/validate-build.mjs`

**Status**: COMPLETE

**Checklist**:

- [x] Dependencies install reproducibly
- [x] Production build and deterministic validation pass
- [x] Cloudflare Worker deploys to `chilla-viewer.com`
- [x] `www.chilla-viewer.com` redirects to the canonical apex host

### Live verification

**Status**: COMPLETE

**Checklist**:

- [x] Apex, localized, privacy, and asset HTTP checks pass
- [x] Security and redirect headers are verified
- [x] Desktop browser layout and interactions are verified
- [x] Mobile browser layout and overflow are verified

## Module Status

| Module | File Path | Status | Tests |
| --- | --- | --- | --- |
| Product presentation | `pubpage/index.html`, `pubpage/ja/index.html`, `pubpage/src/` | COMPLETE | Build passed |
| Privacy and metadata | `pubpage/privacy/`, `pubpage/ja/privacy/`, `pubpage/public/` | COMPLETE | Validator passed |
| Build and deploy | `pubpage/package.json`, `pubpage/wrangler.jsonc` | COMPLETE | Deployed and HTTP verified |
| Live verification | Local responsive captures and production browser | COMPLETE | Chrome and Safari |

## Dependencies

| Feature | Depends On | Status |
| --- | --- | --- |
| Build validation | Product and privacy pages | COMPLETE |
| Cloudflare deployment | Successful build validation | COMPLETE |
| Browser verification | Successful deployment and DNS propagation | READY |

## Completion Criteria

- [x] All source and localized content implemented
- [x] `npm ci` completes from the website lockfile
- [x] `npm run check` passes
- [x] Wrangler reports a successful Worker deployment
- [x] `chilla-viewer.com` serves the validated build
- [x] Browser desktop and mobile checks pass
- [x] Progress log and plan status are complete

## Progress Log

### Session: 2026-09-09

**Tasks Completed**: Reference inspection, Cloudflare authentication check,
domain provisioning, visual brief and social-preview generation, bilingual site
implementation, dependency installation and audit, deterministic build validation,
responsive asset optimization, Worker hardening, production deployment, and live
HTTP verification.

**Tasks In Progress**: Required desktop and mobile browser inspection.

**Blockers**: No browser is connected to the current Codex browser-control session.

**Notes**: Existing unrelated repository edits are being preserved. The domain
did not resolve before deployment; Wrangler custom-domain attachment provisioned
both records, and public DNS plus HTTPS were subsequently verified through DNS over
HTTPS. Current Cloudflare Worker version: `b5843f62-356c-46c4-af35-c5e3e82fe0ab`.

### Session: 2026-09-09 — cat redesign and headline revision

**Tasks Completed**: TASK-001 through TASK-003. Replaced the graphite design with
cream, sage, peach, and existing pixel-art cat imagery. Retook browsing and Git
diff screenshots from the current debug app. Added prominent keyboard, Yazi-like,
lightweight, and diff messaging; then revised the headline to explicitly promise
terminal-style fast browsing and reduced its font size per user feedback.

**Verification**: Site build/validator passed; dependency audit found zero
vulnerabilities. Chrome full-page captures inspected at 1280px and 390px; Safari
narrow layout inspected. Mobile menu and Keyboard anchor work. Japanese production
page loads in Chrome and its revised headline was verified. Live HTML and image
requests pass, as does the www redirect. Browser-discovered Cloudflare beacon
injection was prevented with no-transform; reloading showed zero console messages.

**Deployment**: 6f19c741-ca1d-422e-9ded-d7c8fe75465a on chilla-viewer.com.
**Blockers**: None. Computer Use provided browser verification despite the browser
plugin having no connected backend. No application runtime sources were changed.

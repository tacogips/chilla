# Chilla Public Product Website

## Overview

Status: authored for independent review; implementation and production work pending.
Workflow: `design-plan-only`, execution `codex-design-and-implement-review-loop-session-2`, Step 2.
Issue reference: workflow input **Create and deploy the Chilla product page**, repository
`tacogips/chilla`; no issue number or URL supplied. Step 1 communication `comm-000002`
is the authoritative intake. This document specifies the eventual website; it does
not claim that source, deployment, or browser verification exists.

Chilla is a lightweight macOS file and Git viewer. The public site explains its
current capabilities, demonstrates them using repository captures, and directs
Apple Silicon users to Homebrew Cask or the signed/notarized DMG release page.
English and Japanese visitors receive equivalent product and privacy information.

This separate specification is necessary because public HTTP routing, hosting,
privacy, SEO, and deployment have different boundaries from the desktop app.
No Tauri IPC, app document format, Rust runtime, or root frontend bundle changes
are required. All future website source, dependencies, generated assets, scripts,
tests, and hosting configuration belong in root-level `pubpage/`.

## Reference And Agent Mapping

The local reference root established by Step 1 is
`/Users/taco/gits/tacogips/konjac/pubpage`, overriding the generic `../../codex-agent`
fallback. See the [reference index](../references/README.md#chilla-product-website).

| Reference | Adopted behavior | Chilla adaptation |
|-----------|------------------|-------------------|
| `vite.config.js` and localized HTML | Static multi-page build with direct deep links | Four product/privacy pages; no client router or hydration requirement |
| `wrangler.jsonc` | Worker static-assets binding, Worker runs first | Two exact Chilla Custom Domains; no Konjac legacy hosts |
| `src/worker.js` | Permanent canonical-host redirect before asset lookup | Preserve encoded path/query; apply security headers to every Worker response |
| `public/_headers` | Explicit browser security and caching policy | Strict self-hosted policy without analytics or inline-script/style allowances |
| `scripts/validate-build.mjs` | Deterministic output checks and Worker invocation | Parse metadata/links, test adversarial URLs and header parity, avoid prose substring-only tests |
| `src/analytics.js`, terms, App Store assets | Reviewed for scope only | Do not copy analytics IDs, legal text/contact, QR dependencies, iOS screenshots, or App Store links |

Codex agent references remain explicit:
`.agents/agents/ts-coding.md` owns future TypeScript implementation;
`.agents/agents/check-and-test-after-modify.md` owns verification after TypeScript edits;
`.agents/skills/design-doc/SKILL.md` governs this design;
`.agents/skills/impl-plan/SKILL.md` governs the later implementation plan.
There is no Codex/Cursor CLI runtime integration in this issue. Cursor CLI behavior
mapping is **not applicable**; no adapter is needed. If agent integration is added
later, isolate provider-specific behavior in an adapter outside website content.

## Routes And Visitor Behavior

| Public canonical path | Build output under `pubpage/dist/` | Language | Counterpart |
|-----------------------|------------------------------------|----------|-------------|
| `/` | `index.html` | `en` | `/ja/` |
| `/ja/` | `ja/index.html` | `ja` | `/` |
| `/privacy/` | `privacy/index.html` | `en` | `/ja/privacy/` |
| `/ja/privacy/` | `ja/privacy/index.html` | `ja` | `/privacy/` |

Every page has a header with home and language links, a main landmark, and a footer
with the localized privacy/home link and repository link. Language switches use
ordinary anchors with the destination language named in that language and its
`lang`/`hreflang`; privacy switches stay on privacy. English is the root/default;
do not redirect by IP, browser language, or cookies. No `/en/` route is introduced.
Locale switches use the clean counterpart path; query strings are not stored or
copied. Host redirects, by contrast, preserve path and query as specified below.

Product page order: header; concise title and description; installation calls to
action and macOS Apple Silicon label; README preview hero; file browsing/Markdown,
Git diff, and media preview feature sections; installation instructions; footer.
Use real feature names and examples from `README.md`, including `chilla .`,
`chilla notes.md`, and `chilla movie.mp4`. Do not market the historical editor-first
architecture, unsupported operating-system packages, or unmeasured speed claims.
The initial direction is a quiet light canvas, dark legible text, restrained accent,
cat icon, and large captures. No autoplay, carousel, tracking, or decorative video.
Japanese copy must translate headings, instructions, captions, alt text, controls,
metadata, and privacy content; filenames, commands, and product name remain literal.

Install contract follows `README.md`:

- Show `brew tap tacogips/tap` followed by `brew install --cask chilla` as selectable
  text, with an optional progressive-enhancement copy button and accessible result.
- The DMG CTA is clearly labeled as opening the latest GitHub release, linking to
  `https://github.com/tacogips/chilla/releases/latest`. Explain selection of
  `chilla_<version>_aarch64.dmg`, opening the DMG, dragging `chilla.app` into
  Applications, ejecting, and launching. Do not invent a version-independent asset URL.
- State both promoted paths target Apple Silicon. Signed/notarized wording derives
  from README and must be rechecked against release evidence before publication.
  No fake universal/Intel compatibility, App Store availability, or fixed minimum
  macOS version is asserted. The tarball install script stays outside the primary flow.
- External links navigate normally; any new-tab link requires `rel="noopener noreferrer"`.
  Do not contact GitHub automatically from the product page to resolve a download.

## Assets, Accessibility, And Performance

Reuse `doc/captures/readme-capture.png` for the hero,
`doc/captures/git-diff-capture.png` for Git review, and
`doc/captures/movie-capture.png` for media. Derive website favicon, touch icon, and
social artwork from `src-tauri/icons/icon.png` (other existing size variants may
be used); `doc/chilla-cat-face-icon-clean.png` is an optional alternate source.
Never modify originals. Review captures for secrets/private paths and crop or
redact a derivative if necessary without fabricating app functionality.

Keep final derivatives in `pubpage/public/`; record source path, dimensions,
optimization command, and checksum in `pubpage/README.md`. Generate raster social
images at 1200 x 630, localized as `og-image-en.png` and `og-image-ja.png`; favicon
64 x 64 and touch icon 180 x 180. Create responsive screenshot sizes up to native
resolution, using WebP with PNG fallback. Include width/height, `srcset` and `sizes`;
hero loads eagerly with high priority, lower captures lazily. Stable public filenames
use revalidation; only fingerprinted Vite `/assets/` files receive immutable caching.

Acceptance: all four pages work without JavaScript and at 320, 390, 768, and 1440
CSS pixels without page-level horizontal overflow. Use a single H1, ordered headings,
skip link, visible keyboard focus, semantic anchors/buttons, descriptive localized
image alternatives, and caption context for screenshots whose app UI is English.
Decorative icons have empty alt text. Normal text contrast is at least 4.5:1;
large text and meaningful controls at least 3:1. Controls target 44 x 44 CSS pixels.
At 200% zoom, content and focus remain visible; 400% reflow must remain usable.
Honor reduced motion; do not require hover. On mobile installation controls remain
visible but explain that the download is for a Mac.

Budgets for initial implementation: each selected screenshot derivative <= 500 KiB,
each social image <= 400 KiB, compressed CSS <= 40 KiB, optional compressed browser
JS <= 15 KiB, first-view transfer <= 1 MiB on the 390px viewport. Measure in the
future validator/browser pass; an exception requires a documented design amendment.
System fonts avoid remote font requests. Layout dimensions should keep CLS <= 0.1;
future mobile performance checks target LCP <= 2.5s under a recorded test profile.

## Privacy And Data Boundary

The site is static: no account, forms, uploaded files, cookies, browser storage,
third-party analytics, remote fonts, embeds, or runtime data API is introduced.
Cloudflare receives requests to serve the site. GitHub/Homebrew destinations receive
traffic when the visitor follows links. The Worker must not add query/body logging.
Hosting security/operational processing is distinct from application telemetry;
never publish an absolute claim that nobody collects information.

Both privacy pages must describe website scope, operator/contact, effective date,
hosting request data and purpose, retention/control policy after owner confirmation,
external download links, policy changes, and how to request privacy assistance.
Also clearly distinguish the desktop application: local viewing does not make all
features offline; GitHub diff retrieval and linked remote resources need a source
audit before any broad local-only/no-network assertion. Do not import Konjac's
iCloud, OCR, advertising, API-key, Apple, or Google disclosures.

Privacy drafting may proceed from this boundary, but production publication is
blocked until QA-01 in the [user questions](../user-qa/qa-product-website.md) resolves
operator/contact and actual processing disclosures. Placeholders and invented email
addresses must fail release validation. Terms pages are excluded unless the owner
requests them; no dead terms links may ship. Analytics requires a separate design
change and revised disclosures/security policy, not a copied reference module.

## Build And Hosting Boundary

An isolated private Bun package in `pubpage/package.json` uses Vite for four static
HTML entrypoints and external CSS; optional browser behavior, Worker, Vite config,
and validation scripts use TypeScript. Commit `pubpage/bun.lock`; pin reviewed
tool versions at implementation time instead of copying the reference versions.
No dependencies, assets, or build output are added to the desktop entrypoint.

Planned responsibilities (paths describe future deliverables, not files created now):

| Path | Responsibility |
|------|----------------|
| `pubpage/index.html`, `pubpage/ja/index.html`, `pubpage/privacy/index.html`, `pubpage/ja/privacy/index.html` | Crawlable localized content and page metadata |
| `pubpage/src/styles.css`, optional `pubpage/src/main.ts` | Responsive design and accessible copy enhancement |
| `pubpage/src/worker.ts` | Host/method routing, asset delegation, response headers |
| `pubpage/src/security-headers.ts` | Header policy used by Worker and header generation |
| `pubpage/public/` | Captures/icons/social art, robots, sitemap, generated `_headers` |
| `pubpage/vite.config.ts`, `pubpage/wrangler.jsonc`, `pubpage/tsconfig.json` | Build entrypoints, strict types, deployment binding |
| `pubpage/scripts/validate-build.ts`, `pubpage/tests/` | Deterministic assertions, Worker tests, validator failure fixtures |
| `pubpage/package.json`, `pubpage/bun.lock`, `pubpage/.gitignore`, `pubpage/README.md` | Commands, reproducibility, ignored output, asset/deployment runbook |

Flow: localized source + repository asset derivatives -> Vite -> `pubpage/dist/`
-> deterministic validator -> Wrangler dry run -> authorized production deployment
-> HTTP and desktop/mobile browser verification. The build is network-independent
after dependencies are installed; it must not query releases or inject wall-clock dates.

Worker configuration: name `chilla-product`, entry `src/worker.ts`, assets directory
`./dist`, binding `ASSETS`, `run_worker_first: true`, HTML handling
`auto-trailing-slash`, and `not_found_handling: none`. Pin a tested compatibility
date at implementation time. Production disables `workers_dev` and `preview_urls`.
If preview hosting is needed later, use a separate configuration without production
domains and with `X-Robots-Tag: noindex, nofollow`.

Attach both `chilla-viewer.com` and `www.chilla-viewer.com` as exact Custom Domains
to the Worker. Do not add wildcard routes or replace unrelated DNS records.
Custom Domains match exact hosts, and provision DNS/certificates; inspect conflicts
and existing zone routes before applying them. See [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Request flow and precedence:

1. Read the request URL host; never use `Host`, `Forwarded`, or `X-Forwarded-Host`
   values to construct a destination. Reject non-allowlisted hosts with 404 except
   explicit local-development hosts configured only for development.
2. For the two production hosts, permit GET and HEAD; others return 405 with
   `Allow: GET, HEAD`, no asset lookup, and no request-body processing.
3. For `www` or HTTP on either allowed host, return 301 to HTTPS apex with a fixed
   authority (no credentials/port) and the URL's encoded pathname and search
   unchanged. Do not parse/rebuild query parameters or decode the pathname.
   Example: `https://www.chilla-viewer.com/ja/privacy/?a=1&a=2&next=%2Ffoo`
   -> `https://chilla-viewer.com/ja/privacy/?a=1&a=2&next=%2Ffoo`.
4. On HTTPS apex, explicitly 301-normalize known aliases `/index.html`, `/ja`,
   `/ja/index.html`, `/privacy`, `/privacy/index.html`, `/ja/privacy`, and
   `/ja/privacy/index.html` to their canonical table paths, preserving search.
   A www alias can therefore require two bounded redirects. Unknown paths remain
   unknown; never redirect them to the home page or invent locale fallbacks.
5. Delegate remaining GET/HEAD to `env.ASSETS.fetch(request)`, preserving its
   response status, body, content type, ETag and cache validators. Apply the common
   security policy without duplicating header values. Unknown assets/pages return
   real 404; asset-binding failure returns generic 503, no exception detail, no-store.
   HEAD has no body on every branch. Never fetch a user-selected origin.

Worker-first execution is necessary to redirect even paths that match static files.
See [Cloudflare Worker routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).
Worker-created redirects/errors require headers attached in code; `_headers` alone
does not cover them. See [Cloudflare static headers](https://developers.cloudflare.com/workers/static-assets/headers/).

## SEO, Headers, And Caching Contract

Each canonical page has a unique localized title/description, exact `html lang`,
viewport metadata, a single absolute HTTPS apex canonical without query, and
reciprocal `hreflang=en`, `ja`, and `x-default` pointing at the English counterpart.
Set Open Graph type `website`, site name `Chilla`, localized title/description,
canonical `og:url`, locale `en_US` or `ja_JP` and the alternate locale, absolute
localized raster `og:image`, dimensions and localized image alt text. Use Twitter
`summary_large_image` with corresponding content; omit invented social handles.
Favicons appear on all pages. Do not add fabricated reviews or ratings/schema data.

`public/sitemap.xml` enumerates exactly the four canonical URLs with reciprocal
language alternates. Omit lastmod unless sourced from a meaningful maintained date.
`public/robots.txt` allows public crawling and names the apex sitemap. Neither
redirect hosts, HTML aliases, nor preview URLs appear in the sitemap. Unknown-page
and error responses have `X-Robots-Tag: noindex`. No robots file is an access control.

Apply the following policy once to assets and Worker responses, including redirects,
404, 405, and 503 (HSTS only on HTTPS):

| Header | Required value |
|--------|----------------|
| Content-Security-Policy | `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; upgrade-insecure-requests` |
| Strict-Transport-Security | `max-age=31536000` (no includeSubDomains/preload until all subdomain ownership/TLS is verified) |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| Cross-Origin-Opener-Policy | `same-origin` |
| Cross-Origin-Resource-Policy | `same-origin` |

No inline handlers, inline style attributes, inline scripts, eval, remote assets,
or analytics allowances. Development HMR may use a development-only CSP override;
the production validator rejects that override. Generate `_headers` from the shared
policy during build and verify parity against actual Worker response headers.
Headers apply to delegated asset responses even if local mocks lack `_headers`.
Do not attach wildcard CORS. Public social images remain ordinarily fetchable by
crawlers; validate correct image content types in production.

HTML, robots, sitemap, unversioned icons/captures/social images use
`Cache-Control: public, max-age=0, must-revalidate`. Fingerprinted `/assets/` responses
use `public, max-age=31536000, immutable`. Redirects use `public, max-age=300` to
limit rollback lag. Errors use `no-store`. Do not overwrite an asset ETag or convert
a conditional 304 to 200; apply the applicable successful resource cache policy to
304 responses. Redirect Location has the fixed apex origin; no query-based redirect
target or user-controlled canonical Link header is emitted.

## Deterministic Validation And Acceptance Matrix

The future `bun run --cwd pubpage check` must typecheck, build, validate and run
Worker/validator tests, exiting nonzero on any failure with file/route/assertion
details. It never deploys or needs credentials/network. The validator reads output
and invokes the exported Worker using a deterministic ASSETS stub; stub tests prove
application logic, while local Wrangler integration tests prove actual asset routing.
Tests use independent expected values to catch mistakes in the shared policy.

| Intake signal | Required evidence |
|---------------|-------------------|
| Bilingual product/privacy | Four output files; HTML parsing checks locale, headings, counterpart/home/privacy links, fragments, nonempty translations; desktop/mobile interaction review |
| Existing Chilla assets | All three captures represented, provenance matches source checksums, derivatives exist, dimensions/size budgets and localized alt text pass |
| Installation contract | Exact brew commands/latest release URL and Apple Silicon label; README comparison; separate live release asset/signing-evidence check before launch |
| SEO/security | Exact canonical/hreflang/OG values; sitemap URL and alternate equality; robots; CSP directives; headers on every response class; no placeholder/contact/foreign-product leakage |
| Deterministic validator | Missing page/image, wrong canonical/locale, removed header, changed redirect, forbidden script, and malformed sitemap fixtures each fail; failures aggregate instead of stopping at first missing file |
| Apex/static/www behavior | GET/HEAD on all four pages; www nested path, asset and unknown path; repeated/empty/encoded query values; `%2F`, Unicode and trailing slash cases; spoofed forwarding headers; lookalike hosts; POST=405; known aliases; no loop; 404/503/304/body preservation |
| Deploy and browsers | Dry-run artifact, account/zone preflight, production deployment ID, rollback record, real HTTP checks plus desktop and mobile screenshots/interaction logs |
| Mode restriction | Current workflow changes only design/implementation-plan artifacts; no site build, deployment or live browser action |

Also validate all local href/src/srcset targets and anchor IDs, JS/CSS asset existence,
no Konjac domains/analytics identifiers/App Store links, no secret-like placeholders,
production domain configuration, Worker-first setting, no SPA fallback, no preview
publication, and security-policy parity. Exclude approved external links from the
offline existence scan but require an explicit allowlist of expected origins.
Do not use snapshot-only or mirrored implementation tests as proof of routing.

## Rollout, Review, And Plan Handoff

The later plan should be `impl-plans/active/chilla-product-website.md`, authored by
exactly one plan author after Step 3 independent design review. Reference this
document and the user-QA decision IDs. Require Step 5 independent plan review.
The plan stays ready/pending implementation after this workflow; documentation
completion must not mark deployment/browser tasks complete. Step 9 and final git
steps remain required workflow nodes and must stage only owned design/plan paths,
preserving the Step 1 pre-existing `.riela/` files and `riela-lock.json`.

Plan work units: isolated build/routes; localized product/privacy/assets; Worker and
security metadata; deterministic validator and negative fixtures; prerequisite
resolution and release-link validation; dry run and production deployment; desktop
and mobile browser verification; evidence/runbook and rollback review. TypeScript
work uses the referenced coding agent and a separate check-and-test agent. No Rust
changes are anticipated; any Cargo use requires `CARGO_TERM_QUIET=true`.

Future commands to expose/verify in `pubpage/package.json`:

- `bun install --cwd pubpage --frozen-lockfile`
- `bun run --cwd pubpage typecheck`
- `bun run --cwd pubpage check` (build + validation + tests included)
- `bun run --cwd pubpage deploy:dry-run` (local pinned Wrangler, no production mutation)
- `bun run --cwd pubpage deploy` (check first; secret-dependent invocation through `kinko exec`)

These are required future command contracts, not executed checks in Step 2. The
plan author must specify the exact approved kinko profile/invocation once QA-02 is
resolved, without recording secret values. Verification processes run in the
foreground to terminal exit; save command, exit status and complete log path.
Any local server used for browser/integration tests needs an owned service lifecycle
and explicit shutdown, never shell backgrounding or orphaned processes.

Before future production mutation: resolve QA-01/02; verify release claims; inspect
authenticated account and zone, both hosts, existing DNS/routes/certificates, and
deployment permissions; record previous Worker version plus owned DNS/route state;
review the concrete dry-run output and rollback procedure. Credential values never
enter source, HTML, logs, or commits. Do not overwrite another service's records.
Production operations and final git operations require the workflow's adversarial
review. This design-plan-only run must not perform implementation, deployment, or
live browser checks even if credentials happen to be available.

After future deployment, record deployment/version ID and artifact commit/hash.
Use `curl --fail-with-body -sS -D -` for each canonical HTTPS page and static metadata,
and `curl -sS -I` for redirect/error probes (assert expected status separately).
Explicitly probe `https://www.chilla-viewer.com/ja/privacy/?a=1&a=2&next=%2Ffoo`,
HTTP apex/www, aliases, 404 and unsupported methods; compare exact Location,
security/caching headers and content types, and verify active TLS on both hosts.
Cloudflare zone redirect rules must not introduce loops or lose path/query.

Browser acceptance uses at least Chromium desktop 1440 x 900 and mobile emulation
390 x 844 plus 320px reflow; additionally check WebKit/Safari layout when available.
Visit all four canonical routes; operate language/privacy/home/install/copy links,
keyboard navigation/skip/focus, zoom/reduced motion, no-JS browsing; inspect console,
network and CSP errors and initial transfer. Capture screenshots with URL, viewport,
browser/version, date, and findings. Emulation must be labeled as emulation, not a
physical-device test. HTTP success alone does not satisfy visual acceptance.

Roll back if canonical pages fail, routing loops, assets/CSP break, privacy claims
are wrong, or material accessibility issues remain: restore the recorded previous
Worker deployment and, separately, only DNS/routes changed for this rollout. For a
first deployment without a previous version, restore the saved domain state and
remove only newly owned bindings/deployment. Verify restored behavior and record
the result; DNS/certificate changes and cached 301/HSTS may outlive Worker rollback.

## Open Decisions And Author Check

See [QA-01 through QA-05](../user-qa/qa-product-website.md). Privacy facts and Cloudflare
ownership are production prerequisites, not architectural alternatives left for the
plan author to guess. Copy and direct-download decisions have explicit defaults.
No issue number is fabricated. No independent review approval is claimed here.

Author self-check: all eight intake acceptance signals map to the validation matrix;
routes, header authority, response precedence, asset provenance, deployment lifecycle,
rollback and evidence boundaries are explicit. This author strengthened the reference
by covering Worker-generated error/redirect headers, fixed-origin URL construction,
304/HEAD behavior, negative validator fixtures, and production privacy gates. There
was no Step 3/Step 5 feedback in the incoming runtime variables. Documentation/link
and worktree-preservation checks are recorded in the Step 2 output; implementation
and live checks belong to the future implementation workflow.

## References

See [Chilla product website references](../references/README.md#chilla-product-website)
and the repository [installation/product contract](../../README.md).

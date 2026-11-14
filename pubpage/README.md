# Chilla product page

Static bilingual product and privacy pages for
[`chilla-viewer.com`](https://chilla-viewer.com/), deployed with Cloudflare
Workers Static Assets.

## Local development

```bash
npm install
npm run dev
```

The local server listens on `http://127.0.0.1:5173/` by default.

## Validation and deployment

```bash
npm run check
npm audit --audit-level=high
npm run deploy
```

`npm run check` builds all four localized routes and runs deterministic checks
for output files, metadata, Worker redirects and errors, security headers, asset
budgets, and unresolved content markers.

The Cloudflare project is `chilla-product`. Its production custom domains are
`chilla-viewer.com` and `www.chilla-viewer.com`; the Worker permanently
redirects `www` to the apex hostname. Wrangler authentication remains outside
the repository.

## Asset provenance

### September 9 cat-led redesign

The current page uses a warm cream/sage/peach palette, rounded headings, the
actual Chilla cat, and prominent Yazi-like browsing, keyboard navigation,
lightweight operation, and Git diff sections. English and Japanese share the
same layout. All content remains visible without JavaScript.

Fresh screenshots were taken on September 9, 2026 with Computer Use from the
current `target/debug/chilla` executable (September 9, 12:10 JST build), placed
in a temporary copy of the debug app bundle for unambiguous UI targeting.
No application source was changed or rebuilt for this website task.

| Current asset | Capture/source | Dimensions | SHA-256 |
| --- | --- | --- | --- |
| `public/screenshots/browse-fresh.jpg` | Actual app, repository README, file browser visible, ignored entries hidden; 13:36 JST | 1277×768 | `64f417cd0976944d7d04463acb655c8dee084291ed2b45a00c32979f8bbe1803` |
| `public/screenshots/diff-fresh.jpg` | Actual app, local Git diff, README selected in split comparison; 13:37 JST | 1277×768 | `723a410d745179e10ebc4d370b8577a8b07a76bc485756de1707ba6e9798662a` |
| `public/cat.webp` | Existing `doc/empty-state-cat.png`, WebP conversion | 1024×1536 | `797e20aac4d5dad56921ce6a12268d93ef81e622104891b65fbe8bb4fae73663` |
| `public/og.png` | Exact `src-tauri/icons/icon.png`, square social card | 512×512 | `35f682ce10b3e596e1bebae43e904878281c8e2c783ee04040fb6e090d8d22d8` |

Fresh screenshot WebP derivatives use `cwebp -q 86` and are about 54 and 90 KiB.
The JPEG originals are linked for full-size inspection. Captures are unretouched;
they show actual local app behavior and public repository documentation.
Observed keyboard behavior: `Shift+L` revealed the file browser and `g` opened
local Git diff. Selecting README displayed the actual split comparison.

### Legacy assets retained from the initial page

These older screenshots are no longer used in product-page HTML. Their sources
remain unchanged.

| Website asset | Source | Dimensions | SHA-256 |
| --- | --- | --- | --- |
| `public/screenshots/readme.png` | `doc/captures/readme-capture.png` | 1200×1330 | `0cb83e91878049e0a9167ccdf28d256176fd9f50a1dfa7ef2208d567c0e1f680` |
| `public/screenshots/git-diff.png` | `doc/captures/git-diff-capture.png` | 2912×1818 | `eb51deca7cf10eea8f47fa55352697ddc160c5057357cebfffd8f1a3500b7574` |
| `public/screenshots/movie.png` | `doc/captures/movie-capture.png` | 1200×1333 | `3a4bd1435fabb559a5da035a02507bef24ab3b577ae7f370ff099c56a0547b71` |
| `public/favicon.png` | `src-tauri/icons/icon.png`, resized with `sips` | 64×64 | `6f2101b90666cf80c4eb5bcca0889874df6a90ef5c2acb5b2e814d6a294fa697` |
| `public/apple-touch-icon.png` | `src-tauri/icons/icon.png`, resized with `sips` | 180×180 | `a07da1da78e4383631af36b877531a31cc6b3e76ceaad1f41876cc2857aa5f26` |

Responsive WebP derivatives were produced with `cwebp` at quality 80–82.

The original generated graphite social card was replaced with the real cat app
icon; the page uses a square summary social-card format.

## Redesign verification

- `npm run check` and `npm audit --audit-level=high` pass (zero vulnerabilities).
- Chrome responsive captures inspected at 1280px desktop and 390px mobile;
  the narrow layout was also inspected in Safari. No visible horizontal overflow.
- Mobile menu opens and its Keyboard link reaches `#keyboard`.
- The Japanese production page loads in Chrome over HTTPS.
- Live HTML and fresh screenshot assets return 200; `www` redirects with 301.
- Production Worker version: `0927037d-24b6-4603-ac4f-6939037f22f7`.
- Browser inspection found an automatically injected Cloudflare analytics
  script blocked by CSP. `Cache-Control: no-transform` now prevents that injection;
  live HTML contains only the local application script. See
  [Cloudflare's injection guidance](https://developers.cloudflare.com/web-analytics/faq/).

Browser automation had no connected backend, so visual verification used the
available Computer Use interface and Chrome's responsive-design controls.

The follow-up headline revision explicitly emphasizes terminal-style fast file
browsing. Hero type was reduced from 76px to a 54px desktop maximum and from
39–60px to 28–42px on mobile. The production build and validator passed again.

The installation follow-up adds numbered DMG and Homebrew instructions directly
to both pages, including prerequisites, launch commands, and an expandable
Homebrew upgrade guide. The hero includes a direct GitHub repository button.
The redundant open-source/account-free badges were removed at the user's request.
Deterministic checks cover the steps and repository link; production HTML was
verified after deployment.

Installation now appears immediately after the introduction, before screenshots
and detailed features. A section-order regression check covers both locales.
The performance label reads "Fast and responsive" / "軽快な動作"; related hero
copy and metadata use the same benefit-focused wording.

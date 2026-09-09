# Chilla Product Website

This document defines the public product website for the Chilla desktop app.

## Overview

The website presents Chilla as a focused macOS file and Git viewer, provides a
clear path to the latest release and Homebrew installation, and gives visitors
enough real product evidence to decide whether to install it. It is a separate
static web surface under `pubpage/`, deployed as Cloudflare Worker static assets
at `https://chilla-viewer.com/`.

The structure follows the proven deployment model in the local Konjac product
page while using Chilla-specific content, screenshots, brand colors, and
interaction patterns.

## Audience and Message

The primary audience is developers and technical writers on macOS who want to
inspect a directory, Markdown document, media file, or Git diff without opening
a full IDE. The core message is: "Fast file browsing. Just like your terminal."
The Japanese headline directly promises terminal-like, fast file viewing.
Keep hero typography compact (54px maximum on desktop, 28–42px on mobile),
so the product benefit reads plainly and does not overwhelm the page.
Lead with lightweight operation, keyboard-first navigation, and built-in Git diff
review. Describe speed as a design intent, without invented benchmark numbers.
Use the benefit-led label "Fast and responsive" in English and "軽快な動作"
in Japanese, rather than "Lightweight by design" or the incorrect "light weight".

The first viewport must show the real application, identify the supported
workflows, and expose a direct download action. Claims must stay aligned with
the repository README and shipped application behavior.

## Information Architecture

- English product page at `/`
- Japanese product page at `/ja/`
- English privacy notice at `/privacy/`
- Japanese privacy notice at `/ja/privacy/`
- Stable anchors for product proof, capabilities, and installation
- Links to the latest GitHub release, Homebrew tap, and public source repository

The product page includes:

1. A concise hero with the current Chilla app capture and installation actions.
2. A proof section covering file browsing, Markdown preview, and Git diff review.
3. A compact capability matrix for rich file formats, keyboard navigation, and
   local-first operation.
4. An installation section for Homebrew and direct DMG download.
   Include numbered DMG steps (download the Apple Silicon asset, open it, drag
   to Applications, eject and launch), Homebrew prerequisites and commands,
   and a first-launch command. Keep all steps visible without JavaScript.
5. A footer with language, privacy, release, and repository links.

## Visual Direction

Product screenshots are non-interactive images. Clicking them must not navigate
to image files or open a lightbox; preserve their descriptive alternative text.

Place the full DMG/Homebrew installation guide immediately after the hero and
feature strip, before app screenshots and detailed features. Installation must
not require scrolling through the product tour; retain the `#install` anchor.

The September redesign replaces the graphite/editorial direction completely.
Use warm cream, ink-brown text, soft sage and peach surfaces, rounded system
typography, tactile keyboard keycaps, and the existing cute pixel-art cat.
The hero pairs the cat with a fresh, uncropped application capture. A concise
feature strip immediately identifies Yazi-like browsing, keyboard navigation,
lightweight operation, and Git diffs. Full-width product examples explain browsing
and review; shortcut cards show documented default keys. Avoid decorative fake UI.

Capture the actual running application again, using only public repository
content. Record screenshot provenance and observed behavior. Do not represent
existing screenshots as new. Use responsive images without hiding product UI.
Content must remain visible without JavaScript and with reduced-motion enabled.

## Deployment Architecture

`pubpage/` is an independent Vite project with its own lockfile. A minimal
Cloudflare Worker handles canonical-host redirects and delegates all other
requests to the static-asset binding. Wrangler configuration attaches
`chilla-viewer.com` and `www.chilla-viewer.com`, with the `www` host redirected
permanently to the apex domain.

The build copies security headers, crawl metadata, localized HTML, screenshots,
icons, and Open Graph artwork into `dist/`. A deterministic validator checks
required output, canonical and alternate links, product copy, security headers,
Worker redirects, and absence of unresolved placeholder markers before deploy.

## Privacy and Security

The website collects no app document content and includes no advertising or
third-party analytics. Cloudflare may process ordinary delivery and security
metadata under its privacy policy. The Chilla desktop app performs file viewing
locally; opening GitHub diff URLs sends the requested URL to GitHub through the
existing application integration.

The deployment sets HSTS, content-type protection, clickjacking protection,
strict referrer policy, a restrictive permissions policy, and a self-only
Content Security Policy.

## Verification

Completion requires:

- dependency installation from the website lockfile
- a successful Vite production build and deterministic validation
- a successful Wrangler deployment with both custom-domain routes attached
- HTTP checks for the apex page, localized page, privacy page, assets, headers,
  and `www` redirect
- browser inspection of the live desktop and mobile layouts, navigation,
  language switching, install links, and absence of horizontal overflow

## References

See `design-docs/references/README.md` for repository reference material. The
local Konjac product page at `../konjac/pubpage/` is the implementation and
Cloudflare deployment reference for this design.

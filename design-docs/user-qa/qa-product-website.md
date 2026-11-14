# Chilla Product Website Decisions

Status: pending owner facts for future production; planning may proceed.
Workflow: `design-plan-only`; issue: **Create and deploy the Chilla product page**,
`tacogips/chilla`, no supplied issue number/URL.
Design: [Public product website](../specs/design-product-website.md).

| ID | Decision/facts needed | Design default | Gate and owner |
|----|-----------------------|----------------|----------------|
| QA-01 | Who operates the site, what verified privacy contact is published, what Cloudflare request/log data is processed and retained, and what desktop network/storage disclosures apply? | No website analytics, forms, cookies or storage; distinguish hosting from app behavior; audit GitHub/remote-resource behavior before broad privacy claims. No guessed identity, address, retention period or zero-collection promise. | Product owner confirms operator/contact; hosting owner confirms processing/settings; implementer audits source. Production privacy publication is blocked until resolved in both languages. Local drafts allowed; unresolved placeholders must fail release checks. |
| QA-02 | Which Cloudflare account/zone owns both hosts; what existing DNS/routes/certificates and deployment permissions exist; which kinko credential profile should be used? | Worker `chilla-product`, exact Custom Domains `chilla-viewer.com` and `www.chilla-viewer.com`, production preview hosts disabled; preserve unrelated records. | Hosting owner identifies authorized environment/profile; implementer verifies actual state and records rollback baseline before production. No secret values in this document. |
| QA-03 | Is a stable direct DMG asset URL required instead of the latest release landing page? | Use `https://github.com/tacogips/chilla/releases/latest` with Apple Silicon instructions and `chilla_<version>_aarch64.dmg`; do not invent a stable asset alias. | Nonblocking with this default. Before production, implementer confirms current README/release assets and signed/notarized evidence; a changed distribution contract requires revising site copy. |
| QA-04 | Any required brand copy changes or terms pages? | Screenshot-led light design, concise English/Japanese file/Git viewer copy; privacy pages included, terms excluded, no dead terms links. | Nonblocking design default. Owner confirms factual/privacy text under QA-01; new legal/analytics scope requires design and plan update. |
| QA-05 | Is there an existing GitHub issue number/URL to associate? | Retain workflow-input title/body and repository `tacogips/chilla`; issue number and URL remain null. | Nonblocking; workflow owner may add a real reference later. |

Resolved answers must include decision/date and the corresponding design/plan
updates. Missing deployment credentials do not justify dropping production/browser
tasks from the eventual implementation plan. This current workflow creates only
design and implementation-plan artifacts and must not resolve environment questions
by deploying or operating a live browser.

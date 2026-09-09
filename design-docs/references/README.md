# Design References

This directory contains reference materials for system design and implementation.

## External References

| Name | URL | Description |
|------|-----|-------------|
| ign-template tauri-v1 | https://github.com/tacogips/ign-template/tree/cd4284b7c942f3b1bc38b81212525830e6c99bb8/tauri-v1 | Verified upstream mise-native tool/task baseline |
| Tauri Prerequisites | https://v2.tauri.app/start/prerequisites/ | Native OS dependencies outside mise |
| mise Continuous Integration | https://mise.jdx.dev/continuous-integration.html | mise-action and CI task execution |
| GitHub Pull Request REST API | https://docs.github.com/en/rest/pulls/pulls | Canonical PR URLs, diff_url/patch_url forms, and changed-file responses |
| Yazi Quick Start | https://yazi-rs.github.io/docs/quick-start/ | Browser navigation, comma-prefixed sorting, filter and recursive search key bindings |
| Yazi Keymap Configuration | https://yazi-rs.github.io/docs/configuration/keymap/ | Contexts, prepend/append/replacement precedence, key notation, sequences and descriptions |
| The Rust Book | https://doc.rust-lang.org/book/ | Official Rust programming language book |
| Rust API Guidelines | https://rust-lang.github.io/api-guidelines/ | Rust API design best practices |
| Rust Design Patterns | https://rust-unofficial.github.io/patterns/ | Common Rust design patterns |
| Tauri Documentation | https://tauri.app/ | Official Tauri framework documentation |
| Tauri WebDriver Tests | https://v2.tauri.app/develop/tests/webdriver/ | Official Tauri WebDriver and `tauri-driver` guide |
| Tauri WebDriver CI | https://v2.tauri.app/develop/tests/webdriver/ci/ | Official CI guidance for WebDriver-based Tauri tests |
| Tauri Discussion 3768 | https://github.com/orgs/tauri-apps/discussions/3768 | Community discussion about integrating `tauri-driver` |
| Foliate | https://github.com/johnfactotum/foliate | Desktop EPUB reader used as the UX reference for reader navigation behavior |
| Foliate JS | https://github.com/johnfactotum/foliate-js | EPUB renderer reference for TOC trees, href resolution, and anchor-based pagination state |
| SolidJS Documentation | https://docs.solidjs.com/ | Official Solid.js framework documentation |
| Mermaid Documentation | https://mermaid.js.org/ | Official Mermaid syntax and rendering documentation |
| Bun Documentation | https://bun.sh/docs | Official Bun runtime and package manager documentation |
| GitHub REST API commits | https://docs.github.com/rest/commits/commits | Official GitHub REST API reference for commit and compare retrieval |
| GitHub REST API pulls | https://docs.github.com/rest/pulls/pulls | Official GitHub REST API reference for pull request metadata and changed files |
| Task Documentation | https://taskfile.dev/ | Official go-task documentation |
| Homebrew Acceptable Casks | https://docs.brew.sh/Acceptable-Casks | Official eligibility, notability, and rejection policy for cask submissions |
| Adding Software to Homebrew | https://docs.brew.sh/Adding-Software-to-Homebrew#casks | Official cask authoring, validation, and submission workflow |
| Homebrew Cask Cookbook | https://docs.brew.sh/Cask-Cookbook | Official cask stanza order and DSL reference |
| Tauri App Store distribution | https://v2.tauri.app/distribute/app-store/ | Official macOS App Store bundle, sandbox, provisioning, package, and upload guidance |
| App Store Connect app records | https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app | Required app-record fields and role prerequisites |
| App Store Connect build uploads | https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds | Supported upload tools and build-processing lifecycle |
| App Store Connect submissions | https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app | Version selection, review submission, and release workflow |
| App Store screenshot specifications | https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/ | Required macOS screenshot counts, aspect ratio, and dimensions |
| Konjac App Store release skill | sibling Konjac checkout: `../konjac/.agents/skills/konjac-app-store-release/SKILL.md` | Local evidence-driven reference for owner decisions, readiness gates, upload evidence, and submission boundaries |
| qraftbox DiffView.svelte | sibling qraftbox checkout: `client-legacy/components/DiffView.svelte` | Local behavioral reference for PR diff mode controls, file diff rendering, and navigation buttons |
| qraftbox diff types | sibling qraftbox checkout: `client-legacy/src/types/diff.ts` | Local reference for diff file, hunk/chunk, change-line, and view-mode shape |
| qraftbox GitHub PR service | sibling qraftbox checkout: `src/server/github/pr-service.ts` | Local reference for GitHub PR metadata service boundaries |
| qraftbox GitHub URL parser | sibling qraftbox checkout: `src/server/github/url-parser.ts` | Local reference for GitHub URL source parsing boundaries |
| qraftbox diff routes | sibling qraftbox checkout: `src/server/routes/diff.ts` | Local reference for diff retrieval request/response shape |
| qraftbox side-by-side diff image | sibling qraftbox checkout: `usage/resource/diff_side_by_side.png` | Visual reference for side-by-side diff mode |
| qraftbox current diff image | sibling qraftbox checkout: `usage/resource/diff_current.png` | Visual reference for current-state diff mode |
| qraftbox stack diff image | sibling qraftbox checkout: `usage/resource/diff_stack.png` | Visual reference for stack/inline diff mode |
| Konjac product page | sibling Konjac checkout: `../konjac/pubpage/` | Local reference for bilingual Vite pages, deterministic validation, responsive product captures, and Cloudflare Worker Static Assets deployment |

## Reference Documents

Reference documents should be organized by topic:

```
references/
├── README.md              # This index file
├── rust/                  # Rust patterns and practices
└── <topic>/               # Other topic-specific references
```

## Adding References

When adding new reference materials:

1. Create a topic directory if it does not exist
2. Add reference documents with clear naming
3. Update this README.md with the reference entry

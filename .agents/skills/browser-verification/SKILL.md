---
name: browser-verification
description: Use when the user wants UI verification in a normal browser, asks to reproduce or inspect frontend behavior without relying on the full Tauri desktop runtime, or asks to make a Tauri-facing feature testable from Vite/browser dev mode in this SolidJS + Tauri repository.
allowed-tools: Read, Grep, Glob, Bash
---

# Browser Verification

Use this skill when the task is to verify frontend behavior in a normal browser for this repository.

This project is a SolidJS + Bun + Tauri app. Browser-only verification is valid for frontend state,
rendering, keyboard behavior, sorting, and mocked file-view flows. Browser-only verification is
not enough for real Tauri `invoke`, filesystem access, startup path resolution, or desktop window
behavior.

## Decision Rule

Choose one mode before changing code:

1. **Browser mock mode**
   Use when the user wants quick UI verification or reproduction in a normal browser.
   Mock Tauri-facing boundaries and verify the SolidJS UI against deterministic fixture data.

2. **Real Tauri mode**
   Use when the behavior depends on Rust command execution, filesystem data, startup arguments,
   document watching, or real window APIs.
   Run `bunx tauri dev` and do not claim browser-only verification covers the desktop path.

3. **Split verification**
   Use browser mock mode for the UI and separate Bun/Cargo checks for the boundary.
   This is the default for mixed-stack feature work.

## Repo-Specific Boundaries

- Browser dev server: `bun run dev`
- Tauri config: `src-tauri/tauri.conf.json`
- Tauri wrapper seam: `src/lib/tauri/document.ts`
- Theme sync seam: `src/lib/theme.ts`
- Main startup/load state: `src/features/workspace/WorkspaceShell.tsx`
- File tree rendering: `src/features/file-view/FileBrowserPane.tsx`
- Browser test config: `vitest.browser.config.ts`
- Browser tests: `tests/browser/**/*.browser.tsx`
- Browser mock unit tests: `src/lib/tauri/document.test.ts`

## Preferred Mock Strategy

Mock at the wrapper layer, not in leaf components.

Preferred seams in this repo:
- `src/lib/tauri/document.ts` for `getStartupContext`, `listDirectory`, `openFilePreview`,
  `openDocument`, `reloadDocument`, and document events
- `src/lib/theme.ts` for backend theme sync effects
- `@tauri-apps/api/window` only when the wrapper seam is insufficient

Do not put test-only branching directly inside `WorkspaceShell.tsx` or `FileBrowserPane.tsx` when
the wrapper layer can absorb the difference.

## Browser Activation Rules

Preferred activation order:

1. Query flag: `?browser_mock=1`
2. Automatic browser fallback when Tauri internals are absent
3. Test-only module usage from browser tests

Keep the mock path deterministic and visible. A browser run should clearly be in mock mode, not
silently pretending to be the desktop runtime.

## File-Tree Workflow

For the file-tree flow, the minimum useful fixture set is:

- startup context
- first directory page
- follow-up directory page for lazy loading
- one file preview payload

The current browser mock in `src/lib/tauri/document.ts` should model the same contract as the
Rust command:

- input: `path`, `sort`, `offset`, `limit`
- output: `DirectoryPage`
- server-side sort semantics
- stateless paging

When testing paging, keep at least one fixture with more than 200 entries so lazy loading is
actually exercised.

## Verification Workflow

Use this order unless the task clearly requires something else:

1. Add or update wrapper-layer mock data.
2. Verify browser rendering manually with `bun run dev` and `?browser_mock=1`.
3. Add or update automated browser coverage in `tests/browser/`.
4. Add or update fast unit coverage for the wrapper mock or related helpers.
5. Run Bun verification for the frontend path.
6. If the feature crosses the Tauri boundary, run Rust checks separately.

## Browser Test Tooling

Use Vitest Browser Mode for real browser rendering checks.

Preferred setup in this repo:
- `vitest` for the test runner
- `@vitest/browser-preview` when Playwright-managed browsers are not viable in the environment
- `@vitest/browser-playwright` when Playwright browsers run correctly
- `playwright` and `playwright-cli` only as provider/runtime dependencies, not as proof that
  desktop Tauri behavior works

On Nix-like environments, Playwright-downloaded Chromium may fail to launch. If that happens,
prefer a preview-based provider or another browser mode that reuses the local browser instead of
blocking on Playwright.

## Triage Rules

When a bug says `Loading directory...`, inspect this chain first:

`getStartupContext` -> `listDirectory` -> `setDirectoryState`

Then check:

- whether the browser mock is enabled
- whether `WorkspaceShell.tsx` touches window APIs outside a guarded browser-safe path
- whether the first `DirectoryPage` contains entries and a matching `current_directory_path`
- whether the selected file path is reachable from the loaded pages

If the issue reproduces only in `bunx tauri dev`, stop using browser mode as the primary verifier
and switch to split verification or real Tauri mode.

## Rules

- Do not claim browser verification proves Tauri IPC correctness.
- Keep fixture data deterministic.
- Prefer 3-10 entries for ordinary flows; use larger fixtures only when paging is the behavior
  under test.
- Keep mocks contract-accurate with the Rust side.
- When browser tests fail because of provider startup, treat that as tooling failure first, not
  immediate evidence of an app bug.

## Expected Output

When using this skill, report:

- which mode was used: browser mock, real Tauri, or split
- which boundaries were mocked or left real
- what behavior was verified in the browser
- what still requires desktop-runtime verification

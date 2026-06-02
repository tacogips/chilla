---
name: macos-computer-use-verify
description: "Use when Codex should validate chilla macOS desktop behavior, Tauri app launches, visible UI flows, or browser/app interactions after implementation or bug fixes, and Computer Use tools may be available."
allowed-tools: Read, Grep, Bash
---

# macOS Computer Use Verification

## Purpose

Validate chilla behavior through the visible macOS UI when possible. Use this after changes that affect desktop app startup, PR diff rendering, file browsing, navigation, dialogs, or other runtime behavior that cannot be fully proven by build and unit tests.

## Decision Rule

Use Computer Use verification when all of these are true:

- The task affects UI, app launch, visible runtime behavior, or browser/app interaction.
- The environment appears to be macOS, or the user explicitly asks for macOS verification.
- Computer Use tools are available in the current tool list.

If Computer Use tools are unavailable, do not pretend UI verification happened. Run the strongest available non-UI checks and report that visible macOS verification was skipped because Computer Use was unavailable.

## Build And Launch

Prefer the Tauri debug app for fast local verification:

```bash
bun run tauri build --debug --bundles app
open -n /absolute/path/to/repo/target/debug/bundle/macos/chilla.app --args <args>
```

Use the exact app bundle path with Computer Use:

```text
/absolute/path/to/repo/target/debug/bundle/macos/chilla.app
```

Use `nix build` only when the user explicitly asks to validate the Nix package output; it is slower and may omit untracked Git files unless built from a path source.

## Workflow

1. Complete implementation and automated checks first when practical.
2. Build the Tauri debug app bundle when runtime code changed.
3. Launch the app with the user's repro arguments.
4. Call `mcp__computer_use.get_app_state` once before interacting with the app in each assistant turn.
5. Inspect both the screenshot and accessibility tree.
6. Use Computer Use actions to exercise the relevant user flow:
   - `click` for buttons, tabs, list items, menus, and controls.
   - `type_text` or `set_value` for text fields.
   - `press_key` for shortcuts and keyboard navigation.
   - `scroll` for overflow content.
7. Verify the visible result that matters for the user request.
8. Stop any launched test process unless the user asked to leave it running.

## Verification Standard

A visible verification is credible only when Codex has observed the relevant UI state through Computer Use after the action.

For the PR diff viewer, verify:

- The PR header appears with owner, repo, PR number, title, status, and GitHub jump button.
- The left pane shows changed files in current-directory style.
- The diff mode controls can switch between left/right, full file, and stack.
- Syntax highlighting is visibly present for representative file extensions.

Do not claim behavior was verified only because a process stayed alive, a build passed, or a log was empty.

## Reporting

Use concise reporting:

- `Visible verification:` what was observed through Computer Use.
- `Automated checks:` commands that passed.
- `Skipped/limited:` any Computer Use limitation, inaccessible app, or unverified flow.

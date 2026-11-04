# Workspace Picker Supersession Implementation Plan

**Status**: Completed
**Design Reference**: `design-docs/specs/design-macos-file-open.md#interactive-picker-supersession`, `#delivery-and-lifecycle`
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

## Dispatch metadata

```json
{
  "planId": "workspace-picker-supersession",
  "planPath": "impl-plans/active/workspace-picker-supersession.md",
  "dependsOn": [],
  "writePaths": [
    "src/features/workspace/WorkspaceShell.tsx",
    "src/features/workspace/WorkspaceShell.vitest.tsx",
    "impl-plans/active/workspace-picker-supersession.md"
  ],
  "sharedPaths": [],
  "workflowMode": "issue-resolution",
  "progressPath": "impl-plans/active/workspace-picker-supersession.md"
}
```

## Intent and context

Commit `440d902` (release 0.3.6) routed the in-app picker (`handleOpenFiles`,
`src/features/workspace/WorkspaceShell.tsx` about line 1010, bound to
`files.open` / `Cmd+O`) through `queueFileOpenWork` (about line 984). That is a
strict serial promise queue built for native LaunchServices drains. A newer
picker selection now waits behind an older single-file pick whose
parent-directory `listDirectory` promise is still pending, so the newer
workspace never opens. The DOM test
`WorkspaceShell numeric view shortcuts > ignores a stale parent directory rejection after a newer picker workspace opens`
(`WorkspaceShell.vitest.tsx` about line 2727) fails on both the baseline and
the current tree for this reason. The user explicitly authorizes modifying
`WorkspaceShell.tsx`.

The design specifies latest-wins for picker opens, using only the existing
`directoryRequestId` ownership token in `openSelectedFiles` (about line 874).
Native drains stay serialized.

## Non-goals

- Do not add a new counter, AbortController, second queue, or generic
  "open coordinator" abstraction.
- Do not change `drainNativeOpenRequests`, `queueFileOpenWork`'s body,
  `openSelectedFiles`, `loadDirectoryState`, `loadExplicitFileSetState`, the
  Rust side, or `src/lib/tauri/document.ts`.
- Do not edit, skip, loosen, or retry-wrap the stale-picker test or any other
  existing test. Do not raise `waitFor` timeouts.
- Do not touch PDF/preview files, `README.md`, `.riela/`, or `riela-lock.json`.
- No git operations.

## File-level changes

### `src/features/workspace/WorkspaceShell.tsx`

- `handleOpenFiles` only. After `open(...)` resolves with a non-null
  selection and `!isWorkspaceDisposed`:
  1. `await workspaceInitialized` (the same barrier `queueFileOpenWork` awaits);
  2. return if `isWorkspaceDisposed` again;
  3. `await openSelectedFiles(selection)` directly, with no `queueFileOpenWork`.
- Keep the existing outer `try/catch` and its message
  `"Failed to open the selected files"`. A cancelled dialog (`null`) does
  nothing, as it does today.
- After the edit, `drainNativeOpenRequests` must be the only caller of
  `queueFileOpenWork`.
- Pattern to imitate: `queueFileOpenWork` (about line 984) for the
  barrier-then-disposal-check order.

### `src/features/workspace/WorkspaceShell.vitest.tsx`

Add two regression tests inside the existing
`describe("WorkspaceShell numeric view shortcuts", ...)` block, next to the
stale-picker test. Reuse its mock style: `documentMocks`, `dialogMocks.open`,
`modeButton("Open one or more files")`, `directoryPage`, `textPreview`,
`directoryStartupContext`. The `beforeEach` already resets
`documentMocks.takeNativeOpenRequests` and gives it `mockResolvedValue([])`.

## Pitfalls

- Do not remove `queueFileOpenWork` or its `.catch`. Native drains still need
  it, and its error message (`"Failed to open native files"`) is for native
  opens only.
- Do not drop the `workspaceInitialized` await. A picker open during startup
  must not race `handleInitialLoad`.
- Do not "fix" supersession inside `openSelectedFiles`. Its ownership checks
  are already correct once the picker is not queued.
- The stale open's later rejection is caught inside `openSelectedFiles`. Do
  not add a new `.catch` that would show a notification for it.

## Test cases to add

- Native batches open in order. `takeNativeOpenRequests` first returns
  `[["/workspace/a.txt"], ["/workspace/b.txt"]]` for the initial drain, then
  `[]`. Each path's `listDirectory` and `openFilePreview` resolve. Expected:
  `openFilePreview` is called for `a.txt` before `b.txt`, and the final visible
  preview is `b.txt`.
- The picker waits for initialization. Hold `getStartupContext` on a deferred
  promise, click "Open one or more files" with `dialogMocks.open` resolving to
  a path, and flush microtasks. Expected: there is no `listExplicitFileSet` or
  `openFilePreview` call for the picked path while startup is pending. After
  the deferred resolves, the picked file opens.
  - If clicking the button is impossible before mount completes, dispatch
    `Cmd+O` the same way existing tests do. If neither can reach
    `handleOpenFiles` during startup, record that in the progress log and
    write only the first test. Do not change production code to make it
    testable.
- The existing stale-picker test passes unmodified. That is the primary gate.

## Invariants

- `drainNativeOpenRequests` keeps strict batch order. Each batch still awaits
  `workspaceInitialized`.
- A superseded open does not:
  - run the Powerbox fallback;
  - open a preview;
  - show a notification;
  - clear `loading`.
  It also produces no unhandled rejection.
- All non-picker behavior of `WorkspaceShell.tsx` is byte-identical outside
  `handleOpenFiles`.

## Verification (scoped to this plan)

Run each command in the foreground from the repository root. Tee its full
output to a log under
`tmp/pdf-inline-rendering-20261104-02/workspace-picker-supersession/`. Record
each command's exit status and log path in the progress log.

1. `mise exec -- env PATH="$(mise where node)/bin:$PATH" node --version`
   -> `v22.23.4`.
2. `mise exec -- env PATH="$(mise where node)/bin:$PATH" bunx vitest run --config vitest.config.ts src/features/workspace/WorkspaceShell.vitest.tsx`
   -> exit 0 with 0 failures. The log must show the stale-picker test and the
   two new tests as passed.
3. Repeat command 2 two more times -> exit 0 each time. This rules out a
   timing flake.
4. `bun run typecheck` -> exit 0.
5. `bunx biome check src/features/workspace/WorkspaceShell.tsx src/features/workspace/WorkspaceShell.vitest.tsx --diagnostic-level=warn`
   -> exit 0.
6. `grep -c "queueFileOpenWork(" src/features/workspace/WorkspaceShell.tsx`
   -> `1`, which is the `drainNativeOpenRequests` call. The definition,
   `const queueFileOpenWork = (`, does not match this pattern. On the
   unfixed tree the count is 2 (lines 1002 and 1018).
   Also run `grep -n "queueFileOpenWork" src/features/workspace/WorkspaceShell.tsx`.
   It must print only the definition (about line 984) and the drain call
   (about line 1002), with no match inside `handleOpenFiles`.
7. `git diff -U0 99954ab -- src/features/workspace/WorkspaceShell.tsx`
   -> hunks only inside `handleOpenFiles`.

Under AGENTS.md, invoke the `ts-coding` agent for the edits and
`check-and-test-after-modify` afterwards.

## Done criteria

- [x] `handleOpenFiles` no longer calls `queueFileOpenWork`. It awaits
  `workspaceInitialized` and checks disposal first.
- [x] The stale-picker test passes unmodified in 3/3 runs.
- [x] The two new regression tests pass, or the second one is explicitly
  logged as not reachable.
- [x] Verification steps 1-7 produce the stated results, with complete logs.
- [x] The progress log is updated with pre- and post-edit `shasum -a 256` for
  each owned file.

## Concurrency and drift rules

- This plan runs in wave 1, in parallel with the re-verification of
  `pdf-zoom-wheel-contract` and `pdf-pdfjs-foundation`. Their write paths are
  disjoint from this plan's.
- `WorkspaceShell.vitest.tsx` is also in `pdf-shortcuts-finalize`'s write
  paths. That plan runs later (it depends on this one), so the two never edit
  it at the same time.
- Before each edit, read the file fresh and record its hash. If the hash
  differs from the last recorded value, stop and log drift. No git
  operations.

## Progress Log

### Session: 2026-11-04
**Tasks Completed**: Plan created (session 710).
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Wave 1. `pdf-shortcuts-finalize` depends on this plan.

### Session: 2026-11-04 — implementation
**Tasks Completed**: Picker supersession, native batch ordering and initialization barrier regressions. Existing stale-picker test remains unchanged.
**Verification**: Node v22.23.4; three scoped Vitest runs each passed 64 tests; verbose run confirms all three named regressions; typecheck and scoped Biome passed; queue count is 1 and diff against 99954ab is limited to handleOpenFiles. Complete logs and exits are in `tmp/pdf-inline-rendering-20261104-02/workspace-picker-supersession/`. All commands exited 0.
**Hashes**: Pre-edit hashes for all three owned files are in `pre-hashes.log`; source post-edit and plan pre-update hashes are in `before-plan-update-hashes.log`; final hashes for all files are in `post-hashes.log` in that evidence directory (the plan cannot embed its own final hash without changing it).
**Downstream**: Formal reviews and plan archiving remain workflow-owned.
**Blockers**: None.

### Session: 2026-11-04 — preview pan and zoom finalization

PART A review found no material defect. The earlier Alt+wheel behavior is superseded by the preview pan and zoom plans. Runtime evidence: `tmp/pdf-inline-rendering-20261104-02/pdf-shortcuts-finalize/runtime-observed/RUNTIME-EVIDENCE.md`. Current gate evidence is recorded under `tmp/preview-pan-zoom/preview-pan-zoom-finalize/`; see the finalize plan for outcomes and any outstanding checks. Formal integration review and archiving remain downstream.

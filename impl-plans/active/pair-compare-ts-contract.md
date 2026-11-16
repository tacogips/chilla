# Pair Compare: TypeScript Startup Contract

**Status**: Ready
**Plan ID**: pair-compare-ts-contract
**Wave**: 1 (dependsOn: none)
**Design Reference**: design-docs/specs/design-pair-view.md (Startup Payload Contract, Validation/TypeScript)
**Created**: 2026-11-16
**Last Updated**: 2026-11-16

---

## Intent And Context

The Rust `file_pair` startup payload changes to carry an ordered, non-empty
`pairs` list (see `pair-compare-rust`, which runs in parallel). The rejected
`sourceOrder` option on `listExplicitFileSet` must be removed. This plan
changes only `src/lib/tauri/`.

## Pinned Contract

- Export from `src/lib/tauri/document.ts`:
  `export interface FilePairPaths { readonly left_file_path: string; readonly right_file_path: string }`
- `BrowserRoot` `file_pair` variant:
  `{ readonly kind: "file_pair"; readonly pairs: readonly FilePairPaths[] }`.
  The top-level `left_file_path` / `right_file_path` are removed.
- `listExplicitFileSet(paths, sort, query, offset, limit)` returns to its
  `9aa3772` signature. The `options` parameter is removed and no
  `sourceOrder` key is ever sent.

The pair-view and workspace plans import `FilePairPaths` as a type. Keep the
name exact.

## Non-Goals

- No edits outside `src/lib/tauri/`. Do not touch `WorkspaceShell.tsx` or
  `WorkspaceFeedback.vitest.tsx`; `pair-compare-workspace` owns them in
  wave 2.
- No change to the `explicit_file_set`, `directory`, or diff variants or to
  their normalizer branches.

## File-Level Changes

Baseline: compare each file with `git show 9aa3772:<path>` (read-only; no
mutating git commands).

### `src/lib/tauri/document.ts`

- Add `FilePairPaths` and change the `file_pair` union member (around line
  130).
- `normalizeStartupContextPayload`, file_pair branch (around lines 840-875):
  - Read `pairs` from `browserRootRaw` (the property key is just `pairs`).
  - Require an array with length >= 1.
  - For each element, require an object and read
    `left_file_path` / `leftFilePath` and `right_file_path` / `rightFilePath`
    with the existing `readStringProperty`-style helpers (around line 367).
    The helpers take snake and camel keys, so imitate the existing calls in
    this branch.
  - Throw `Error("Startup file-pair payload is missing required paths")` when
    `pairs` is missing, not an array, or empty, or when any element is not an
    object or lacks either path.
  - Return `{ kind: "file_pair", pairs }` with freshly built plain objects
    (snake_case keys).
- `listExplicitFileSet` (around line 1358): remove the `options` parameter
  and the conditional `sourceOrder` spread. The invoke payload equals the
  `9aa3772` payload.

### `src/lib/tauri/document.vitest.ts`

- Replace the source-order pair tests with these cases:
  - `{kind:"file_pair", pairs:[{left_file_path:"/a", right_file_path:"/b"}]}`
    -> normalized `pairs` equals the same single pair.
  - camelCase `pairs:[{leftFilePath, rightFilePath}, {...}]` -> two pairs in
    order, with snake_case keys.
  - `pairs` missing, `pairs: []`, `pairs: "x"`, `pairs:[{left_file_path:"/a"}]`,
    and `pairs:[null]` -> each throws.
  - The legacy shape `{kind:"file_pair", left_file_path, right_file_path}`
    with no `pairs` -> throws.

### `src/lib/tauri/document-invoke.vitest.ts`

- Restore to the `9aa3772` content.
- Then add one test in the `listExplicitFileSet` describe (create the
  describe block if `9aa3772` lacks it): the invoke args object has no
  `sourceOrder` key.

## Invariants

- Every other normalizer branch keeps its behavior. Existing tests for those
  branches must still pass unchanged.

## Pitfalls

- Do not keep `left_file_path` / `right_file_path` "for compatibility". The
  design removes them.
- Do not mutate input objects.
- Running `bun run typecheck` during wave 1 may fail in `WorkspaceShell.tsx`,
  which still uses the old fields. That is expected and is fixed by
  `pair-compare-workspace`. Do not edit those files. The typecheck gate for
  this plan is limited to the owned files: there must be no TypeScript
  errors reported in `src/lib/tauri/*` paths.

## Verification

- `bunx vitest run --config vitest.config.ts src/lib/tauri/document.vitest.ts src/lib/tauri/document-invoke.vitest.ts`
  -> exit 0, all tests pass.
- `bunx tsc --noEmit 2>&1 | grep "src/lib/tauri/"` -> no output (errors in
  other files are allowed in wave 1).
- `bunx biome check src/lib/tauri` -> exit 0.

## Concurrency And Drift Rules

- Re-read each file before editing it. Record sha256 before and after the
  edit in the progress log.
- Do not edit files outside writePaths. Report drift instead.

## Completion Criteria

- [ ] `FilePairPaths` exported; `file_pair` variant uses `pairs`
- [ ] Normalizer accepts snake and camel case and rejects malformed input
- [ ] `listExplicitFileSet` has the `9aa3772` signature
- [ ] Owned vitest files pass; biome passes; no tsc errors in owned files

## Progress Log

### Session: 2026-11-16
**Tasks Completed**: Plan created
**Notes**: Supersedes pair-multi-ts-contract.

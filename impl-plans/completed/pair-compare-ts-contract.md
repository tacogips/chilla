# Pair Compare: TypeScript Startup Contract

**Status**: Completed
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

- [x] `FilePairPaths` exported; `file_pair` variant uses `pairs`
- [x] Normalizer accepts snake and camel case and rejects malformed input
- [x] `listExplicitFileSet` has the `9aa3772` signature
- [x] Owned vitest files pass; biome passes; no tsc errors in owned files

## Progress Log

### Session: 2026-11-16
**Tasks Completed**: Plan created
**Notes**: Supersedes pair-multi-ts-contract.


### Session: 2026-11-16 — implementation
**Tasks Completed**: Ordered pair contract, validation, explicit file-set invoke restoration and focused tests.
**Verification**: Vitest 45 passed; biome passed; tsc reported no `src/lib/tauri/` diagnostics (other workspace diagnostics remain downstream). Logs are under `tmp/pair-compare-20261116-01/pair-compare-ts-contract/attempt-1/`. Formal review and workflow finalization remain downstream.
**SHA-256 before → after**:
- `src/lib/tauri/document.ts`: `3512ea83cb15b895477b899884de9bed82409cafb66c45fb10122a3876b216a5` → `dc921af434ef3568eb21be449bf0da107587ee1950d012db250bbabb9a5a1f2d`
- `src/lib/tauri/document.vitest.ts`: `0b24a8d0c290920a158727dc7b376d18cb181928588efb64f4ebde4e8c524da8` → `e73d29dbfce8b81de03c070c89004ac7418ab619ba1a81c022ab0c54904d6a23`
- `src/lib/tauri/document-invoke.vitest.ts`: `7d8b502cdf3a9d6b5cad5430a8e861606c95410dd91fef6676694f3a1915c5f9` → `80c6e5a77f8bac9f4354dc0fb7b04f1dd2e8da4e76ee20587cedceab9fc9a432`
- This plan before: `6d74ca1e317da071ee71704d2c42f2b1bb46a98ed2701f7a3ea4995d069724b9`; its after hash is recorded in `attempt-1/plan-after.sha256` to avoid a self-referential digest.

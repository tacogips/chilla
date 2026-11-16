# Pair View Multi-File: TypeScript Startup And Listing Contract

**Status**: Ready
**Plan ID**: pair-multi-ts-contract
**Wave**: 1 (no dependencies)
**Design Reference**: design-docs/specs/design-pair-view.md (Startup Payload Contract, Source-Order Listing Contract, Validation/TypeScript)
**Created**: 2026-11-16
**Last Updated**: 2026-11-16

---

## Intent And Context

This plan is the TypeScript half of the Rust contract in `pair-multi-rust`
(see that plan's "Pinned Contract").

1. The `file_pair` startup payload now carries `source_order_paths`: all
   unique CLI files in order, at least two, with the first two equal to
   left/right.
2. `listExplicitFileSet` can ask Rust to keep source order via the invoke key
   `sourceOrder`.

Consumers (`WorkspaceShell`) are updated later by `pair-multi-workspace`.

## Pinned Contract (consumed by pair-multi-workspace)

In `src/lib/tauri/document.ts`:

- `BrowserRoot` `file_pair` variant:
  `{ kind: "file_pair"; left_file_path: string; right_file_path: string; source_order_paths: readonly string[] }`.
- `listExplicitFileSet(paths, sort, query, offset, limit, options?: { readonly sourceOrder?: boolean }): Promise<ExplicitFileSetPage>`.
  - The invoke args object includes `sourceOrder: true` only when
    `options?.sourceOrder === true`.
  - Otherwise the args object has no `sourceOrder` key, so existing call
    sites produce identical payloads.

## Non-Goals

- Do not edit `WorkspaceShell.tsx` or its tests. Typecheck errors inside
  `src/features/workspace/` caused by the new required field are expected
  until `pair-multi-workspace` lands. Do not "fix" them here.
- Do not remove the `explicit_file_set` normalizer branch or union variant.
  The macOS open-files and picker paths still use them.
- No Rust edits.

## File-Level Changes

### `src/lib/tauri/document.ts`
- Add `source_order_paths` to the `file_pair` `BrowserRoot` variant (about
  line 130).
- Normalizer `file_pair` branch (about lines 838-860):
  - Read the list via the snake/camel pair `source_order_paths` /
    `sourceOrderPaths`. Imitate how the `explicit_file_set` branch (about
    line 863 onward) reads `source_order_paths`; reuse its array-of-strings
    reading helper if one exists.
  - Throw (same `Error` style as the existing "missing required paths"
    message) when the list is missing, not an array of strings, has length
    < 2, or `list[0] !== left` or `list[1] !== right`.
  - Return the list as `source_order_paths`.
- `listExplicitFileSet` (about line 1344): add the trailing optional
  `options` parameter as pinned above.

### `src/lib/tauri/document.vitest.ts`
- Update the existing `file_pair` / `filePair` fixtures (about lines 111-139)
  to include the list.

### `src/lib/tauri/document-invoke.vitest.ts`
- Add the invoke-payload assertions for `listExplicitFileSet`, imitating the
  existing invoke tests in this file.

## Test Cases (input -> expected)

- `{kind:"file_pair", left_file_path:"/a", right_file_path:"/b", source_order_paths:["/a","/b","/c"]}`
  -> normalized with the same three-entry list.
- `filePair` with `leftFilePath`, `rightFilePath`, `sourceOrderPaths`
  -> accepted.
- List missing -> throws.
- List `["/a"]` -> throws.
- List `["/b","/a"]` (with left `/a`, right `/b`) -> throws.
- List containing a non-string -> throws.
- Either path missing -> throws (existing cases still pass).
- `listExplicitFileSet(paths, sort, "", 0, 200)` -> invoke args have no
  `sourceOrder` key.
- `listExplicitFileSet(..., { sourceOrder: true })` -> invoke args contain
  `sourceOrder: true`.

## Invariants

- Directory, `explicit_file_set`, `github_pr`, and `git_diff` normalization
  are unchanged.
- No `any`; follow ts-coding-standards.

## Overwrite Safety

Before each edit, re-read the target file fresh. Record `shasum -a 256` of
the owned files at start. On drift, re-read and re-apply only this intent.
Do not touch files outside `writePaths`.

## Verification (run from repository root)

1. `bunx vitest run --config vitest.config.ts src/lib/tauri/document.vitest.ts src/lib/tauri/document-invoke.vitest.ts`
   -> exit 0, all tests pass.
2. `bunx tsc --noEmit 2>&1 | grep "src/lib/tauri/"`
   -> no output. Errors in `src/features/workspace/` are allowed until wave 2.
3. `bunx biome check src/lib/tauri/document.ts src/lib/tauri/document.vitest.ts src/lib/tauri/document-invoke.vitest.ts`
   -> exit 0.

## Completion Criteria

- [ ] `file_pair` type and normalizer carry `source_order_paths`, with all
      the validation rules above.
- [ ] `listExplicitFileSet` accepts `{ sourceOrder }` and sends the key only
      when it is true.
- [ ] All test cases present and passing; verification 1-3 pass.
- [ ] Progress log updated.

## Progress Log

### Session: 2026-11-16
**Tasks Completed**: Plan created.
**Notes**: Not started.

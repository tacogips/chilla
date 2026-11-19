# Link Navigation: Link Classification and Fragment Lookup Implementation Plan

**Status**: Ready
**Plan ID**: link-nav-preview-links
**Wave**: 1 (no dependencies)
**Design Reference**: design-docs/specs/design-link-navigation-history.md#link-classification, #fragment-resolution
**Created**: 2026-11-19
**Last Updated**: 2026-11-19

---

## Intent And Context

This plan provides the pure helpers that later plans use to turn a preview
`href` into an action:

- `link-nav-preview-pane` (wave 2) uses the classifier.
- `link-nav-workspace-shell` (wave 3) uses the fragment lookup.

Existing code to imitate:

- `src/features/preview/preview-assets.ts`: `PreviewPathApi`,
  `resolveDocumentResource`, `splitResourcePath`, `isAbsoluteLocalPath`,
  `isDefaultBrowserUrl`, `GENERIC_SCHEME_PATTERN`.
- Bun test style: `src/features/preview/preview-assets.test.ts`, which uses
  async fake path APIs.
- DOM test style: any `*.vitest.ts` file under `src/features/` (jsdom).

Problem being fixed: `resolveDocumentResource` re-splits its input on literal
`?` / `#`. A decoded filename such as `chapter#one.md` must never pass through
it (review finding DESIGN-001).

## Non-Goals

- No `PreviewPane`, workspace or keymap edits.
- No change to `resolveDocumentResource` behavior or to its media callers.
  Only its internal join/normalize step is moved into the new helper.
- No support for `file:` URLs or Windows paths.
- No duplicate-suffix emulation of GitHub slugs.

## Pinned Contracts (later plans depend on these exactly)

```ts
// src/features/preview/preview-assets.ts
export function resolveDocumentPathname(
  pathname: string,
  documentPath: string,
  pathApi: Pick<PreviewPathApi, "dirname" | "join" | "normalize">,
): Promise<string>;

// src/features/preview/previewLinks.ts
export interface PreviewLinkNavigation {
  readonly path: string;
  readonly fragment: string | null;
}
export type PreviewLinkTarget =
  | { readonly kind: "ignore" }
  | { readonly kind: "external"; readonly url: string }
  | { readonly kind: "anchor"; readonly fragment: string }
  | { readonly kind: "file"; readonly path: string; readonly fragment: string | null };
export function classifyPreviewLink(
  href: string,
  documentPath: string | null,
  pathApi: Pick<PreviewPathApi, "dirname" | "join" | "normalize">,
): Promise<PreviewLinkTarget>;
export function slugifyHeading(title: string): string;

// src/features/preview/previewFragment.ts
export function findFragmentTarget(container: ParentNode, fragment: string): HTMLElement | null;
```

## Deliverables

### 1. `src/features/preview/preview-assets.ts` (edit)

- Add `resolveDocumentPathname`:
  - absolute pathname (`isAbsoluteLocalPath`) -> `normalize(pathname)`;
  - otherwise -> `normalize(join(dirname(documentPath), pathname))`.
  - It does no splitting, no decoding and no trimming of inner characters.
- Make `resolveDocumentResource` call it after its own `splitResourcePath`.
  Its output for every existing input must stay identical.

### 2. `src/features/preview/previewLinks.ts` (new)

`classifyPreviewLink` applies the following steps in order:

1. Trim the href. Empty, `#` or only `#` -> `ignore`.
2. If `isDefaultBrowserUrl(href)` (http, https, mailto, tel) ->
   `external { url: href }`.
3. Starts with `//`, or matches a generic scheme
   (`/^[a-zA-Z][a-zA-Z\d+.-]*:/`) -> `ignore`. A local relative path such as
   `a:b.md` is ignored by this rule too, which is acceptable.
4. Starts with `#` -> `anchor { fragment: decodeOnce(rest) }`. An empty rest
   was already handled in step 1.
5. Otherwise the href is a path. If `documentPath` is null or blank ->
   `ignore`.
6. Split the still-encoded href exactly once: the fragment is everything after
   the first literal `#`; the query is everything after the first literal `?`
   that comes before that `#`. Drop the query.
7. `decodeOnce(pathname)` and `decodeOnce(fragment)`. `decodeOnce` uses
   `decodeURIComponent` inside try/catch and returns the raw text on failure.
   An empty pathname (for example `?x#y`) -> treat as `anchor` on the fragment,
   or `ignore` if there is no fragment.
8. `path = await resolveDocumentPathname(decodedPathname, documentPath, pathApi)`.
   Return `file { path, fragment }`. The fragment is `null` when absent or
   empty.

`slugifyHeading` is a port of Rust `slugify_heading`
(`src-tauri/src/markdown/mod.rs`):

- For each Unicode character: if it is alphanumeric (`/[\p{L}\p{N}]/u`),
  append it lowercased; otherwise append one `-` unless the previous output was
  already `-`.
- Trim leading and trailing `-`. Empty result -> `section`.

### 3. `src/features/preview/previewFragment.ts` (new)

`findFragmentTarget` lookup order:

1. The first element in `container` whose `id === fragment`. Iterate
   `querySelectorAll("[id]")` and compare `id` values. Never build
   `#${fragment}` without `CSS.escape` (jsdom may not provide `CSS.escape`, so
   comparing values is preferred).
2. Otherwise the first `h1,h2,h3,h4,h5,h6` element whose
   `id === slugifyHeading(fragment)`.
3. Otherwise `null`.

### 4. Tests

`src/features/preview/previewLinks.test.ts` (new, bun test). Use the fake POSIX
pathApi from `preview-assets.test.ts` (node:path posix wrapped in async
functions) with `documentPath = /docs/index.md`:

- `./b.md` -> `file /docs/b.md`, fragment null
- `../a/b.md?x=1#Sec` -> `file /a/b.md`, fragment `Sec`
- `sub/c.md` -> `/docs/sub/c.md`
- `my%20doc.md` -> `/docs/my doc.md`
- `chapter%23one.md` -> `/docs/chapter#one.md`, fragment null
- `chapter%3Fone.md#heading` -> `/docs/chapter?one.md`, fragment `heading`
- `name%253F.md` -> `/docs/name%3F.md` (decoded once)
- `/abs/x.md` -> `/abs/x.md`
- `#%E6%97%A5` -> `anchor` with fragment `日`
- `bad%E0%A4.md` -> `/docs/bad%E0%A4.md` (raw kept)
- `https://x.y`, `MAILTO:a@b.c`, `tel:1` -> `external`
- `javascript:x`, `ftp://h`, `//host/p`, `#`, `""` -> `ignore`
- path href with `documentPath` null -> `ignore`
- `slugifyHeading`: `Child Topic` -> `child-topic`; `""` -> `section`;
  `a_b` -> `a-b`; `C++ API` -> `c-api`; `日本 語` -> `日本-語`;
  `2024 Notes` -> `2024-notes`

`src/features/preview/preview-assets.test.ts` (edit, add cases):

- `resolveDocumentPathname("chapter#one.md", "/docs/index.md", api)` ->
  `/docs/chapter#one.md`
- `"../x?.md"` -> `/x?.md`
- `/abs/y.md` -> `/abs/y.md`
- All existing `resolveDocumentResource` tests remain unchanged and passing.

`src/features/preview/previewFragment.vitest.ts` (new, vitest/jsdom):

- container with `<h2 id="2024-notes">` and fragment `2024-notes` -> that
  element, with no throw
- `<h2 id="a-b">` and fragment `a_b` -> that element (slug fallback)
- `<p id="x">` and fragment `x` -> that element (exact match on a non-heading)
- missing fragment -> `null`
- fragment `a"b` -> `null`, with no throw

### 5. `package.json` (edit)

- Append ` ./src/features/preview/previewLinks.test.ts` to the `test` script
  list. Do not change any other script or dependency, and do not regenerate the
  lockfile.

## Invariants

- `isDefaultBrowserUrl`, `shouldResolveLocalResource` and
  `resolveDocumentResourceUrl` keep their behavior.
- Percent decoding happens once. Decoded text is never split again.

## Verification

- `bun test ./src/features/preview/previewLinks.test.ts ./src/features/preview/preview-assets.test.ts`
  -> all pass, exit 0
- `bunx vitest run --config vitest.config.ts src/features/preview/previewFragment.vitest.ts`
  -> pass, exit 0
- `bun run typecheck` -> exit 0
- `bunx biome check src/features/preview/preview-assets.ts src/features/preview/previewLinks.ts src/features/preview/previewFragment.ts src/features/preview/previewLinks.test.ts src/features/preview/previewFragment.vitest.ts src/features/preview/preview-assets.test.ts`
  -> no errors

## Completion Criteria

- [ ] Pinned exports exist with the exact signatures
- [ ] All listed test cases are implemented and passing
- [ ] `package.json` test script includes `previewLinks.test.ts`
- [ ] typecheck and biome are clean for owned files

## Progress Log

### Session: 2026-11-19
**Tasks Completed**: Plan created
**Notes**: Read each owned file fresh before editing and record its hash
before and after. `package.json` is touched only for the single test-script
append.

# Preview Context-Menu Guard README Implementation Plan

**Status**: Ready
**Plan ID**: preview-contextmenu-guard-readme
**Wave**: 1 (no dependencies)
**Depends On**: none
**Design Reference**: design-docs/specs/architecture.md#verification (README pan line)
**Created**: 2026-11-04
**Last Updated**: 2026-11-04

---

## Intent And Context

`README.md:254` says "a plain right-click opens the context menu". The accepted
design suppresses the native menu over previews, except on selected text or
editable fields. The README must stop promising the old behavior.

## Non-Goals

- Do not edit any other README line, and do not reformat or reorder the file.
- Do not edit code, tests or design docs.

## Deliverables

### 1. `README.md`

Replace only the clause after the semicolon on line 254, so the line reads exactly:

`- Right- or middle-button drag pans Markdown/rendered, source, image, video and PDF previews with momentum; the native context menu is suppressed over previews except on selected text or editable fields.`

Before editing, confirm the line by searching for
`a plain right-click opens the context menu`. If the text is not on line 254,
edit the line where it is found. If it is not found, stop and report.

## Invariants

- Exactly one line changes (`git diff --numstat README.md` shows `1 1`).

## Acceptance Criteria

- [ ] `grep -n "plain right-click opens the context menu" README.md` finds nothing (exit 1).
- [ ] `grep -n "native context menu is suppressed over previews except on selected text or editable fields" README.md` finds one line.

## Verification

Run in the foreground in `/Users/taco/gits/tacogips/chilla`. Log to
`tmp/preview-contextmenu-guard/readme.log`.

1. `grep -c "plain right-click opens the context menu" README.md` prints `0`.
2. `git diff --numstat -- README.md` prints `1	1	README.md`.

## Fanout Safety

Read the file fresh, record sha256 before and after the edit, and stop on drift. No git index operations.

## Write Paths

Mirrors `impl-plans/active/preview-contextmenu-guard-dispatch.json`.

- writePaths: `README.md`, `impl-plans/active/preview-contextmenu-guard-readme.md`
- sharedPaths: none
- artifactRoots: none

## Progress Log

### Session: 2026-11-04 (planning)
**Tasks Completed**: plan authored
**Notes**: Implementation pending.

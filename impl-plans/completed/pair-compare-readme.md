# Pair Compare: README

**Status**: Completed
**Plan ID**: pair-compare-readme
**Wave**: 1 (dependsOn: none)
**Design Reference**: design-docs/specs/design-pair-view.md (Compare CLI, Pair List Pane, Workspace Integration, Rollout Constraints)
**Created**: 2026-11-16
**Last Updated**: 2026-11-16

---

## Intent And Context

The `README.md` working tree describes the rejected model: 2+ files open pair
view, an active pane, and L/R markers. Rewrite the user documentation for the
accepted model. This is documentation only.

## Non-Goals

- Do not edit `pubpage/**`, `design-docs/**`, or any code.
- No screenshots.
- Do not use emojis.

## File-Level Changes (`README.md`)

- Replace the bullet starting with
  `` `chilla <file_a> <file_b> [more files...]` `` (around line 159) with
  three bullets. Keep the surrounding style: plain sentences, backticked
  commands.
  1. `` `chilla <file_a> <file_b>` `` with exactly two distinct regular files
     opens pair view with one pair. Restate the 0.4.0 facts still true:
     - 50/50 split, the same previews as single-file view
     - eye icon per pane, the restore strip, at most one hidden pane
     - a hidden pane keeps its zoom, and `+` / `-` affect only visible panes
     - `r` reloads the shown pair
     - repeated same file -> single file
     - a directory argument behaves as before
     - Finder / `open -a` use the explicit file list
  2. `` `chilla --compare <left>..<right> [<left>..<right> ...]` `` opens
     several pairs.
     - Each SPEC is split at the `..` that leaves two existing files; for
       example, `../a.png..../b.png` resolves to `../a.png` and `../b.png`.
     - An ambiguous SPEC, a missing file, or `--compare` without a SPEC
       exits with an error.
     - Pairs keep command-line order, and duplicate pairs are listed once.
     - `--compare` must come first and cannot be mixed with plain paths.
  3. Pair list:
     - One entry per pair, shown as `left.png <-> right.png` with full paths
       on hover.
     - It starts folded, also for a single pair.
     - Open or fold it with the header toggle, the left-edge strip, the
       `‹` button in the list header, or `Shift+L`.
     - Choose a pair by clicking, `Enter`, or `j` / `k`; the chosen pair is
       highlighted.
     - Choosing a pair keeps a hidden pane hidden.
     - `{` / `}` toggle the left / right pane.
- Add one bullet, or restore the sentence, stating that three or more file
  arguments (for example `chilla a b c` or `chilla a b a`) show the files as
  an explicit list in the sidebar, as before.
- Keep the `{` / `}` shortcut line (around line 244) and the
  `pair.left.toggle`, `pair.right.toggle` workspace actions line (around
  line 416).
- Remove every mention of an active pane, the accent border, and `L` / `R`
  markers.

## Verification

- `grep -n "active pane\|accent border\|L\` / \`R\|more files" README.md`
  -> no output.
- `grep -n -- "--compare" README.md` -> at least one line.
- `git diff --check -- README.md` -> exit 0.

## Concurrency And Drift Rules

- Re-read README.md before editing it. Record sha256 before and after the
  edit in the progress log. Edit only README.md.

## Completion Criteria

- [x] README describes the 2-file pair, `--compare`, the pair list, and the
      3+ file explicit list
- [x] No rejected-model wording remains
- [x] grep and diff checks pass

## Progress Log

### Session: 2026-11-16
**Tasks Completed**: Plan created
**Notes**: Supersedes pair-multi-readme.

### Session: 2026-11-16 (implementation)
**Tasks Completed**: Updated the pair comparison README and verified the assigned checks. Formal review and workflow finalization remain downstream.
**SHA256**: `README.md` before `6a16344f33cbf6d809471702e564ac36324ea2561e447680a68e3c129d7f52dd`; after `a3dd65cd4754ce6769e17d7893ec1662b3f25cbe6502d6d1a25a55d09380158a`. This plan before `65a99a61f75f0e4908192878bb2e902009782823e2db8f3b215d15e7b6d7b2de`; its final digest is recorded in plan-local evidence to avoid a self-referential hash.
**Verification**: Rejected wording grep found no matches (exit 1); compare and retained shortcut greps passed; `git diff --check -- README.md` passed. Logs are in `tmp/pair-compare-20261116-01/pair-compare-readme/attempt-1/`.

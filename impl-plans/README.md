# Implementation Plans

This directory contains implementation plans that translate design documents into actionable implementation specifications.

## Purpose

Implementation plans bridge design documents (what to build) and actual code (how to build). They provide:

- Clear deliverables without code
- Trait and function specifications
- Dependency mapping for concurrent execution
- Progress tracking across sessions

## Directory Structure

```
impl-plans/
├── README.md              # This file
├── active/                # Currently active implementation plans
│   └── <feature>.md       # One file per feature being implemented
├── completed/             # Completed implementation plans (archive)
│   └── <feature>.md       # Completed plans for reference
└── templates/             # Plan templates
    └── plan-template.md   # Standard plan template
```

## File Size Limits

**IMPORTANT**: Implementation plan files must stay under 400 lines to prevent OOM errors.

| Metric           | Limit         |
| ---------------- | ------------- |
| Line count       | MAX 400 lines |
| Modules per plan | MAX 8 modules |
| Tasks per plan   | MAX 10 tasks  |

Large features are split into multiple related plans with cross-references.

## Active Plans

There are no active implementation plans.

## Completed Plans

| Plan                           | Completed  | Design Reference                                             |
| ------------------------------ | ---------- | ------------------------------------------------------------ |
| `linux-tauri-e2e-github-actions.md` | 2026-05-01 | `design-docs/specs/notes.md#linux-tauri-webdriver-e2e-notes` |
| `in-app-multi-file-open.md` | 2026-05-02 | `design-docs/specs/design-file-viewer-mode.md#explicit-file-set-contract` |
| `linux-ci-nix-flake-and-bun.md` | 2026-05-01 | `design-docs/specs/notes.md` (Linux CI follow-up); `design-docs/specs/design-markdown-workbench.md` |
| `markdown-editor-save-and-conflict.md` | 2026-05-01 | `design-docs/specs/design-markdown-workbench.md`           |
| `file-view-mixed-stack-validation.md` | 2026-05-01 | `design-docs/specs/notes.md#file-viewer-mode-notes`          |
| `macos-dmg-release.md`         | 2026-05-01 | `design-docs/specs/design-macos-dmg-release.md`              |
| `file-viewer-mode.md`          | 2026-05-02 | `design-docs/specs/design-file-viewer-mode.md`               |
| `markdown-workbench-first-slice.md` | 2026-05-02 | `design-docs/specs/design-markdown-workbench.md`            |
| `csv-viewer.md`                | 2026-05-01 | `design-docs/specs/design-csv-viewer.md`                     |
| `epub-navigation-and-location.md` | 2026-04-06 | `design-docs/specs/design-epub-navigation.md` |
| `linux-tauri-e2e-webdriver.md` | 2026-03-24 | `design-docs/specs/notes.md#linux-tauri-webdriver-e2e-notes` |
| `browser-tests-to-tauri-e2e.md` | 2026-03-24 | `design-docs/specs/notes.md#browser-test-migration-to-tauri-e2e-notes` |
| `real-runtime-only-verification.md` | 2026-03-24 | `design-docs/specs/notes.md#real-runtime-only-verification-notes` |

## Phase Dependencies (for impl-exec-auto)

**IMPORTANT**: This section is used by impl-exec-auto to determine which plans to load.
Only plans from eligible phases should be read to minimize context loading.

### Phase Status

| Phase | Status    | Depends On |
| ----- | --------- | ---------- |
| 1     | COMPLETED | -          |
| 2     | COMPLETED | Phase 1    |
| 3     | COMPLETED | Phase 2    |
| 4     | COMPLETED | Phase 3    |
| 5     | COMPLETED | Phase 4    |

Phase 2 `file-view-mixed-stack-validation`, Phase 3 `markdown-editor-save-and-conflict`, Phase 4 `linux-ci-nix-flake-and-bun`, and Phase 5 `linux-tauri-e2e-github-actions` are archived under `impl-plans/completed/`. Phase 1 feature work remains under `impl-plans/completed/`. **Post-merge**: confirm a green GitHub Actions `CI` run on `main`, including job `tauri-e2e-linux` (see `impl-plans/completed/linux-tauri-e2e-github-actions.md` completion criteria).

### Phase to Plans Mapping

```
PHASE_TO_PLANS = {
  1: [
    # Completed references (do not load for new execution unless needed):
    # impl-plans/completed/macos-dmg-release.md
    # impl-plans/completed/file-viewer-mode.md
    # impl-plans/completed/csv-viewer.md
    # impl-plans/completed/markdown-workbench-first-slice.md
  ],
  2: [
    # Completed: impl-plans/completed/file-view-mixed-stack-validation.md
  ],
  3: [
    # Completed: impl-plans/completed/markdown-editor-save-and-conflict.md
  ],
  4: [
    # Completed: impl-plans/completed/linux-ci-nix-flake-and-bun.md
  ],
  5: [
    # Completed: impl-plans/completed/linux-tauri-e2e-github-actions.md
  ]
}
```

## Workflow

### Creating a New Plan

1. Use the `/impl-plan` command with a design document reference
2. Or manually create a plan using `templates/plan-template.md`
3. Save to `active/<feature-name>.md`
4. Update this README with the new plan entry
5. **IMPORTANT**: If plan exceeds 400 lines, split into multiple files

### Working on a Plan

1. Read the active plan
2. Select a subtask to work on (consider parallelization)
3. Implement following the deliverable specifications
4. Update task status and progress log
5. Mark completion criteria as done

### Completing a Plan

1. Verify all completion criteria are met
2. Update status to "Completed"
3. Move file from `active/` to `completed/`
4. Update this README

## Guidelines

- Plans contain NO implementation code
- Plans specify traits, functions, and file structures
- Subtasks should be as independent as possible for parallel execution
- Always update progress log after each session
- **Keep each plan file under 400 lines** - split if necessary

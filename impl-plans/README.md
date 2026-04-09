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

| Plan                                | Status      | Design Reference                                                       | Last Updated |
| ----------------------------------- | ----------- | ---------------------------------------------------------------------- | ------------ |
| `macos-dmg-release.md`              | In Progress | `design-docs/specs/design-macos-dmg-release.md`                        | 2026-04-09   |
| `markdown-workbench-first-slice.md` | Ready       | `design-docs/specs/design-markdown-workbench.md`                       | 2026-03-19   |
| `file-viewer-mode.md`               | In Progress | `design-docs/specs/design-file-viewer-mode.md`                         | 2026-03-19   |

## Completed Plans

| Plan                           | Completed  | Design Reference                                             |
| ------------------------------ | ---------- | ------------------------------------------------------------ |
| `epub-navigation-and-location.md` | 2026-04-06 | `design-docs/specs/design-epub-navigation.md` |
| `linux-tauri-e2e-webdriver.md` | 2026-03-24 | `design-docs/specs/notes.md#linux-tauri-webdriver-e2e-notes` |
| `browser-tests-to-tauri-e2e.md` | 2026-03-24 | `design-docs/specs/notes.md#browser-test-migration-to-tauri-e2e-notes` |
| `real-runtime-only-verification.md` | 2026-03-24 | `design-docs/specs/notes.md#real-runtime-only-verification-notes` |

## Phase Dependencies (for impl-exec-auto)

**IMPORTANT**: This section is used by impl-exec-auto to determine which plans to load.
Only plans from eligible phases should be read to minimize context loading.

### Phase Status

| Phase | Status  | Depends On |
| ----- | ------- | ---------- |
| 1     | READY   | -          |
| 2     | BLOCKED | Phase 1    |
| 3     | BLOCKED | Phase 2    |

### Phase to Plans Mapping

```
PHASE_TO_PLANS = {
  1: [
    "impl-plans/active/macos-dmg-release.md",
    "impl-plans/active/markdown-workbench-first-slice.md",
    "impl-plans/active/file-viewer-mode.md",
  ],
  2: [
    # Add Phase 2 plan files here
  ],
  3: [
    # Add Phase 3 plan files here
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

---
name: riela-workflow-organizer
description: Use when organizing, deduplicating, or refactoring riela workflow bundles. Applies to reducing duplicate workflows, extracting reusable called workflows through cross-workflow transitions, using called-workflow composition, consolidating repeated prompts/nodes/add-ons, reviewing historical runtime artifacts, and improving workflow structure or input/output contracts from observed execution failures.
metadata:
  short-description: Refactor riela workflows
---

# Riela Workflow Organizer

Use this skill to make existing riela workflow bundles more DRY, maintainable, and effective without changing their intended behavior.

Use `riela-workflow` for exact workflow schema rules while editing. Use `riela-workflow-run` or `riela-troubleshooting` when inspecting sessions, artifacts, or run failures.

## Organizing Workflow

1. Inventory workflows before editing:
   - List candidate bundles under the workflow root, usually `.riela/workflows` or `examples`.
   - Inspect `workflow.json`, `nodes/node-*.json`, `prompts/*.md`, mock scenarios, and expected result docs.
   - Validate each affected workflow before making structural conclusions.
2. Identify duplication classes:
   - Repeated step sequences or manager/worker routing patterns.
   - Repeated node payloads, command wrappers, add-on usage, or backend/model/prompt combinations.
   - Repeated prompt instructions that differ only by variables.
   - Repeated mock scenarios, expected result assertions, or artifact inspection steps.
   - Repeated input envelopes that force workers or commands to infer missing context.
3. Choose the smallest refactor that removes real duplication:
   - Extract long inline prompts to `prompts/*.md`.
   - Consolidate repeated behavior into reusable primitive nodes or built-in add-ons.
   - Split a repeated multi-step stage into a separate called workflow.
   - Use cross-workflow transitions with `toWorkflowId`, `toStepId`, and `resumeStepId` when a workflow should call another workflow and then resume.
   - Leave duplication in place when extraction would hide important local intent or create excessive coupling.
4. Improve input and output contracts from evidence:
   - Read historical artifacts and session logs for actual worker confusion, missing context, truncation, empty template values, timeout patterns, or brittle shell assumptions.
   - Prefer explicit structured input payloads over prompts that require workers to discover project-specific runtime internals.
   - Make step outputs match the next step's declared input needs; do not require command nodes to scrape riela internal message storage unless that is the explicit product behavior being tested.
   - Preserve full input files or references when prompt summaries may truncate operational guidance.
5. Implement incrementally:
   - Write down the intended old-to-new mapping before editing.
   - Move one reusable unit at a time.
   - Keep workflow-relative paths portable.
   - Update affected mock scenarios, expected results, usage docs, and plan notes.
   - Validate and, when practical, run a mock scenario before real backend runs.

## Composition Rules

- Author only the current step-addressed workflow model.
- Do not introduce legacy `subWorkflows`, `workflowCalls`, `subWorkflowConversations`, `edges`, `loops`, `branching`, `managerNodeId`, or `entryNodeId`.
- Treat "sub workflow" requests as a request for called workflows through cross-workflow transitions unless the user explicitly asks to design a new product feature.
- A cross-workflow transition must include `toWorkflowId`, `toStepId`, and `resumeStepId`.
- A step may have at most one cross-workflow transition.
- Prefer reusable primitive nodes chained by `steps[].transitions` over combined one-off nodes.
- Prefer built-in add-ons for generic behavior such as git commit/push when the add-on contract fits.
- Do not merge unrelated workflows merely because their shapes look similar; preserve separate workflows when ownership, input contract, or failure recovery differs.

## Artifact Review

When improving workflows from past runs, inspect both execution structure and semantic payloads.

Useful commands inside this repository:

```bash
bun run src/main.ts workflow list --workflow-definition-dir .riela/workflows
bun run src/main.ts workflow inspect <workflow-name> --workflow-definition-dir .riela/workflows --output json
bun run src/main.ts workflow validate <workflow-name> --workflow-definition-dir .riela/workflows
bun run src/main.ts session status <session-id> --output json
bun run src/main.ts session progress <session-id>
bun run src/main.ts session export <session-id> --output json
bun run src/main.ts session logs <session-id> --format json
```

Look for these signals:

- Empty rendered template values where upstream output paths were wrong.
- Prompt summaries that omit mandatory runtime guidance or full input locations.
- Workers repeatedly asking for context that should have been injected.
- Command steps depending on workspace-specific files instead of declared env/input.
- Large artifacts copied through prompts instead of passed as structured files or references.
- Timeout or stall patterns caused by vague completion criteria, missing resume paths, or overlarge agent tasks.

## Refactor Checklist

- The refactor has a clear duplication target and does not only rename files.
- Reusable called workflows have stable input/output contracts and descriptions.
- Callers pass all required context explicitly through workflow input or step output.
- Commands consume injected env/config and return declared structured output data.
- Managers and workers receive enough structured input guidance to inspect full payloads when summaries are truncated.
- Validation passes for every modified workflow.
- Mock scenarios or expected results are updated when behavior or structure changes.
- Any real backend rerun is compared against the prior artifact/session evidence that motivated the change.

## Dirty Worktree Guardrails

- Check `git status --short` before broad edits.
- Do not revert, unstage, or overwrite unrelated changes.
- Avoid broad formatting or `git add -A` in repositories with concurrent edits.
- Keep refactors small enough that changed workflow behavior can be reviewed from the diff.

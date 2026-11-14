# Riela Workflow Format Reference

This reference reflects the current implementation in `src/workflow/types.ts`, `src/workflow/validate.ts`, `src/workflow/authored-workflow.ts`, and `src/workflow/node-addons.ts`.

## Bundle Layout

```text
<workflow-root>/
  <workflow-name>/
    workflow.json
    nodes/
      node-<id>.json
    prompts/
      <prompt>.md
```

Optional nested node paths such as `workflows/<lane>/nodes/node-<id>.json` are valid because node payload paths are workflow-relative.

## `workflow.json`

Required top-level fields:

- `workflowId`
- `defaults.nodeTimeoutMs`
- `entryStepId`
- `nodes`
- `steps`

Common optional top-level fields:

- `description`
- `prompts.rielaPromptTemplate`
- `prompts.workerSystemPromptTemplate`
- `managerStepId`
- `defaults.maxLoopIterations`
- `defaults.timeoutPolicy`
- `defaults.containerRuntime`

The implementation defaults `maxLoopIterations` when omitted, but examples should usually author it explicitly.

Rejected top-level fields:

- `managerRuntimeId`
- `managerNodeId`
- `entryNodeId`
- `subWorkflows`
- `workflowCalls`
- `subWorkflowConversations`
- `edges`
- `loops`
- `branching`

## Node Registry Entries

Allowed `workflow.json.nodes[]` fields:

- `id`
- `nodeFile`
- `addon`
- `execution`
- `kind`
- `repeat`

Rules:

- `id` must match `^[a-z0-9][a-z0-9-]{1,63}$`.
- Provide exactly one of `nodeFile` or `addon`.
- `nodeFile` must be a safe workflow-relative JSON path.
- `addon` entries are resolved during validation/load and do not have local node payload files.
- Manager steps cannot use add-on-backed node registry entries.

Optional execution policy:

```json
{
  "execution": {
    "mode": "optional",
    "decisionBy": "owning-manager"
  }
}
```

Optional repeat policy:

```json
{
  "repeat": {
    "while": "continue_items",
    "restartAt": "foreach-input",
    "maxIterations": 3
  }
}
```

## Steps

Allowed `workflow.json.steps[]` fields:

- `id`
- `stepFile`
- `nodeId`
- `description`
- `role`
- `promptVariant`
- `timeoutMs`
- `sessionPolicy`
- `transitions`

Rules:

- `id` values are unique.
- `nodeId` must resolve to `workflow.json.nodes[].id`.
- `role` is `manager` or `worker` when present.
- At most one step may have `role: "manager"`.
- If `managerStepId` is omitted and exactly one step has `role: "manager"`, that step is inferred as manager.
- `entryStepId` and `managerStepId` point to step ids.
- `sessionPolicy.inheritFromStepId` points to a step id.
- If `stepFile` is used in source authoring, do not also author inline step fields on that same step entry; loading resolves file-backed steps before validation.

Step session policy:

```json
{
  "sessionPolicy": {
    "mode": "reuse",
    "inheritFromStepId": "implement"
  }
}
```

## Transitions

Allowed transition fields:

- `toStepId`
- `toWorkflowId`
- `resumeStepId`
- `label`

Local transition:

```json
{
  "toStepId": "next-step",
  "label": "accepted"
}
```

Cross-workflow transition:

```json
{
  "toWorkflowId": "review-workflow",
  "toStepId": "reviewer",
  "resumeStepId": "apply-review"
}
```

Rules:

- Local `toStepId` points to a step in the same workflow.
- Cross-workflow `toStepId` must match the callee start step: callee `managerStepId` when present, otherwise callee `entryStepId`.
- Cross-workflow `resumeStepId` is required and points to a step in the current workflow.
- `resumeStepId` is valid only with `toWorkflowId`.
- A step may have at most one cross-workflow transition.
- Omitted `label` means unconditional or `always`.

## Node Payloads

Required for all authored node payload files:

- `id`
- `variables`

Agent nodes also require:

- `executionBackend`
- `model`
- `promptTemplate` or `promptTemplateFile`

Common optional fields:

- `description`
- `nodeType`
- `managerType`
- `workingDirectory`
- `sessionPolicy`
- `systemPromptTemplate` or `systemPromptTemplateFile`
- `sessionStartPromptTemplate` or `sessionStartPromptTemplateFile`
- `promptVariants`
- `command`
- `container`
- `durability`
- `userAction`
- `argumentsTemplate`
- `argumentBindings`
- `templateEngine`
- `timeoutMs`
- `output`

Valid authored `nodeType` values:

- `agent`
- `command`
- `container`
- `user-action`

Do not author `nodeType: "addon"`; it is runtime-owned.

Valid `executionBackend` values:

- `codex-agent`
- `claude-code-agent`
- `official/openai-sdk`
- `official/anthropic-sdk`

`model` must be backend/provider-specific. Do not use CLI-wrapper identifiers as model values.

## Prompt Variants

Use `promptVariants` on the node payload and `promptVariant` on a step when multiple steps reuse the same node with different prompt text.

```json
{
  "promptVariants": {
    "self-review": {
      "promptTemplateFile": "prompts/self-review.md"
    }
  }
}
```

## User-Action Nodes

`nodeType: "user-action"` requires `userAction` and `promptTemplate` or `promptTemplateFile`.

Omit these fields for user-action nodes:

- `model`
- `executionBackend`
- `sessionPolicy`
- `command`
- `container`
- `durability`

## Add-Ons

Built-in add-ons:

- `riela/chat-reply-worker`
- `riela/codex-worker`
- `riela/claude-code-worker`
- `riela/x-gateway-read`
- `riela/x-gateway`
- `riela/gmail-gateway-read`
- `riela/gmail-gateway`
- `riela/git-commit`
- `riela/git-push`

Use explicit object form with `version: "1"` unless a newer implementation documents a different version.

`addon.inputs` becomes resolved node `variables`. `addon.config` is validated by the add-on descriptor. `addon.env` maps add-on environment variable names to riela runtime environment variable names only for descriptors that support explicit environment bindings.

Prefer DRY composition when using add-ons: chain reusable primitive steps in `steps[].transitions` instead of authoring combined nodes that duplicate behavior. For example, express commit-and-push as `riela/git-commit` followed by `riela/git-push`.

## Validation Commands

Inside the riela repo:

```bash
bun run src/main.ts workflow validate <workflow-name> --workflow-definition-dir <workflow-root>
```

When riela is installed:

```bash
riela workflow validate <workflow-name> --workflow-definition-dir <workflow-root>
```

Useful inspection command:

```bash
bun run src/main.ts workflow inspect <workflow-name> --workflow-definition-dir <workflow-root> --output json
```

# Riela Troubleshooting Reference

## Workflow Not Found

Check:

- `<workflow-root>/<workflow-name>/workflow.json`
- `--workflow-definition-dir`
- `RIEL_WORKFLOW_DEFINITION_DIR`
- `workflow list`
- project/user scope shadowing

## Validation Failed

Run:

```bash
riela workflow validate <workflow-name> --workflow-definition-dir <root>
```

Common causes:

- legacy top-level fields such as `edges`, `loops`, `workflowCalls`, or `subWorkflows`
- step ids and node registry ids confused
- manager step references an add-on-backed node
- agent node missing `executionBackend`, `model`, `promptTemplateFile`, or `variables`

## Run Failed

Inspect:

```bash
riela session status <session-id> --output json
riela session progress <session-id>
```

Then check:

- failed step id
- backend exit code
- timeout status
- output contract validation errors
- communication replay/retry state

## Stalled Or Paused

Check queue, current step, and user-action state in `session status`.

For supervised runs, inspect supervision state and nested superviser session id if present.

## Backend Failure

Reproduce with `--mock-scenario` to separate workflow graph issues from backend transport/model issues.

Check environment credentials expected by the backend or add-on.

## Missing Artifacts

Check:

- `--artifact-root`
- `--session-store`
- `RIEL_ARTIFACT_ROOT`
- `RIEL_SESSION_STORE`
- `RIEL_ARTIFACT_DIR`

Use GraphQL detail queries for portable diagnostic snapshots, logs, and
communication state.

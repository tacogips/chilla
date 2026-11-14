# Riela Workflow Test Runbook

## Fixture Layout

Typical workflow test fixture:

```text
examples/<workflow-name>/
  workflow.json
  nodes/
  prompts/
  mock-scenario.json
  EXPECTED_RESULTS.md
```

## Commands

Validate:

```bash
bun run src/main.ts workflow validate <workflow-name> --workflow-definition-dir ./examples
```

Inspect:

```bash
bun run src/main.ts workflow inspect <workflow-name> --workflow-definition-dir ./examples --output json
```

Run deterministic scenario:

```bash
bun run src/main.ts workflow run <workflow-name> \
  --workflow-definition-dir ./examples \
  --mock-scenario ./examples/<workflow-name>/mock-scenario.json \
  --output json
```

## Expected Results

`EXPECTED_RESULTS.md` should record:

- Commands to run.
- Stable expected status and exit code.
- Stable output payload fields.
- Stable step ids and transition behavior.
- Any known unstable fields to ignore.

Unstable fields usually include:

- `sessionId`
- timestamps
- absolute artifact paths
- generated runtime ids unless documented as deterministic

## Assertions

Prefer assertions against:

- final `status`
- `exitCode`
- workflow and step ids
- published output JSON shape
- communication count and stable labels
- cross-workflow dispatch ids such as `__cw:<callerStepId>`

Avoid assertions against:

- wall-clock durations
- absolute local paths
- backend-specific log text unless the fixture controls it

## Failure Triage

If validation fails, fix authoring first.

If inspect differs, compare step graph, node registry, manager/entry ids, and derived cross-workflow dispatches.

If run fails, inspect:

```bash
bun run src/main.ts session status <session-id> --output json
bun run src/main.ts session progress <session-id>
bun run src/main.ts graphql '<query or mutation document>'
```

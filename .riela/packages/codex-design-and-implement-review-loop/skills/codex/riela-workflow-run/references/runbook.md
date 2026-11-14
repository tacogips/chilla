# Riela Workflow Runbook

This runbook is for users operating existing riela workflow bundles.

## Workflow Discovery

List workflows from a direct root:

```bash
riela workflow list --workflow-definition-dir ./examples
```

List from scoped lookup:

```bash
riela workflow list
```

The human table labels each row as `project scope`, `user scope`, or
`direct root`. If the same workflow name exists in both project and user scope,
the command emits a warning on stderr; bare-name commands select project scope
unless you pass `--scope user`.

Useful filters:

```bash
riela workflow list --status running --limit 10 --output json
```

Show one workflow overview:

```bash
riela workflow status <workflow-name> --workflow-definition-dir <dir>
```

## Validate And Inspect

Validate structure and semantic constraints:

```bash
riela workflow validate <workflow-name> --workflow-definition-dir <dir>
```

Inspect normalized structure:

```bash
riela workflow inspect <workflow-name> --workflow-definition-dir <dir> --output json
```

`workflow inspect` shows step and node-registry identity fields and derived cross-workflow dispatch metadata from `steps[].transitions`.

## Run

Basic local run:

```bash
riela workflow run <workflow-name> --workflow-definition-dir <dir> --output json
```

Recommended supervised run:

```bash
riela workflow run <workflow-name> \
  --workflow-definition-dir <dir> \
  --auto-improve \
  --nested-supervisor \
  --max-supervised-attempts 3 \
  --workflow-mutation-mode execution-copy \
  --output json
```

Use supervised execution as the default recommendation for real work. It keeps the target session under an audit-visible supervision policy, detects terminal failures and stalls, can retry or rerun from targeted steps, and can run a paired supervisor workflow when `--nested-supervisor` is enabled.

Run with a deterministic mock scenario:

```bash
riela workflow run <workflow-name> \
  --workflow-definition-dir <dir> \
  --mock-scenario <dir>/<workflow-name>/mock-scenario.json \
  --output json
```

Run with hard caps:

```bash
riela workflow run <workflow-name> \
  --workflow-definition-dir <dir> \
  --max-steps 20 \
  --default-timeout-ms 120000 \
  --output json
```

Dry run:

```bash
riela workflow run <workflow-name> \
  --workflow-definition-dir <dir> \
  --dry-run \
  --output json
```

Use `--working-dir <path>` when node execution should occur relative to a specific project directory.

## Sessions

Use the `sessionId` returned by `workflow run`.

Progress:

```bash
riela session progress <session-id>
```

Full status:

```bash
riela session status <session-id> --output json
```

Resume:

```bash
riela session resume <session-id>
```

Rerun from a step:

```bash
riela session rerun <session-id> <step-id>
```

Continue from an imported-history boundary:

```bash
riela session continue <session-id> \
  --start-step <step-id> \
  --after-step-run <step-run-id>
```

Use `session rerun` when restarting from a step with variables only. Use
`session continue` only when the new execution should import prior history up
to a concrete step-run boundary.

## Local Server And GraphQL

Start server:

```bash
riela serve --workflow-definition-dir <dir>
```

Default endpoint:

```text
http://127.0.0.1:43173/graphql
```

Health check:

```bash
curl http://127.0.0.1:43173/healthz
```

GraphQL query:

```bash
riela graphql 'query { workflows(input: {}) }'
```

Endpoint-backed execution:

```bash
riela workflow run <workflow-name> \
  --workflow-definition-dir <dir> \
  --endpoint http://127.0.0.1:43173/graphql \
  --output json
```

Remote-capable commands:

- `workflow run`
- `session resume`
- `session rerun`

Local-only commands:

- `call-step`
- `session continue`

Detailed diagnostics, logs, merged execution history, and export-shaped payloads
are GraphQL queries rather than separate session subcommands.

## Direct Step Calls

Use for local debugging of one step in a run context:

```bash
riela call-step <workflow-id> <workflow-run-id> <step-id> \
  --message-file message.json \
  --output json
```

Useful options:

- `--prompt-variant <name>`
- `--continue-session`
- `--timeout-ms <ms>`
- `--resume-step-exec <execution-record-id>`; this is the same value as `nodeExecId` in session state

Step ids are the supported target. Do not use node-id aliases.

## Auto-Improve

Run with engine-owned supervision:

```bash
riela workflow run <workflow-name> \
  --workflow-definition-dir <dir> \
  --auto-improve \
  --max-supervised-attempts 3 \
  --output json
```

Optional nested supervisor:

```bash
riela workflow run <workflow-name> \
  --workflow-definition-dir <dir> \
  --auto-improve \
  --nested-supervisor \
  --output json
```

Useful supervision options:

- `--monitor-interval-ms <ms>`
- `--stall-timeout-ms <ms>`
- `--max-supervised-attempts <n>`
- `--max-workflow-patches <n>`
- `--workflow-mutation-mode execution-copy|in-place`
- `--supervisor-workflow <workflow-id>` (`--superviser-workflow` is a legacy alias)

Recommended defaults:

- Use `--auto-improve --nested-supervisor` for production-like or expensive work.
- Use `--workflow-mutation-mode execution-copy` unless the user explicitly asks to patch the canonical workflow bundle in place.
- Set `--max-supervised-attempts` to a small finite number, commonly `3`, to avoid unbounded remediation.
- Use `session status` or GraphQL detail queries after the run to inspect supervision state.

## Events

Validate event config:

```bash
riela events validate --workflow-definition-dir <dir> --event-root <event-root>
```

Emit a fixture event:

```bash
riela events emit <source-id> \
  --workflow-definition-dir <dir> \
  --event-root <event-root> \
  --event-file payload.json \
  --mock-scenario <dir>/<workflow-name>/mock-scenario.json
```

Start event listeners:

```bash
riela events serve --workflow-definition-dir <dir> --event-root <event-root>
```

Inspect receipts:

```bash
riela events list --source <source-id> --limit 20
```

Replay:

```bash
riela events replay <receipt-id> --reason "operator retry"
```

## Runtime State

Important options:

- `--workflow-definition-dir`: direct directory containing workflow definition bundles; does not control logs, sessions, or artifacts.
- `--scope project|user`: scoped lookup selector when no direct root is supplied.
- `--artifact-root`: workflow execution artifact tree.
- `--session-store`: persisted session state root.
- `--log-root`: operator-facing logs.
- `--addon-root`: local add-on root.

Important environment variables:

- `RIEL_WORKFLOW_DEFINITION_DIR`
- `RIEL_WORKFLOW_SCOPE`
- `RIEL_ARTIFACT_ROOT`
- `RIEL_SESSION_STORE`
- `RIEL_ARTIFACT_DIR`
- `RIEL_GRAPHQL_ENDPOINT`
- `RIEL_MANAGER_AUTH_TOKEN`
- `RIEL_MANAGER_SESSION_ID`

Resolution priority for workflow definitions:

1. `--workflow-definition-dir`
2. `RIEL_WORKFLOW_DEFINITION_DIR`
3. `--scope` or `RIEL_WORKFLOW_SCOPE`
4. scoped project/user catalog lookup

## Failure Triage

Workflow not found:

- Confirm the workflow directory is `<workflow-definition-dir>/<workflow-name>/workflow.json`.
- Pass `--workflow-definition-dir` explicitly.
- Check project/user scope shadowing with `workflow list`.

Validation fails:

- Run `workflow inspect` only after validation passes.
- Fix authored schema errors; current riela rejects legacy top-level workflow routing fields.

Run failed:

- Check `session status <session-id> --output json`.
- Check `session progress <session-id>`.
- Query GraphQL detail fields for logs and communication state.
- Reproduce with `--mock-scenario` if the failure is backend-dependent.

Remote execution fails:

- Check `serve` is running.
- Check `/healthz`.
- Pass `--endpoint` explicitly or set `RIEL_GRAPHQL_ENDPOINT`.
- Do not use `--mock-scenario` with `--endpoint`.

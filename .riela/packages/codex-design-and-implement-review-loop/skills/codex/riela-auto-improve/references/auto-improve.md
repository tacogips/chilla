# Riela Auto Improve Reference

## Recommended Mode

Recommended supervisor-backed execution:

```bash
riela workflow run <workflow-name> \
  --workflow-definition-dir <root> \
  --auto-improve \
  --nested-supervisor \
  --max-supervised-attempts 3 \
  --workflow-mutation-mode execution-copy \
  --output json
```

Use this for production-like, expensive, or user-facing work. It combines the engine-owned supervision loop with a nested supervisor workflow, keeps remediation audit state on the target session, and avoids mutating the canonical workflow bundle by default.

Use plain `workflow run` only for quick checks, deterministic fixture runs, or when supervision is intentionally disabled.

## Options

- `--auto-improve`
- `--nested-supervisor` / `--nested-superviser` legacy alias
- `--supervisor-workflow` / `--superviser-workflow` legacy alias
- `--monitor-interval-ms <ms>`
- `--stall-timeout-ms <ms>`
- `--max-supervised-attempts <n>`
- `--max-workflow-patches <n>`
- `--workflow-mutation-mode execution-copy|in-place`
- `--no-allow-targeted-rerun`

## Phase 1

Engine-owned supervision loop:

- retries on terminal failure
- detects stalls
- records incidents and remediations
- applies attempt and patch budgets
- can use targeted step rerun when policy allows
- persists supervision state on the target session

## Phase 2 Nested Supervisor

When nested supervision is enabled, riela runs the configured supervisor workflow as a paired nested session and injects runtime variables such as supervision run id, target session id, and target workflow id.

Resume with nested supervision can continue or restart nested supervisor rounds depending on saved state.

## Inspection

Use:

```bash
riela session status <session-id> --output json
riela graphql '<query or mutation document>'
```

Look for:

- `session.supervision.status`
- incidents
- remediations
- patch revisions
- `nestedSuperviserSessionId`
- target rerun step ids

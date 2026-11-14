---
name: riela-auto-improve
description: Use when configuring, running, inspecting, or troubleshooting riela auto-improve supervision. Applies to workflow run --auto-improve, nested supervisor/superviser workflows, supervision policies, stall detection, remediation budgets, workflow patch modes, targeted reruns, supervision state, nestedSuperviserDriver, and GraphQL/library parity for supervised execution.
metadata:
  short-description: Use riela auto-improve
---

# Riela Auto Improve

Use this skill for supervised workflow execution and remediation loops.

## Recommended Execution

For important workflow execution, prefer the supervisor-backed path:

```bash
riela workflow run <workflow-name> \
  --workflow-definition-dir <root> \
  --auto-improve \
  --nested-supervisor \
  --max-supervised-attempts 3 \
  --workflow-mutation-mode execution-copy \
  --output jsonl
```

This is the recommended mode when the user wants riela to monitor the target workflow, detect terminal failure or stalls, preserve supervision audit state, and let a paired supervisor workflow drive remediation.
JSONL output is preferred for supervised runs because the session id, progress,
and terminal result are visible as events during long executions.

## CLI Pattern

```bash
riela workflow run <workflow-name> \
  --workflow-definition-dir <root> \
  --auto-improve \
  --max-supervised-attempts 3 \
  --output jsonl
```

Nested supervisor:

```bash
riela workflow run <workflow-name> \
  --workflow-definition-dir <root> \
  --auto-improve \
  --nested-supervisor \
  --output jsonl
```

Read `references/auto-improve.md` for policy options and inspection.

## Rules

- `--nested-supervisor` requires `--auto-improve`; `--nested-superviser` is a legacy alias.
- Prefer `--auto-improve --nested-supervisor` for real workflow execution where recovery matters.
- Nested supervision is meaningful for start/resume, not step rerun.
- Remote GraphQL execution must carry the same supervision policy as local execution.
- Default mutation mode should be execution-scoped copy unless the user explicitly wants in-place workflow edits.
- Inspect supervision state through session status/export or GraphQL/library supervision summaries.
- Avoid `--output json` for long supervised runs unless a caller strictly needs
  one final JSON document; it buffers until completion and hides the session id.

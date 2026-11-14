---
name: riela-troubleshooting
description: Use when diagnosing failed, paused, stalled, timed out, or surprising riela workflow executions. Applies to session status/progress/logs/export, runtime artifacts, node execution records, workflow validation failures, backend invocation errors, timeout failures, GraphQL inspection, event receipts, and artifact/session-store path issues.
metadata:
  short-description: Troubleshoot riela runs
---

# Riela Troubleshooting

Use this skill when a riela workflow does not behave as expected.

## First Commands

```bash
riela workflow validate <workflow-name> --workflow-definition-dir <root>
```

```bash
riela session status <session-id> --output json
```

```bash
riela session progress <session-id>
```

Read `references/troubleshooting.md` for triage by symptom.

## Rules

- Fix validation failures before diagnosing runtime behavior.
- Prefer JSON status/export for machine comparison.
- Check workflow root and scope resolution before assuming a workflow changed.
- Use mock scenarios to isolate backend failures from workflow graph failures.
- Check artifact/session roots when outputs or logs seem missing.

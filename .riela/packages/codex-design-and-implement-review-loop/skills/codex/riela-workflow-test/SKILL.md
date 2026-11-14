---
name: riela-workflow-test
description: Use when testing or verifying riela workflow bundles. Applies to deterministic mock-scenario runs, workflow validate/inspect/run checks, EXPECTED_RESULTS.md updates, regression assertions, session output verification, and CI-style workflow fixture validation.
metadata:
  short-description: Test riela workflows
---

# Riela Workflow Test

Use this skill to verify existing riela workflows reproducibly. For authoring use `riela-workflow`; for normal operation use `riela-workflow-run`.

## Standard Verification

Run these in order:

```bash
bun run src/main.ts workflow validate <workflow-name> --workflow-definition-dir <root>
```

```bash
bun run src/main.ts workflow inspect <workflow-name> --workflow-definition-dir <root> --output json
```

```bash
bun run src/main.ts workflow run <workflow-name> \
  --workflow-definition-dir <root> \
  --mock-scenario <root>/<workflow-name>/mock-scenario.json \
  --output json
```

Read `references/test-runbook.md` for assertions, expected result files, and failure triage.

## Rules

- Prefer `--mock-scenario` for deterministic tests and examples.
- Treat `sessionId`, timestamps, and artifact paths as unstable unless a test explicitly controls them.
- Assert stable fields: `workflowName`, `workflowId`, `status`, `exitCode`, step ids, output payload shape, and expected communication metadata.
- Validate before running.
- Use `workflow inspect --output json` to catch graph/schema regressions before execution.
- Do not use remote `--endpoint` with `--mock-scenario`; mock scenarios are local-only.

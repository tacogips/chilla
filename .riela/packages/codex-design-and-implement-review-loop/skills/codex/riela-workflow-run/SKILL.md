---
name: riela-workflow-run
description: Use when helping an end user run, inspect, monitor, resume, continue, rerun, or troubleshoot existing riela workflows. Applies to workflow list/status/validate/inspect/run, session progress/status/resume/continue/rerun, GraphQL inspection, mock scenarios, workflow roots, runtime artifacts, local serve, GraphQL endpoint execution, and event-triggered workflow usage.
metadata:
  short-description: Run riela workflows
---

# Riela Workflow Run

Use this skill for operating existing riela workflows. For installing GitHub workflow directories with `workflow checkout`, use `riela-workflow-checkout` instead. For creating or editing workflow bundles, use `riela-workflow` instead.

## First Decision

Identify what the user wants:

- Find workflows for human overview: use `workflow list` or `workflow status`.
- Choose a workflow for AI/tool use: use `workflow usage --output json` first.
- Check a workflow before running: use `workflow validate` and optionally `workflow inspect`.
- Run locally: use `workflow run`; for important or long-running work, prefer supervised execution with `--auto-improve`.
- Run deterministically without real agents: add `--mock-scenario`.
- Monitor an existing run: use `session progress`, `session status`, or GraphQL detail queries.
- Continue a run: use `session resume`.
- Start from a specific step in an existing session: use `session rerun <session-id> <step-id>`.
- Continue from a concrete prior step-run artifact boundary: use `session continue <session-id> --start-step <step-id> --after-step-run <step-run-id>`.
- Inspect merged execution history, logs, and export-shaped diagnostic payloads through GraphQL.
- Use a remote control plane: start or target `serve` and pass `--endpoint`.
- Debug one step locally: use `call-step`.

Read `references/runbook.md` when the task involves sessions, remote endpoints, mock scenarios, event dispatch, auto-improve, or troubleshooting.

## Command Forms

Inside the riela source repo, prefer:

```bash
bun run src/main.ts <command>
```

When riela is installed, prefer:

```bash
riela <command>
```

Use `--workflow-definition-dir <path>` when the workflow definition bundles are not coming from scoped project/user lookup. This option points at a directory containing `<workflow-name>/workflow.json` bundles; it does not control logs, sessions, or artifacts. In this repository, examples use `--workflow-definition-dir ./examples`.

Run a registry workflow without installing it into a scoped catalog by adding
`--from-registry` to `workflow run`. The target can be a package id, including
scoped package ids such as `@scope/name`, a GitHub workflow directory URL, or a
registered shorthand like `<github-owner>/<workflow-dir>` when configured
registries resolve it unambiguously:

```bash
bun run src/main.ts workflow run <package-id> \
  --from-registry \
  --registry default \
  --branch main \
  --output jsonl
```

```bash
bun run src/main.ts workflow run \
  https://github.com/<owner>/<repo>/tree/main/.riela/workflows/<workflow-name> \
  --from-registry \
  --output jsonl
```

Branchless GitHub directory URLs, such as
`https://github.com/<owner>/<repo>/.riela/workflows/<workflow-name>`, resolve
the checkout ref from `--branch`, then a matching registered registry default
branch, then the GitHub repository default branch.

```bash
bun run src/main.ts workflow run <owner>/<workflow-dir> \
  --from-registry \
  --registry default \
  --output jsonl
```

Registry-backed runs are explicit and local-only. Bare `workflow run <name>`
never fetches from a registry, and `--from-registry` cannot be combined with
`--endpoint`. Riela resolves package ids and shorthands through configured
registries, validates package metadata, checksum/integrity, and the workflow
bundle, stages the workflow under a command-owned temporary workflow-definition
directory, then uses the normal local run path. Raw GitHub directory URLs are
allowed without package metadata after workflow-bundle validation and report
reduced `workflow-bundle-only` provenance. JSON output includes
`registrySource` provenance. Temporary registry runs do not write normal
checkout catalog records, mutate project/user catalogs, or install package
skills. Cleanup runs after a terminal session or pre-start failure; paused or
otherwise non-terminal sessions retain the temporary checkout, store retained
run provenance for the session, and report skipped cleanup metadata. Local
`session resume` and `session continue` automatically use the retained checkout
when no explicit `--workflow-definition-dir` is supplied, then remove it and the
retained provenance record after the resumed or continued execution reaches a
terminal status.

Install a public GitHub workflow directory into a scoped catalog with:

```bash
bun run src/main.ts workflow checkout \
  https://github.com/<owner>/<repo>/tree/<ref>/.riela/workflows/<workflow-name>
```

Checkout defaults to project scope and installs under
`<project>/.riela/workflows/<workflow-name>`. Add `--scope user` to install
under `~/.riela/workflows/<workflow-name>`. The command validates the remote
bundle in staging before writing the destination, rejects duplicates unless
`--overwrite` is set, and records provenance under
`~/.riela/workflow-registry/checkouts/<scope>-<workflow-name>.json`.
Do not combine checkout with `--workflow-definition-dir`.

## Standard Run Sequence

For LLM-driven workflow selection, start here:

```bash
bun run src/main.ts workflow usage --workflow-definition-dir ./examples --output json
```

Read each workflow's:

- `description`
- `callable.stepId`
- `callable.role`
- `callable.input`
- `callable.output`
- `steps`

Choose the workflow whose purpose and callable contract match the user's task.
Use `steps` only as a compact stage overview; use `workflow inspect` when
structural debugging detail is needed.

```bash
bun run src/main.ts workflow list --workflow-definition-dir ./examples
```

```bash
bun run src/main.ts workflow validate <workflow-name> --workflow-definition-dir ./examples
```

```bash
bun run src/main.ts workflow inspect <workflow-name> \
  --workflow-definition-dir ./examples \
  --output json
```

```bash
bun run src/main.ts workflow run <workflow-name> \
  --workflow-definition-dir ./examples \
  --output jsonl
```

Recommended supervised execution:

```bash
bun run src/main.ts workflow run <workflow-name> \
  --workflow-definition-dir ./examples \
  --auto-improve \
  --nested-supervisor \
  --max-supervised-attempts 3 \
  --workflow-mutation-mode execution-copy \
  --output jsonl
```

Use this recommended path when the workflow may need retries, stall detection, remediation, or a supervisor workflow to drive recovery. Use plain `workflow run` for quick local checks, deterministic mock runs, or cases where supervision is intentionally disabled.
Use JSONL for long or supervised runs so the session id and progress events are
visible before the final result. Use `--output json` only when a caller
strictly requires one final JSON document and does not need live progress.

For deterministic local testing:

```bash
bun run src/main.ts workflow run <workflow-name> \
  --workflow-definition-dir ./examples \
  --mock-scenario ./examples/<workflow-name>/mock-scenario.json \
  --output json
```

## Session Operations

After `workflow run`, capture the returned `sessionId`.

```bash
bun run src/main.ts session progress <session-id>
```

```bash
bun run src/main.ts session status <session-id> --output json
```

```bash
bun run src/main.ts session resume <session-id>
```

```bash
bun run src/main.ts session rerun <session-id> <step-id>
```

```bash
bun run src/main.ts session continue <session-id> \
  --start-step <step-id> \
  --after-step-run <step-run-id>
```

## User-Safe Defaults

- Validate before running unless the user explicitly asks to skip validation.
- For AI-guided workflow selection, prefer `workflow usage --output json` before `workflow run`.
- Prefer supervised execution with `--auto-improve --nested-supervisor` for real work where failure recovery matters.
- Prefer `--output jsonl` for real, long-running, supervised, or agent-driven
  workflow runs because it exposes the session id and progress before
  completion. Use `--output json` for short deterministic checks or callers
  that strictly need a single final JSON document.
- Prefer `--mock-scenario` for demos, tests, and docs because it avoids real backend calls.
- Keep OpenTelemetry message payload export disabled for normal runs. Telemetry
  can be enabled with an OTLP endpoint or `RIELA_OTEL_ENABLED=true`, but
  set `RIELA_OTEL_EXPORT_MESSAGES=true` only for trusted fixtures.
- Do not combine `--mock-scenario` with `--endpoint`; mock scenarios are local-only.
- Use `--working-dir` when workflow execution must happen relative to a specific project directory.
- Use `--artifact-root` and `--session-store` when the user wants isolated runtime state.
- Use `session rerun` when restarting from a step with variables only; use `session continue` only when intentionally importing history up to a concrete prior step-run.

## OpenTelemetry And Jaeger

For a local trace smoke check, start the repository Jaeger stack and point the
OTLP exporter at it:

```bash
docker compose -f compose.jaeger.yaml up -d
OTEL_SERVICE_NAME=riela OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
  bun run packages/riela/src/bin.ts workflow run first-four-arithmetic-pipeline \
  --workflow-definition-dir ./examples \
  --mock-scenario ./examples/first-four-arithmetic-pipeline/mock-scenario.json \
  --output json
docker compose -f compose.jaeger.yaml down
```

## Remote And Server Use

Start the local control plane:

```bash
bun run src/main.ts serve --workflow-definition-dir ./examples
```

Then target it:

```bash
bun run src/main.ts workflow run <workflow-name> \
  --workflow-definition-dir ./examples \
  --endpoint http://127.0.0.1:43173/graphql \
  --output jsonl
```

Remote-capable operations include `workflow run`, `session resume`, and `session rerun`. `call-step` and `session continue` remain local-only; detailed diagnostics are GraphQL queries rather than separate session subcommands.

## Troubleshooting

- If a workflow is not found, check `--workflow-definition-dir`, `RIEL_WORKFLOW_DEFINITION_DIR`, and scope lookup.
- If an AI cannot tell how to call a workflow, run `workflow usage --output json` and inspect the description, compact `steps`, and callable input/output contract.
- If validation fails, fix the workflow bundle before running; do not bypass schema errors for normal usage.
- If a run fails, inspect `session status`, `session progress`, and GraphQL detail queries.
- If backend calls should not happen, rerun with `--mock-scenario` or `--dry-run` when appropriate.
- If paths are surprising, check `--working-dir`, `--artifact-root`, `--session-store`, and the command invocation directory.

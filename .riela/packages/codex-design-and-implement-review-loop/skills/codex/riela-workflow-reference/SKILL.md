---
name: riela-workflow-reference
description: Use when helping developers integrate with riela workflows programmatically. Applies to the riela package API, createWorkflowExecutionClient, inspectWorkflow, executeWorkflow, resumeWorkflow, rerunWorkflow, getRuntimeSessionView, callWorkflowStep, executeGraphqlRequest, createGraphqlSchema, executeGraphqlDocument, GraphQL control-plane queries and mutations, riela graphql, manager-session auth, and choosing between local library calls and remote GraphQL endpoint calls.
metadata:
  short-description: Use riela workflow APIs
---

# Riela Workflow Reference

Use this skill for developer-facing references and integrations. For end-user CLI operation, use `riela-workflow-run`. For authoring workflow bundles, use `riela-workflow`.

## Choose The Integration Surface

- Use `workflow usage --output json` from the CLI when a tool-using LLM needs to choose among workflows by purpose, compact step overview, and callable contract.
- Use `createWorkflowExecutionClient()` when code should work locally or remotely with the same shape. If `endpoint` is present, it uses GraphQL; otherwise it uses the local library path.
- Use direct library functions such as `inspectWorkflow()`, `executeWorkflow()`, `resumeWorkflow()`, `rerunWorkflow()`, and `getRuntimeSessionView()` for in-process Node/Bun integration.
- Use `executeGraphqlRequest()` for low-level GraphQL HTTP calls.
- Use `riela graphql` for shell-based GraphQL queries and manager/control-plane actions.
- Use `createGraphqlSchema()` or `executeGraphqlDocument()` for in-process GraphQL without HTTP.
- Use `callWorkflowStep()` only for local step-addressed debugging/integration; do not invent node-addressed aliases.

Read `references/api-reference.md` when the task needs concrete imports, GraphQL document examples, manager auth, endpoint behavior, or API selection tradeoffs.

## Common Imports

```ts
import {
  createWorkflowExecutionClient,
  executeGraphqlRequest,
  executeWorkflow,
  getRuntimeSessionView,
  inspectWorkflow,
} from "riela";
```

## Unified Execution Client

Local library execution:

```ts
const client = createWorkflowExecutionClient({
  workflowName: "example-workflow",
  workflowRoot: "./examples",
  env: process.env,
});

const result = await client.execute({
  input: {
    humanInput: {
      request: "Run this workflow",
    },
  },
});
```

Remote GraphQL execution:

```ts
const client = createWorkflowExecutionClient({
  workflowName: "example-workflow",
  endpoint: "http://127.0.0.1:43173/graphql",
  authToken: process.env.RIEL_MANAGER_AUTH_TOKEN,
  managerSessionId: process.env.RIEL_MANAGER_SESSION_ID,
});

const result = await client.execute({
  runtimeVariables: {
    humanInput: {
      request: "Run this workflow",
    },
  },
  async: true,
});
```

Do not pass both `input` and `runtimeVariables`; they are aliases and the client rejects using both at once.

## Direct Library Pattern

```ts
const inspection = await inspectWorkflow("example-workflow", {
  workflowRoot: "./examples",
  env: process.env,
});

const run = await executeWorkflow({
  workflowName: "example-workflow",
  workflowRoot: "./examples",
  env: process.env,
  runtimeVariables: {
    humanInput: {
      request: "Run this workflow",
    },
  },
});

const runtime = await getRuntimeSessionView(run.sessionId, {
  env: process.env,
});
```

## GraphQL Request Pattern

```ts
const response = await executeGraphqlRequest({
  endpoint: "http://127.0.0.1:43173/graphql",
  document: `
    mutation ExecuteWorkflow($input: ExecuteWorkflowInput!) {
      executeWorkflow(input: $input) {
        workflowExecutionId
        sessionId
        status
        accepted
        exitCode
      }
    }
  `,
  variables: {
    input: {
      workflowName: "example-workflow",
      runtimeVariables: {
        humanInput: {
          request: "Run this workflow",
        },
      },
    },
  },
});

if (response.errors?.length) {
  throw new Error(response.errors.map((error) => error.message).join("; "));
}
```

## GraphQL CLI Pattern

Workflow discovery before execution:

```bash
riela workflow usage --workflow-definition-dir ./examples --output json
```

```bash
riela graphql 'query { workflows(input: {}) }'
```

With variables:

```bash
riela graphql '
  mutation ExecuteWorkflow($input: ExecuteWorkflowInput!) {
    executeWorkflow(input: $input) {
      sessionId
      status
    }
  }
' --variables @variables.json
```

## Integration Rules

- Without `--endpoint`, the GraphQL CLI executes in-process against local project-scoped workflow/session storage.
- Endpoint resolution for remote CLI transport is `--endpoint`, then `RIEL_GRAPHQL_ENDPOINT`.
- `executeGraphqlRequest()` sends standard `{ query, variables }` JSON and returns `{ data, errors }`.
- `authToken` becomes `Authorization: Bearer <token>`.
- `managerSessionId` becomes the manager-session header used by riela GraphQL.
- Manager-scoped mutations require both manager session id and auth token.
- GraphQL file/image parameters must use data-root-relative paths, not host absolute paths.
- Attachment files must already exist; the current API does not provide an upload mutation.
- Remote GraphQL execution must not rely on local-only debug features such as `--mock-scenario`.

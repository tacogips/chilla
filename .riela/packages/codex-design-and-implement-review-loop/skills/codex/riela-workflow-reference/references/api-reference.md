# Riela Workflow API Reference

This reference is for programmatic workflow usage through the package root, GraphQL client, and control-plane schema.

## Package Root Exports

Common workflow exports:

- `inspectWorkflow(workflowName, options)`
- `executeWorkflow(input)`
- `resumeWorkflow(input)`
- `rerunWorkflow(input)`
- `continueWorkflowFromHistory(input)`
- `getSession(sessionId, options)`
- `listSessions(options)`
- `getRuntimeSessionView(sessionId, options)`
- `callWorkflowStep(input)`
- `createWorkflowExecutionClient(options)`

GraphQL/server exports:

- `executeGraphqlRequest(request)`
- `createGraphqlSchema(deps?)`
- `executeGraphqlDocument(document, variables?, context?)`
- `startServe(options?)`
- `handleGraphqlRequest(request, options?)`
- `handleApiRequest(request, options?)`

Workflow loading/inspection exports:

- `loadWorkflowFromDisk(workflowName, options)`
- `deriveWorkflowVisualization(args)`

Add-on exports:

- `createNodeAddonPayloadResolver()`
- `createNodeAddonRegistry()`
- `createAsyncNodeAddonPayloadResolver()`
- `createAsyncNodeAddonRegistry()`
- `NodeAddonDefinition`
- `WorkflowNodeAddonRef`
- `NodePayload`
- `ValidationIssue`

## Options

Most library calls accept riela load/session options:

- `workflowRoot`
- `workflowScope`
- `userRoot`
- `projectRoot`
- `addonRoot`
- `artifactRoot`
- `rootDataDir`
- `sessionStoreRoot`
- `env`
- `cwd`
- `nodeAddons`
- `nodeAddonResolvers`
- `asyncNodeAddonResolvers`

Execution-specific options:

- `workflowName`
- `workflowWorkingDirectory`
- `runtimeVariables`
- `mockScenario`
- `dryRun`
- `maxSteps`
- `maxLoopIterations`
- `defaultTimeoutMs`
- `autoImprove`
- `nestedSuperviserDriver`
- `eventReplyDispatcher`

## Unified WorkflowExecutionClient

Use when an application may run local or remote depending on configuration.

```ts
import { createWorkflowExecutionClient } from "riela";

const client = createWorkflowExecutionClient({
  workflowName: "my-workflow",
  workflowRoot: "./examples",
  endpoint: process.env.RIEL_GRAPHQL_ENDPOINT,
  authToken: process.env.RIEL_MANAGER_AUTH_TOKEN,
  managerSessionId: process.env.RIEL_MANAGER_SESSION_ID,
  env: process.env,
});

const result = await client.execute({
  input: {
    humanInput: {
      request: "Do the work",
    },
  },
  maxSteps: 20,
});
```

Behavior:

- If `endpoint` is provided, execution goes through GraphQL.
- If `endpoint` is omitted, execution goes through the local library path.
- `input` and `runtimeVariables` are aliases; use only one.
- `workingDirectory` maps to the workflow execution working directory.
- `async: true` is supported by the GraphQL path and by the local client through the in-process GraphQL schema.

Result shape:

```ts
{
  workflowName: string;
  workflowExecutionId: string;
  sessionId: string;
  status: string;
  accepted?: boolean;
  exitCode?: number;
}
```

## Direct Library Execution

```ts
import { executeWorkflow, getRuntimeSessionView } from "riela";

const run = await executeWorkflow({
  workflowName: "my-workflow",
  workflowRoot: "./examples",
  env: process.env,
  runtimeVariables: {
    humanInput: {
      request: "Do the work",
    },
  },
});

const view = await getRuntimeSessionView(run.sessionId, {
  env: process.env,
});
```

Use direct library calls for embedded applications, local tools, and tests that need in-process access to sessions, runtime rows, logs, hook events, and reply dispatches.

## Resume And Rerun

```ts
import { rerunWorkflow, resumeWorkflow } from "riela";

await resumeWorkflow({
  sessionId: "session-id",
  workflowRoot: "./examples",
  env: process.env,
});

await rerunWorkflow({
  sourceSessionId: "session-id",
  fromStepId: "step-id",
  workflowRoot: "./examples",
  env: process.env,
});
```

Rerun targets are authored step ids.

## GraphQL HTTP Client

```ts
import { executeGraphqlRequest } from "riela";

const response = await executeGraphqlRequest({
  endpoint: "http://127.0.0.1:43173/graphql",
  document: `
    query Workflows($input: WorkflowListInput!) {
      workflows(input: $input) {
        workflows {
          workflowName
          source {
            scope
            workflowDirectory
          }
          description
        }
      }
    }
  `,
  variables: {
    input: {},
  },
  authToken: process.env.RIEL_MANAGER_AUTH_TOKEN,
  managerSessionId: process.env.RIEL_MANAGER_SESSION_ID,
});

if (response.errors?.length) {
  throw new Error(response.errors.map((error) => error.message).join("; "));
}
```

Request fields:

- `endpoint`
- `document`
- `variables`
- `authToken`
- `managerSessionId`
- `fetchImpl`

Transport behavior:

- Sends `POST` with JSON body `{ query, variables }`.
- Adds `content-type: application/json; charset=utf-8`.
- Adds `authorization: Bearer <authToken>` when `authToken` is provided.
- Adds the riela manager-session header when `managerSessionId` is provided.
- Throws for invalid response JSON or non-OK HTTP responses without GraphQL errors.
- Returns GraphQL errors as `response.errors`; callers should check them.

## CLI GraphQL Client

```bash
riela graphql 'query { workflows(input: {}) }'
```

Variables can be inline JSON or a file:

```bash
riela graphql 'query($input: WorkflowListInput!) { workflows(input: $input) { workflows { workflowName } } }' \
  --variables '{"input":{}}'
```

```bash
riela graphql 'query($input: WorkflowListInput!) { workflows(input: $input) { workflows { workflowName } } }' \
  --variables @variables.json
```

Endpoint resolution:

Without `--endpoint`, the command executes in-process against local
project-scoped workflow/session storage. Remote transport uses `--endpoint`,
then `RIEL_GRAPHQL_ENDPOINT`.
3. `http://127.0.0.1:43173/graphql`

Manager auth resolution:

- `--auth-token`
- `--auth-token-env`, defaulting to `RIEL_MANAGER_AUTH_TOKEN`
- `RIEL_MANAGER_SESSION_ID` is forwarded as ambient manager session scope.

## In-Process GraphQL

Use when embedding riela without HTTP:

```ts
import { createGraphqlSchema } from "riela";

const schema = createGraphqlSchema();
const payload = await schema.mutation.executeWorkflow(
  {
    workflowName: "my-workflow",
    runtimeVariables: {
      humanInput: {
        request: "Do the work",
      },
    },
  },
  {
    workflowRoot: "./examples",
    env: process.env,
  },
);
```

Use `executeGraphqlDocument()` when the integration wants GraphQL document execution semantics rather than calling the schema object directly.

## Common GraphQL Operations

Run a workflow:

```graphql
mutation ExecuteWorkflow($input: ExecuteWorkflowInput!) {
  executeWorkflow(input: $input) {
    workflowExecutionId
    sessionId
    status
    accepted
    exitCode
  }
}
```

Resume:

```graphql
mutation Resume($input: ResumeWorkflowExecutionInput!) {
  resumeWorkflowExecution(input: $input) {
    workflowExecutionId
    sessionId
    status
    exitCode
  }
}
```

Rerun:

```graphql
mutation Rerun($input: RerunWorkflowExecutionInput!) {
  rerunWorkflowExecution(input: $input) {
    workflowExecutionId
    sessionId
    status
    exitCode
  }
}
```

Manager message:

```graphql
mutation SendManagerMessage($input: SendManagerMessageInput!) {
  sendManagerMessage(input: $input) {
    managerMessage {
      id
      managerSessionId
      createdAt
    }
  }
}
```

## Manager-Control Rules

- Prefer typed GraphQL manager actions over freeform control prose when `riela graphql` is available.
- Manager-scoped operations require a manager session id and bearer auth token.
- Runtime manager steps mint scoped GraphQL manager context and pass it through environment when supported.
- Manager mutations use persisted idempotency keyed by mutation name, manager session id, and idempotency key.
- Do not mix GraphQL manager messages with payload `managerControl` for the same manager execution.

## File And Attachment Rules

- GraphQL file/image parameters use data-root-relative paths.
- Data-root-relative paths resolve under `RIEL_ARTIFACT_DIR`.
- Manager attachments must stay inside `files/{workflowId}/{workflowExecutionId}/...`.
- Attachment files must already exist before the GraphQL request.
- There is no upload mutation in the current first-iteration API.

## Selection Guide

Use direct library APIs when:

- The integration runs in the same process as riela.
- You need direct access to session state, runtime database rows, or custom add-on resolvers.
- You are writing local tests or developer tools.

Use `createWorkflowExecutionClient()` when:

- You want one execution abstraction for local and remote.
- You may later move execution behind `riela serve`.

Use GraphQL when:

- Crossing process or host boundaries.
- Implementing manager control-plane operations.
- Building automation that should align with the served API.

Use `riela graphql` when:

- Running from shell scripts.
- Giving manager agents a generic control-plane tool.
- Debugging GraphQL documents interactively.

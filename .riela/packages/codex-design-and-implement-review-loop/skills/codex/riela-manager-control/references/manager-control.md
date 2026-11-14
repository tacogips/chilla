# Riela Manager Control Reference

## Transport

`riela graphql` sends GraphQL documents to:

Without `--endpoint`, it executes against the local in-process GraphQL schema
using project-scoped workflow/session storage. Remote transport uses:

1. `--endpoint`
2. `RIEL_GRAPHQL_ENDPOINT`

Auth:

- `Authorization: Bearer <token>` from `--auth-token` or `RIEL_MANAGER_AUTH_TOKEN`
- manager-session header from `RIEL_MANAGER_SESSION_ID`

## Control Actions

Use typed manager actions for:

- planner notes
- retrying a step
- replaying communication
- executing optional steps
- skipping optional steps
- manager-authored routing decisions supported by the current schema

Removed/invalid patterns:

- node-id action aliases
- structural `start-sub-workflow`
- structural `deliver-to-child-input`
- freeform text as the only source of privileged control

## Idempotency

Manager mutations are idempotent by mutation name, manager session id, and idempotency key. Generate stable idempotency keys for retries.

## Attachments

- File/image references are data-root-relative, not host absolute paths.
- Manager attachments must stay inside `files/{workflowId}/{workflowExecutionId}/...`.
- Attachment files must already exist before the request.
- There is no upload mutation in the current first-iteration API.

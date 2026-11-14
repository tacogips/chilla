# Riela Event Sources Runbook

## Commands

Validate:

```bash
riela events validate --workflow-definition-dir ./examples --event-root ./examples/event-sources/.riela-events
```

Emit fixture:

```bash
riela events emit <source-id> \
  --workflow-definition-dir ./examples \
  --event-root ./examples/event-sources/.riela-events \
  --event-file ./examples/event-sources/payloads/chat-message.json \
  --mock-scenario ./examples/<workflow-name>/mock-scenario.json
```

Serve listeners:

```bash
riela events serve --workflow-definition-dir ./examples --event-root ./examples/event-sources/.riela-events
```

List receipts:

```bash
riela events list --source <source-id> --limit 20
```

Replay:

```bash
riela events replay <receipt-id> --reason "operator retry"
```

## Event Root

Event source configuration is loaded from `.riela-events` next to the workflow root unless `--event-root` is provided.

Use event fixtures to verify:

- source matching
- input mapping
- dedupe behavior
- supervised workflow dispatch
- reply adapter behavior

## Modes

Local command dispatch can start workflow execution directly.

With `--endpoint`, event dispatch goes through GraphQL and can run as a lightweight listener process.

Read-only mode validates and records incoming events without dispatching workflow execution.

## Discord Gateway

Use `kind: "discord-gateway"` when riela should own Discord Gateway
ingestion instead of receiving generic Chat SDK Discord webhooks. Configure
`tokenEnv`, `applicationIdEnv`, `channels`, `history`, and `filters` in the
source JSON. The runner listens to configured channels or threads, filters bot
and self messages by default, normalizes accepted Discord messages to
`chat.message`, and attaches bounded channel or thread context to
`event.input.history`.

Example local validation:

```bash
riela events validate --workflow-definition-dir ./examples --event-root ./examples/event-sources/.riela-events
riela events emit discord-gateway-personas \
  --workflow-definition-dir ./examples \
  --event-root ./examples/event-sources/.riela-events \
  --event-file ./examples/event-sources/payloads/discord-gateway-message-with-history.json \
  --read-only \
  --output json
```

For live serving, provide the env vars named by the source config, such as
`RIEL_DISCORD_BOT_TOKEN` and `RIEL_DISCORD_APPLICATION_ID`. Enable Discord
Message Content intent when persona workflows need message text. The first
slice keeps history bounded by count, age, and byte limits; durable
cross-restart history, sharding, slash commands, components, moderation events,
and attachment ingestion are outside the current contract.

## Sequential Lists

Use `kind: "sequential-list"` for ordered prompt dispatch. Configure a
non-empty ordered `entries` array where each entry has a stable `id`, a
non-empty `prompt`, and optional JSON-object `metadata`.

`events serve` emits one `sequential-list.item.ready` event for the current
entry, waits for that entry's workflow execution or supervised run to reach a
terminal state, persists cursor state, then dispatches the next entry. Restarted
listeners resume from the persisted cursor for the same source/config revision.

Receipts are normal event receipts. `events list --source <source-id> --output
json` exposes the normalized event payload, including `event.input.sequence`
metadata such as source id, config revision id, run id, item id, index, total,
and prior item references. `events replay <receipt-id>` replays only that
persisted item with a replay-specific event id and does not reset or advance
the sequence cursor.

In read-only mode, sequential-list sources persist skipped receipts and sequence
state without dispatching workflow execution. The durable cursor remains on the
undispatched item so a later non-read-only `events serve` can process it.

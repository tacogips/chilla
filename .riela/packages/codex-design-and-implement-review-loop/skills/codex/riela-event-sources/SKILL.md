---
name: riela-event-sources
description: Use when configuring, validating, emitting, serving, listing, replaying, or troubleshooting riela external event sources. Applies to .riela-events, events validate/emit/serve/list/replay, webhook/chat/cron/sequential-list/discord-gateway/telegram-gateway bindings, event-to-workflow input mapping, supervised event execution, mock scenarios for events, ordered prompt dispatch, chat replies, and event receipt inspection.
metadata:
  short-description: Use riela event sources
---

# Riela Event Sources

Use this skill for event-driven workflow usage. For direct workflow execution use `riela-workflow-run`.

Supported local source kinds include webhook/chat, cron, Matrix, Chat SDK,
Discord Gateway, Telegram Gateway, S3 metadata bridge, file-change directory
watchers, and sequential instruction lists. `discord-gateway` sources run under
`events serve`, listen to configured Discord channels or threads, ignore bot
and self messages by default, attach bounded recent channel or thread history
to `event.input.history`, and reply through chat destinations without requiring
an external Chat SDK Discord deployment. `telegram-gateway` sources run under
`events serve`, poll Telegram Bot API `getUpdates`, filter configured chats,
normalize text and photo messages to `chat.message`, attach bounded persisted
chat history to `event.input.history`, expose photo descriptors through
`event.input.attachments`, and reply through Telegram `sendMessage` via chat
destinations without requiring an external Chat SDK Telegram deployment.
`file-change` sources run under `events serve`, watch a configured directory,
and emit `file.change.created`, `file.change.modified`, or
`file.change.deleted` for enabled `changeTypes`. `sequential-list` sources run
under `events serve`, emit one configured prompt entry at a time, and wait for
the previous workflow execution or supervised run to reach a terminal state
before dispatching the next entry.

## Common Flow

```bash
riela events validate --workflow-definition-dir <root> --event-root <event-root>
```

```bash
riela events emit <source-id> \
  --workflow-definition-dir <root> \
  --event-root <event-root> \
  --event-file payload.json \
  --mock-scenario <root>/<workflow-name>/mock-scenario.json
```

```bash
riela events serve --workflow-definition-dir <root> --event-root <event-root>
```

Read `references/events-runbook.md` for event roots, local fixtures, receipts, and replay.

## Rules

- Use `--event-root` explicitly unless the repository convention is obvious.
- Use `--mock-scenario` for deterministic local event dispatch.
- Do not combine local mock scenarios with remote `--endpoint`.
- Use `RIEL_EVENTS_READ_ONLY=true` or `--read-only` to validate and persist receipts without dispatch.
- Use `events list` and `events replay` for operator receipt workflows.
- For `discord-gateway`, keep bot token and application id as env-var references in source config, enable Discord Message Content intent when workflows need message text, and use bounded history settings instead of workflow message storage or agent transcript history.
- For `telegram-gateway`, keep bot token and bot id as env-var references in source config, use configured chats for scoped serving, and keep bounded persisted history separate from workflow message storage, agent transcripts, raw Bot API payloads, and credentials.
- For Discord, Telegram, and Matrix chat workflows, prefer normalized `chat.message` input plus `riela/chat-reply-worker`; use `riela/chat-persona-router` when provider-neutral persona selection is needed.
- For `sequential-list`, inspect sequence metadata in normalized receipts; `events replay <receipt-id>` replays one persisted item and does not reset the sequence cursor.

---
name: riela-node-addons
description: Use when using, reviewing, or implementing riela node add-ons. Applies to workflow.nodes[].addon, built-in riela add-ons, local scoped add-ons, third-party add-on resolvers, addon.config, addon.inputs, addon.env, node add-on validation, and add-on-backed worker nodes.
metadata:
  short-description: Use riela node add-ons
---

# Riela Node Add-Ons

Use this skill for add-on-backed workflow node registry entries.

## Built-In Add-Ons

Current built-ins, version `1`:

- `riela/chat-reply-worker`
- `riela/chat-persona-router`
- `riela/codex-worker`
- `riela/claude-code-worker`
- `riela/workflow-package-sandbox-review`
- `riela/x-gateway-read`
- `riela/x-gateway`
- `riela/gmail-gateway-read`
- `riela/gmail-gateway`
- `riela/git-commit`
- `riela/git-push`

Read `references/addons-reference.md` for field contracts and resolver guidance.

## Authoring Pattern

```json
{
  "id": "reply",
  "addon": {
    "name": "riela/chat-reply-worker",
    "version": "1",
    "config": {
      "textTemplate": "Thanks {{event.actor.displayName}}.",
      "visibility": "public",
      "threadPolicy": "same-thread"
    },
    "inputs": {}
  }
}
```

## Rules

- A registry entry declares exactly one of `nodeFile` or `addon`.
- Add-on-backed nodes do not have local `nodes/node-*.json` payloads.
- Add-ons are worker-only; manager steps must reference file-backed nodes.
- Use explicit object form with `version`.
- `riela/` names are reserved for built-ins.
- `addon.inputs` becomes resolved node `variables`.
- `addon.config` is validated by the add-on descriptor.
- `addon.env` is explicit; ambient environment variables are not forwarded implicitly.
- Executable add-ons that return runtime output JSON must use a real JSON
  encoder and declare required runtime tools in `execution.runtimeHints`.
- Use `riela/chat-persona-router` for provider-neutral chat persona
  selection instead of Discord-, Telegram-, or Matrix-specific routing prompts.
- Use `riela/chat-reply-worker` for chat replies so provider destinations own
  Discord Gateway, Telegram Gateway, Matrix, or Chat SDK send behavior.

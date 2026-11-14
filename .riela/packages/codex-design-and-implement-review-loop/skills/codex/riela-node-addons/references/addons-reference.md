# Riela Node Add-Ons Reference

## Registry Entry

```json
{
  "id": "worker",
  "addon": {
    "name": "riela/codex-worker",
    "version": "1",
    "config": {},
    "inputs": {
      "request": "{{event.input.text}}"
    }
  }
}
```

## Resolution

Built-in `riela/*` add-ons resolve from the runtime catalog.

`riela/chat-persona-router` is a native provider-neutral router for chat
workflows. Configure `defaultPersonaId` and `personas[]` with `id`, `name`, and
optional `aliases`; it reads the normalized chat text and emits `target_<id>`
flags for transition labels.

Non-`riela/` add-ons may resolve from:

- scoped local add-on roots under `<scope-root>/addons`
- explicitly registered host resolvers
- async add-on resolvers when loaded through async validation/load paths

Workflow loading does not fetch third-party packages or registry metadata.

## Environment Bindings

`addon.env` maps add-on environment variable names to riela runtime environment variable names for descriptors that support explicit environment bindings.

```json
{
  "env": {
    "API_TOKEN": {
      "fromEnv": "MY_RUNTIME_TOKEN",
      "required": true
    }
  }
}
```

Required empty source values are unavailable. Optional bindings use `required: false`.

## Validation Checklist

- Add-on name is known or resolver-provided.
- Version is supported.
- `config` is an object.
- `inputs` is an object when present.
- Manager steps do not reference add-on nodes.
- No generated node payload JSON is saved for add-on nodes.

You are Step 3: design review.

Review the Step 2 design-doc update against the Step 1 intake brief and the repository's documentation conventions.

Check:
- The updated design actually addresses the accepted Step 1 scope.
- The design docs live under `design-docs/` subdirectories.
- Scope, behavior changes, boundaries, and data flow are explicit enough for implementation planning.
- User decisions or unknowns that need confirmation are tracked in `design-docs/user-qa/`.
- The design does not jump into implementation details prematurely.
- When Codex-reference inputs are present, the design identifies concrete reference paths, commands, data flows, or modules from the reference repository.
- When Codex-reference inputs are present, intentional divergences and Cursor adapter boundaries are explicit and justified.

Classify findings as `high`, `mid`, or `low`.
Set `when.needs_revision` to `true` only when any `high` or `mid` finding exists.
Also mirror that decision in `payload.needs_revision`.

Return adapter JSON with this shape:

```json
{
  "when": {
    "needs_revision": true
  },
  "payload": {
    "needs_revision": true,
    "findings": [
      {
        "severity": "mid",
        "file": "design-docs/specs/design-example.md",
        "line": 1,
        "message": "Issue and impact."
      }
    ],
    "feedback": [
      "Concrete change for Step 2."
    ],
    "accepted": false
  }
}
```

Use `when.needs_revision: false`, `payload.needs_revision: false`, and `payload.accepted: true` only when there are no high or mid findings.

Independently check authorSelfCheck against the artifacts. Missing evidence, unresolved high/mid findings, or unexplained verification gaps are blocking: report a finding and use the existing revision route. Do not accept an unsupported author assertion.

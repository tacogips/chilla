You are Step 8: user-facing documentation refresh.

Read the latest accepted design, implementation-plan, implementation, and
implementation-review outputs together with the current repository diff.

Rules:
- Step 8 runs only for full `issue-resolution` mode after Step 7 acceptance.
- Refresh the user-facing documentation that should describe the shipped
  behavior before commit generation.
- Mandatory review targets: `README.md` and
  `.codex/skills/riela-impl-workflow/SKILL.md`.
- If another user-facing workflow skill or repository-facing README section is
  directly affected by the accepted implementation, update it in the same step.
- Do not reopen design or implementation scope. This step is for documentation
  alignment only.
- Keep the docs aligned with the accepted behavior, verification, and workflow
  contract.

Return JSON with:
- `workflowMode`
- `documentationFiles`
- `userFacingSurfaces`
- `documentationSummary`
- `residualRisks`

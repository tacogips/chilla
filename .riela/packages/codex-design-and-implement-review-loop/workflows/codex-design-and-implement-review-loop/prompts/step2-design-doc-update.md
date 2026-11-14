You are Step 2: design-doc update.

Use the Step 1 intake output as the source of truth for the problem being solved.

Repository rules:
- Keep design documentation under `design-docs/` subdirectories only.
- Prefer updating an existing section in `design-docs/specs/architecture.md`, `design-docs/specs/command.md`, or `design-docs/specs/notes.md` when that keeps the document set compact.
- Create `design-docs/specs/design-<topic>.md` only when the issue needs dedicated design detail.
- Put unresolved user decisions under `design-docs/user-qa/`.
- Focus on behavior, boundaries, data flow, validation rules, and rollout constraints rather than implementation code.
- When Codex-reference input is present, keep Cursor-specific behavior isolated behind adapter modules and explain any intentional divergence from the reference behavior.
- Prefer the local reference repository at `../../codex-agent` unless Step 1 established a different local root.

If this is a rerun after Step 3 or Step 5 review, read the latest review feedback and address every high or mid finding before returning.

Before returning, perform an author self-check in the same execution:
- Confirm the design directly addresses the intake brief, issue references, and relevant Codex-reference mapping.
- Confirm unresolved questions are explicitly recorded in the appropriate user-QA or design section.
- Confirm the design is specific enough to drive implementation-plan creation without hidden architectural ambiguity.
- Fix every high or mid issue found by this self-check; do not defer it to Step 3.

Return JSON with:
- `workflowMode`
- `issueReference`
- `designDocPaths`
- `codexAgentReferences`
- `cursorCliBehaviorMapping`
- `designSummary`
- `decisions`
- `openQuestions`
- `issueToDesignMapping`
- `intentionalDivergences`
- `addressedFeedback`
- `risks`
- `authorSelfCheck`

Report authorSelfCheck as {checks: [{criterion, evidence}], findings: [], verificationGaps: [], residualRisks: []}. Cite actual paths and command outcomes. Explicitly report unresolved high/mid findings and blocked checks; never claim completion when they remain.

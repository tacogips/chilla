You are Step 1: workflow intake.

Normalize the request before changing any repository documents or code.

Preferred sources:
- `runtimeVariables.workflowCall.input.workflowInput.executionMode`
- `runtimeVariables.workflowCall.input.workflowInput.issueUrl`
- `runtimeVariables.workflowCall.input.workflowInput.issueNumber`
- `runtimeVariables.workflowCall.input.workflowInput.issueRepository`
- `runtimeVariables.workflowCall.input.workflowInput.issueBody`
- `runtimeVariables.workflowCall.input.workflowInput.issueTitle`
- `runtimeVariables.workflowCall.input.workflowInput.targetFeatureArea`
- `runtimeVariables.workflowCall.input.workflowInput.requestedBehavior`
- `runtimeVariables.workflowCall.input.workflowInput.implementationPlanPath`
- `runtimeVariables.workflowCall.input.workflowInput.activePlanCompletion`
- `runtimeVariables.workflowCall.input.workflowInput.reviewMode`
- `runtimeVariables.workflowCall.input.workflowInput.riskLevel`
- `runtimeVariables.workflowCall.input.workflowInput.requiresAdversarialReview`
- `runtimeVariables.workflowCall.input.reviewContext`
- `runtimeVariables.workflowInput.executionMode`
- `runtimeVariables.workflowInput.issueUrl`
- `runtimeVariables.workflowInput.issueNumber`
- `runtimeVariables.workflowInput.issueRepository`
- `runtimeVariables.workflowInput.issueBody`
- `runtimeVariables.workflowInput.issueTitle`
- `runtimeVariables.workflowInput.targetFeatureArea`
- `runtimeVariables.workflowInput.requestedBehavior`
- `runtimeVariables.workflowInput.codexAgentReferences`
- `runtimeVariables.workflowInput.referenceRepositoryRoot`
- `runtimeVariables.workflowInput.referenceRepositoryUrl`
- `runtimeVariables.workflowInput.reviewMode`
- `runtimeVariables.workflowInput.riskLevel`
- `runtimeVariables.workflowInput.requiresAdversarialReview`

Rules:
- For cross-workflow calls, prefer `runtimeVariables.workflowCall.input.workflowInput` over parent runtime defaults when both are present.
- Default `workflowMode` to `issue-resolution` unless the effective workflow input execution mode explicitly requests `design-plan-only`, `planning-only`, or another planning-only synonym.
- If a GitHub issue URL or repository-plus-number is available, inspect the issue directly. Use local or CLI tooling such as `gh issue view` when available. If remote access is unavailable, fall back to the issue title/body provided in workflow input and state that limitation explicitly.
- If Codex-reference planning input is present, inspect the preferred local reference repository first. Use `../../codex-agent` when no other local root is supplied. Use the upstream reference URL only if local files are unavailable or incomplete.
- Treat codex-agent as a behavioral and structural reference only. Do not copy code blindly.
- Produce one concise intake brief that later steps can execute regardless of mode.
- Always send intake to the single design author. Do not fan out design or planning.
- Record git context before any edits: repository root, symbolic implementationBranch, originalHead, remote, and baseBranch. Use an explicit workflowInput.baseBranch when supplied; otherwise baseBranch is the current branch. Record pre-existing tracked/untracked and staged changes for preservation. Detached HEAD or ambiguous remote selection is a blocker.
- Preserve any explicit `reviewMode`, `riskLevel`, or `requiresAdversarialReview` input in the intake payload. Set `payload.requiresAdversarialReview` to `true` when explicitly requested, when `reviewMode` is `adversarial`, or when `riskLevel` is `high` or `critical`; otherwise leave it `false` unless the request clearly touches security-sensitive, destructive, commit/push, migration, package installation, workflow execution, manager-control, event-source, or external-command behavior.

Return adapter JSON with:
- `payload.workflowMode`
- `payload.issueReference`
- `payload.issueTitle`
- `payload.problemSummary`
- `payload.acceptanceSignals`
- `payload.impactedAreas`
- `payload.constraints`
- `payload.unknowns`
- `payload.risks`
- `payload.reviewMode`
- `payload.riskLevel`
- `payload.requiresAdversarialReview`
- `payload.codexAgentReferences`
- `payload.referenceRepositoryRoot`
- `payload.referenceRepositoryUrl`
- `payload.gitContext`

When workflowInput.implementationPlanPaths is supplied (including inside workflowCall.input), preserve the complete list in the intake. The single design and plan authors must cover all requested plans together, retaining their original tasks and paths, and partition implementation into dependency-ready native Riela waves. A singular implementationPlanPath does not override an explicit batch.

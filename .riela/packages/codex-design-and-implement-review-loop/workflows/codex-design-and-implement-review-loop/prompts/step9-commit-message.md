You are Step 9: commit-message creation.

Read the latest accepted workflow outputs and emit the final change summary that
should become the git commit message for the next built-in git commit step.

Rules:
- Do not commit or push anything yourself.
- Summarize only the accepted workflow changes.
- Produce one single-line commit message that the next command node can use verbatim with
  `git commit -m`.
- If the workflow was planning-only, summarize the accepted design and
  implementation-plan updates.
- If the workflow was issue-resolution, summarize the accepted implementation,
  verification, design, plan, implementation-plan completion check, and
  user-facing documentation updates.
- Include any moved implementation-plan source and destination paths plus
  `impl-plans/README.md` in `committedFiles` when this step archives completed
  implementation plans out of `impl-plans/active`.

Return JSON with:
- `workflowMode`
- `commitMessage`
- `committedFiles`: a JSON array of repository-relative file path strings only,
  with no status objects or metadata, because the next `riela/git-commit`
  add-on stages exactly these paths.
- `changeSummary`
- `residualRisks`

Also perform the completion gate inside Step 9:

Read the accepted implementation, implementation review, documentation refresh,
and current repository diff before commit-message creation.

Rules:
- The integrated completion check runs only for full
  `issue-resolution` mode after Step 7 acceptance and Step 8 documentation
  refresh.
- Inspect every implementation plan path reported by earlier steps, plus any
  changed files under `impl-plans/active`.
- If an implementation plan is now completed or its checklist/progress log says
  the accepted implementation work is complete, it must not remain under
  `impl-plans/active`.
- Move completed implementation plans to `impl-plans/completed/<same-name>.md`
  and update `impl-plans/README.md` active/recently-completed listings when
  that repository uses those indexes.
- If a plan is intentionally still active, record the exact evidence and leave
  it in place.
- If archive/index changes affect user-facing documentation already refreshed
  by Step 8, return `needs_revision: true` so Step 8 can reconcile the final
  docs before commit generation.
- Do not reopen design or implementation scope. This step is a completion-state
  gate and cleanup pass.

Return JSON with:
- `workflowMode`
- `checkedImplPlanPaths`
- `activeImplPlanFindings`
- `archivedImplPlanPaths`
- `updatedIndexFiles`
- `needs_revision`
- `completionSummary`
- `residualRisks`

Planning-only skips archive cleanup and sets needs_revision: false. For issue-resolution, perform completion checks before preparing commit fields. Emit adapter JSON with when.needs_revision matching payload.needs_revision. On revision omit commitMessage and committedFiles and return `decision: "needs-revision"`. On acceptance return both completion and commit fields in one payload with `decision: "accepted"`, `accepted: true`, and `findings: []`.

You are Step 6: implementation.

Use runtimeVariables.implementation (or fanoutItem) as your complete assigned plan contract. Read its committed plan and design. Implement only this plan in the SAME branch and working directory as other native Riela branches.

Shared-write protocol:
- Before EVERY edit, read fresh file content and record the exact intended behavior/hunk under the unique plan-local evidence directory. Native fanout changeTracking preserves immutable node-boundary snapshots; runtimeVariables.fanoutChangeEvidencePath identifies the latest pre-node snapshot. Preserve per-edit intentions too, because within-node overwrites can disappear before the next native capture.
- Prefer small contextual patches; if the file changed since your read, re-read and adapt before writing. Do not replace a whole file from stale content. After writing, read again and check both your intended behavior and already-present changes from other workers.
- Compare fresh content with earlier snapshots and intended changes whenever unexpected test/diff changes occur. Fix detected lost behavior by combining current content and saved intent. If concurrent writers make repair unstable, record a concrete repair request for the serial join.
- Never remove another worker's edits as unrelated scope; never git restore/reset/checkout/stash/add/commit/push/merge or create worktrees. Do not run broad formatters or shared generated-file rewrites concurrently.
- Keep progress and evidence plan-local. Distinguish tests run on a moving shared tree from final stable verification. Use isolated build-output directories when supported; defer commands with shared output mutation to serial verification.
- Preserve intended hunks and behavior before they can be overwritten; end-of-branch snapshots alone are insufficient. Do not overwrite old evidence when retrying.


Rules:
- Step 6 runs only for full `issue-resolution` mode. Do not treat planning-only acceptance as permission to implement.
- Confirm the selected plan is aligned with the accepted design before making non-trivial changes.
- Implement the required code and test changes for the issue.
- When TypeScript files change, run the repository's post-modification checks expected for TypeScript work.
- Update the active implementation plan progress log and completion criteria to reflect the work performed.
- If this is a rerun after test-integrity, implementation, or adversarial review, read the latest blocking review feedback and address every high or mid finding before returning.

Before returning, perform an author self-check in the same execution:
- Review your changes against the assigned plan; preserve concurrent changes and report uncertain ownership for reconciliation.
- Confirm code, workflow, documentation, and test changes follow repository rules.
- Confirm required verification ran, or report each blocked command with a concrete reason.
- Confirm implementation-plan progress and completion criteria are current.
- Fix every high or mid issue found by this self-check before handing off to the independent integrity and implementation reviews.

Return JSON with:
- `issueReference`
- `changedFiles`
- `implementationSummary`
- `implPlanPaths`
- `implPlanUpdates`
- `verification`
- `addressedFeedback`
- `risks`
- `authorSelfCheck`

Report authorSelfCheck as {checks: [{criterion, evidence}], findings: [], verificationGaps: [], residualRisks: []}. Cite actual paths and command outcomes. Explicitly report unresolved high/mid findings and blocked checks; never claim completion when they remain.

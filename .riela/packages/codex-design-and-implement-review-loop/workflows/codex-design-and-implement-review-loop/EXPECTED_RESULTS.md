# Expected results

Use the paired Riela source build and workflow validate/inspect with --workflow-definition-dir pointing to the package workflows directory. Run each bundled mock scenario with an isolated --session-store and --artifact-root; no live models or Git mutations are executed.

- mock-scenario.json: completed, exitCode 0. Single design/plan authors retain revision loops. plan-git-commit precedes native implementation/review fanout. Each branch stops before reconcile-implementations. integration-review accepts the combined design/implementation before final Git operations.
- mock-scenario-fanout.json: two items become two fanout branches, joined in input order. Both implementation/review subpaths run; the parent performs reconciliation and finalization once. No feature-local planning fanout.
- mock-scenario-planning-only.json: completed, exitCode 0. No dispatch-plans, implementation or reconciliation; plans remain active, final documentation commit/push and base integration run.

Native join returns branchId/status/sessionId/output, dispatchedBranchIds, pendingBranchIds, completedBranchIds and changeEvidence. Drift is a candidate requiring semantic review. Failed branches remain pending and block final completion. Ignore timestamps, generated IDs and artifact paths.

Maintainer regressions: RIELA_BIN=<paired-build>/riela bun .agents/skills/riela-package-release/scripts/check-compact-workflows.ts. Includes completion and integrity revision, planning-only and Fable implementation review loops. Engine tests cover concurrency/failure policies, dependency waves and native change evidence.

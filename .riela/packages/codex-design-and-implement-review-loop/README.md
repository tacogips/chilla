# codex-design-and-implement-review-loop

Codex design/implementation workflow with native shared-branch fanout and overwrite reconciliation.

Design and implementation-plan authoring use GPT-6 Astra. Implementation and overwrite repair use GPT-5.6 SOL at low effort. Design, plan, test-integrity, implementation, adversarial, and combined-tree reviews use GPT-5.6 SOL at medium effort. Reviews emit feedback only for concrete security, functionality, data-integrity, regression, acceptance, or severe code-quality risks; speculative optimization and overengineering are explicitly excluded.

- Package id: `codex-design-and-implement-review-loop`
- Backends: `codex-agent`
- Workflows: `codex-design-and-implement-review-loop`
- Skills: Codex (`codex-design-and-implement-review-loop`)

## Install

From your project directory, with a local checkout of this registry:

```bash
riela package install codex-design-and-implement-review-loop --local-path /path/to/riela-packages
```

Add `--scope user` to install for the current user instead of the
current project.

## Run

Inspect the workflow inputs and structure, then run it:

```bash
riela workflow inspect codex-design-and-implement-review-loop --output json
riela workflow validate codex-design-and-implement-review-loop
riela workflow run codex-design-and-implement-review-loop --output jsonl
```

See the [registry README](../../README.md) for the full package index
and the recommended install flow.

## Shared-branch implementation

Design and all implementation plans are authored by a single author node per phase. Accepted designs/plans are committed before implementation. Native Riela fanout runs dependency-ready implementation/review branches in the same working directory and Git branch (default concurrency 4; --max-concurrency can lower it). No worktrees are created.

The runtime calls each parallel execution a **fanout branch**, its input an **item**, and the aggregation a **join**. This is separate from a Git branch. Built-in fanout.dependencies selects ready branches from stable IDs and accepted dependencies. Built-in fanout.changeTracking captures immutable file content, hashes and modes at node boundaries, and reports drift candidates at join. No workflow-local evidence script is needed.

After all branches stop, serial reconciliation repairs missing/overwritten behavior and independent integration review checks the combined tree against every plan and the design. Failed branches stay pending; already accepted branch IDs are skipped on subsequent dispatch. Preserve original evidence and existing user changes. Node-boundary snapshots cannot detect every transient overwrite inside an agent call, so per-edit intention records and behavior tests remain required.

Git operations are serialized: planning checkpoint, final implementation commit/push, and base-branch integration. workflowInput.baseBranch defaults to the current branch; an explicit different base is merged only after combined verification. No force push or automatic discard of unrelated edits. A blocked merge/push prevents completion.

Requires a Riela build with fanout.dependencies, fanout.changeTracking and shared-branch finalization evidence support. The explicit shared-workspace ownership mode makes older runners reject the new bundle instead of silently ignoring its dependency/tracking fields. Use the paired Riela source changes before installing this update.

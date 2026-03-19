---
name: secure-github-action
description: Use this skill when creating or modifying GitHub Actions workflow files (.github/workflows/*.yml). Ensures all actions are pinned by commit SHA, permissions are minimized, script injection is prevented, and other supply chain security best practices are applied.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
argument-hint: [workflow description or file path]
user-invocable: true
---

# Secure GitHub Action Workflow

When creating or modifying a GitHub Actions workflow, follow ALL steps below. Read `references/security-rules.md` for the full rule set.

## Mandatory Workflow

### Step 1: Pin ALL action references to full commit SHAs

For every `uses:` line, resolve the tag/branch to its full 40-character commit SHA.

**How to resolve SHAs:**

```bash
# For a tagged release (e.g. actions/checkout@v4.2.2)
gh api repos/{owner}/{repo}/git/ref/tags/{tag} --jq '.object.sha'

# If the above returns a tag object (not commit), dereference it:
gh api repos/{owner}/{repo}/git/tags/{tag_sha} --jq '.object.sha'

# For a branch reference (e.g. @main)
gh api repos/{owner}/{repo}/git/ref/heads/{branch} --jq '.object.sha'
```

**Always check the latest stable release first:**

```bash
gh api repos/{owner}/{repo}/releases/latest --jq '.tag_name'
```

**Output format** - always add a human-readable version comment:

```yaml
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

### Step 2: Set minimal permissions

```yaml
# Workflow-level: default to read-only or nothing
permissions:
  contents: read

# Job-level: override only where needed
jobs:
  deploy:
    permissions:
      contents: write
      deployments: write
```

- Use `permissions: {}` for jobs needing no GitHub API access
- Never use `permissions: write-all`
- Prefer job-level over workflow-level permissions

### Step 3: Harden checkout

```yaml
- uses: actions/checkout@{SHA} # vX.Y.Z
  with:
    persist-credentials: false  # unless the job needs to push
```

Set `persist-credentials: false` for all jobs that do NOT need to `git push`.

### Step 4: Prevent script injection

**NEVER** interpolate `${{ github.event.* }}` directly in `run:` blocks. Use `env:` intermediaries:

```yaml
# BAD - shell injection via PR title
- run: echo "${{ github.event.pull_request.title }}"

# GOOD - safe via env variable
- env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: echo "$PR_TITLE"
```

Dangerous contexts: `github.event.issue.title`, `.body`, `github.event.pull_request.title`, `.body`, `.head.ref`, `github.event.comment.body`, `github.event.commits.*.message`, `github.head_ref`.

### Step 5: Avoid `pull_request_target` pitfalls

- Prefer `pull_request` over `pull_request_target`
- If `pull_request_target` is used, NEVER checkout `${{ github.event.pull_request.head.sha }}`
- For privileged operations on PR code, use the two-workflow pattern (unprivileged `pull_request` + `workflow_run`)

### Step 6: Apply additional hardening

- **Timeouts**: always set `timeout-minutes` on jobs
- **Concurrency**: add concurrency groups for deployments (`cancel-in-progress: false`) and CI (`cancel-in-progress: true`)
- **Secrets**: never use `secrets: inherit` in reusable workflows; pass secrets explicitly
- **Artifacts**: never upload artifacts containing secrets or tokens
- **OIDC**: prefer OIDC over long-lived secrets for cloud provider auth

### Step 7: Validate before finalizing

After generating the workflow, verify:
1. Every `uses:` line has a full 40-char SHA (no `@v4`, `@main`, `@latest`)
2. `permissions:` block exists at workflow or job level
3. No `${{ github.event.* }}` appears directly in any `run:` block
4. `persist-credentials: false` is set where push is not needed
5. `timeout-minutes` is set on all jobs

## Arguments

If `$ARGUMENTS` is a file path, read it and apply hardening. If it's a description, create a new workflow following all rules above.

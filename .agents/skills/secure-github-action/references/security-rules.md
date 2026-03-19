# GitHub Actions Security Rules - Complete Reference

## 1. Supply Chain Attack Prevention

### 1.1 Pin all actions to full-length commit SHAs
Never use mutable tag references (`@v3`, `@main`). Tags can be force-pushed to point to malicious commits (tj-actions/changed-files CVE-2025-30066, 23,000+ repos affected).

```yaml
# BAD
uses: actions/checkout@v4
uses: some-action@main

# GOOD
uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

### 1.2 Resolve SHAs correctly
Some tags are annotated (point to a tag object, not a commit). Always dereference:

```bash
# Step 1: Get the ref
SHA=$(gh api repos/{owner}/{repo}/git/ref/tags/{tag} --jq '.object.sha')
TYPE=$(gh api repos/{owner}/{repo}/git/ref/tags/{tag} --jq '.object.type')

# Step 2: If it's a tag object, dereference to commit
if [ "$TYPE" = "tag" ]; then
  SHA=$(gh api repos/{owner}/{repo}/git/tags/$SHA --jq '.object.sha')
fi
```

### 1.3 Check for latest stable release
Always use the latest stable release, not an arbitrary old tag:

```bash
gh api repos/{owner}/{repo}/releases/latest --jq '.tag_name'
```

### 1.4 Vet third-party actions before adoption
- Audit the source code for secret transmission, unexpected network calls
- Check the action's OpenSSF Scorecard score (https://scorecard.dev/)
- Prefer actions from verified creators on GitHub Marketplace
- Audit the internal `action.yml` for transitive unpinned dependencies

### 1.5 Enable Dependabot for actions
Configure `.github/dependabot.yml` to receive alerts for action vulnerabilities:

```yaml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

### 1.6 Pin reusable workflows to SHAs too

```yaml
uses: org/shared-workflows/.github/workflows/deploy.yml@abc123def456...
```

## 2. Permission Hardening

### 2.1 Default to minimal permissions
Set the default at workflow level:

```yaml
permissions:
  contents: read
```

### 2.2 Use job-level permissions for granularity
Job-level `permissions:` blocks restrict the token scope to only that job:

```yaml
jobs:
  build:
    permissions:
      contents: read
  deploy:
    permissions:
      contents: write
      deployments: write
```

### 2.3 Use empty permissions for isolated jobs

```yaml
jobs:
  lint:
    permissions: {}
    # This job has zero GITHUB_TOKEN access
```

### 2.4 Never grant `permissions: write-all`

### 2.5 Prefer OIDC over long-lived secrets
Use GitHub's OIDC provider for AWS, Azure, GCP, Vault:

```yaml
permissions:
  id-token: write  # Required for OIDC
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@{SHA}
    with:
      role-to-assume: arn:aws:iam::123456789:role/deploy
      aws-region: us-east-1
```

### 2.6 Disable Actions PR creation/approval
In repo settings, disable "Allow GitHub Actions to create and approve pull requests".

## 3. Script Injection Prevention

### 3.1 Dangerous contexts (NEVER use directly in `run:`)

All of these can contain attacker-controlled content:

| Context | Risk |
|---------|------|
| `github.event.issue.title` | Issue author controls |
| `github.event.issue.body` | Issue author controls |
| `github.event.pull_request.title` | PR author controls |
| `github.event.pull_request.body` | PR author controls |
| `github.event.pull_request.head.ref` | Branch name, PR author controls |
| `github.event.comment.body` | Commenter controls |
| `github.event.review.body` | Reviewer controls |
| `github.event.pages.*.page_name` | Wiki page author controls |
| `github.event.commits.*.message` | Commit author controls |
| `github.event.commits.*.author.email` | Commit author controls |
| `github.head_ref` | PR author controls |

### 3.2 Safe pattern: use env intermediaries

```yaml
- name: Process PR
  env:
    TITLE: ${{ github.event.pull_request.title }}
    BODY: ${{ github.event.pull_request.body }}
  run: |
    echo "Title: $TITLE"
    echo "Body: $BODY"
```

### 3.3 Be cautious with GITHUB_OUTPUT and GITHUB_ENV
Writing attacker-controlled values to these files can inject arbitrary outputs/env vars. Sanitize before writing.

### 3.4 For complex processing, use a JavaScript action
Create a small action that receives values as input parameters, eliminating shell interpretation entirely.

## 4. Secrets Handling

### 4.1 Never hardcode secrets in workflow files

### 4.2 Do not use structured data as a single secret
Redaction works on exact string matches; substrings may leak unmasked. Create individual secrets per value.

### 4.3 Mask dynamically generated sensitive values

```yaml
- run: echo "::add-mask::$DYNAMIC_SECRET"
```

### 4.4 Never upload artifacts containing secrets or tokens

### 4.5 Do not use `secrets: inherit` in reusable workflows
Explicitly pass only required secrets:

```yaml
uses: org/shared/.github/workflows/deploy.yml@{SHA}
secrets:
  DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
```

### 4.6 Use environment-scoped secrets for deployments
Bind production credentials to environments with protection rules.

## 5. `pull_request_target` Rules

### 5.1 Prefer `pull_request` over `pull_request_target`
`pull_request` runs in the fork's context with read-only permissions and no access to base repo secrets. Safe by default.

### 5.2 NEVER checkout PR head with `pull_request_target`

```yaml
# CRITICALLY DANGEROUS - attacker code runs with your secrets
on: pull_request_target
steps:
  - uses: actions/checkout@{SHA}
    with:
      ref: ${{ github.event.pull_request.head.sha }}  # NEVER DO THIS
  - run: npm install  # Executes attacker's package.json with your secrets
```

### 5.3 Use two-workflow pattern for privileged PR operations
1. Unprivileged `pull_request` workflow produces artifacts
2. Privileged `workflow_run` workflow consumes those artifacts
3. Never execute untrusted code in the privileged workflow

### 5.4 Require approval for fork PRs
In repo settings, require maintainer approval before workflows execute on fork PRs.

## 6. Environment and Deployment Protections

### 6.1 Use GitHub Environments with required reviewers

```yaml
jobs:
  deploy:
    environment:
      name: production
      url: https://example.com
```

### 6.2 Restrict environments to specific branches
Limit `production` environment to `main` branch only.

### 6.3 Set wait timers on sensitive environments
Add 5-15 minute delay for catching suspicious deployments.

## 7. Concurrency Controls

### 7.1 Deployments: prevent parallel runs

```yaml
concurrency:
  group: deploy-production
  cancel-in-progress: false  # NEVER cancel deployments mid-run
```

### 7.2 CI: cancel outdated runs

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

## 8. Additional Hardening

### 8.1 Always set timeout-minutes

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30
```

### 8.2 Add CODEOWNERS for workflow files

```
# .github/CODEOWNERS
.github/ @org/platform-security-team
```

### 8.3 Self-hosted runner rules
- NEVER use self-hosted runners with public repositories
- Use ephemeral (`--ephemeral`) runners for clean environments per job
- Run as unprivileged user, never root
- Restrict runner groups by repository

## 9. Validation Checklist

Before finalizing any workflow, verify:

- [ ] Every `uses:` has a full 40-char commit SHA with version comment
- [ ] `permissions:` block exists (workflow-level or job-level)
- [ ] No `${{ github.event.* }}` in any `run:` block (use `env:` instead)
- [ ] `persist-credentials: false` on checkout where push is not needed
- [ ] `timeout-minutes` set on all jobs
- [ ] No `secrets: inherit` in reusable workflow calls
- [ ] No `permissions: write-all`
- [ ] `pull_request_target` does NOT checkout PR head
- [ ] Concurrency groups on deployment jobs
- [ ] No hardcoded secrets in workflow files

## Sources

- GitHub Docs: Security for GitHub Actions
- GitHub Well-Architected: Securing GitHub Actions Workflows
- OWASP Top 10 CI/CD Security Risks
- StepSecurity: GitHub Actions Security Best Practices
- tj-actions/changed-files CVE-2025-30066 incident analysis
- OpenSSF Scorecard checks

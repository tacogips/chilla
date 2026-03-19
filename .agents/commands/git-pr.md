---
allowed-tools: Bash,Read,Grep,Glob
description: Generate or update a GitHub pull request with comprehensive description
---

Use the `git-pr` agent to create or update a GitHub pull request with comprehensive analysis and documentation.

Arguments provided: $ARGUMENTS

The agent will:
1. Check for uncommitted changes (will error if found)
2. Push any unpushed commits to remote
3. Detect if this is a new PR or updating an existing one
4. Analyze all changes using GitHub PR data
5. Generate comprehensive PR title and body in English
6. Create file change statistics table

Arguments can include:
- Base branch name (for new PRs)
- `State:Open` or `State:Draft` to control PR state
- GitHub issue/PR URLs to link
- `Desc:` prefix followed by description text

Examples:
- `/git-pr` - Create draft PR to default branch
- `/git-pr main` - Create draft PR to main branch
- `/git-pr State:Open` - Create open (non-draft) PR
- `/git-pr https://github.com/owner/repo/issues/123` - Link to issue
- `/git-pr Desc: This PR implements the new search feature` - Add description

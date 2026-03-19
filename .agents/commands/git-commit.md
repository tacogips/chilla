---
allowed-tools: Bash,Read,Grep,Glob
description: Generate a commit with comprehensive commit message
---

Use the `git-commit` agent to analyze all current changes and create a git commit with a comprehensive, structured commit message.

The agent will:
1. Analyze all staged and unstaged changes
2. Read modified files for context
3. Identify TODOs and technical concepts
4. Generate a detailed commit message following project conventions
5. Stage all changes and create the commit

Security requirement:
- Never include credential information, secret values, or local environment variable values in commit messages.
- Never include development machine-specific paths or absolute local filesystem paths in commit messages (use repository-relative paths only).
- Never include content from Git-untracked files, and never include paths of Git-untracked files, in commit messages.
- Public storage URIs/paths (for example S3 public objects) are allowed only when explicitly public and required for context.

Do not ask for confirmation - proceed directly with the commit.

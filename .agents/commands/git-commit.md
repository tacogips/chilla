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

Do not ask for confirmation - proceed directly with the commit.

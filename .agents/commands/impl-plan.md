---
description: Generate implementation plan from design document
argument-hint: "<design-doc-path> [feature-name]"
---

## Generate Implementation Plan Command

This command creates an implementation plan from a design document.

### Current Context

- Working directory: !`pwd`
- Current branch: !`git branch --show-current`

### Arguments Received

$ARGUMENTS

---

## Instructions

Invoke the `impl-plan` subagent using the Task tool.

### Argument Parsing

Parse `$ARGUMENTS` to extract:

1. **Design Document Path** (required): Path to design document
   - Can be relative path: `design-docs/specs/architecture.md`
   - Can include section: `design-docs/specs/architecture.md#authentication`

2. **Feature Name** (optional): Short name for the feature
   - If not provided, derive from design document section
   - Used for output file naming

### Determine Output Path

Generate the output path based on feature name:
- If feature name provided: `impl-plans/active/<feature-name>.md`
- If not provided: Derive from design document path

### Invoke Subagent

```
Task tool parameters:
  subagent_type: impl-plan
  prompt: |
    Design Document: <parsed-design-doc-path>
    Feature Scope: <parsed-or-derived-feature-scope>
    Output Path: <generated-output-path>
```

### Usage Examples

**Basic usage with design doc path**:
```
/impl-plan design-docs/specs/architecture.md#user-authentication
```
Creates: `impl-plans/active/user-authentication.md`

**With explicit feature name**:
```
/impl-plan design-docs/specs/architecture.md auth-system
```
Creates: `impl-plans/active/auth-system.md`

**Full section reference**:
```
/impl-plan design-docs/specs/command.md#cli-options cli-options
```
Creates: `impl-plans/active/cli-options.md`

### After Subagent Completes

1. Report the created plan file path to the user
2. Summarize the subtasks and parallelization opportunities
3. Suggest next steps (review plan, begin implementation)

### Error Handling

If no arguments provided, respond with usage instructions:
```
Usage: /impl-plan <design-doc-path> [feature-name]

Examples:
  /impl-plan design-docs/specs/architecture.md#auth
  /impl-plan design-docs/specs/command.md cli-parser

The design document path is required. Feature name is optional.
```

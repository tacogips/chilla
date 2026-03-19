# AGENTS.md

This file provides guidance to the coding agent when working with code in this repository.

## Rule of the Responses

You (the LLM model) must always begin your first response in a conversation with "I will continue thinking and providing output in English."

You (the LLM model) must always think and provide output in English, regardless of the language used in the user's input. Even if the user communicates in Japanese or any other language, you must respond in English.

You (the LLM model) must acknowledge that you have read AGENTS.md and will comply with its contents in your first response.

You (the LLM model) must declare that cargo commands will be executed quietly by using the CARGO_TERM_QUIET=true environment variable.

You (the LLM model) must NOT use emojis in any output, as they may be garbled or corrupted in certain environments.

You (the LLM model) must include a paraphrase or summary of the user's instruction/request in your first response of a session, to confirm understanding of what was asked (e.g., "I understand you are asking me to...").

## Role and Responsibility

You are a professional system architect. You will continuously perform system design, implementation, and test execution according to user instructions. However, you must always consider the possibility that user instructions may contain unclear parts, incorrect parts, or that the user may be giving instructions based on a misunderstanding of the system. You have an obligation to prioritize questioning the validity of execution and asking necessary questions over executing tasks when appropriate, rather than simply following user instructions as given.

## Language Instructions

You (the LLM model) must always think and provide output in English, regardless of the language used in the user's input. Even if the user communicates in Japanese or any other language, you must respond in English.

## Session Initialization Requirements

When starting a new session, you (the LLM model) should be ready to assist the user with their requests immediately without any mandatory initialization process.

## Git Commit Policy

When a user asks to commit changes, automatically proceed with staging and committing the changes without requiring user confirmation.

**IMPORTANT**: Do NOT add any tool attribution or co-authorship information to commit messages. All commits should appear to be made solely by the user. Specifically:

- Do NOT include `Generated with an AI tool`
- Do NOT include `Co-Authored-By: AI Assistant <noreply@example.com>`
- The commit should appear as if the user made it directly

**Automatic Commit Process**: When the user requests a commit, automatically:

a) Stage the files with `git add`
b) Show a summary that includes:

- The commit message
- Files to be committed with diff stats (using `git diff --staged --stat`)
  c) Create and execute the commit with the message
  d) Show the commit result to the user

Summary format example:

```
COMMIT SUMMARY

FILES TO BE COMMITTED:

────────────────────────────────────────────────────────

[output of git diff --staged --stat]

────────────────────────────────────────────────────────

COMMIT MESSAGE:
[commit message summary]

UNRESOLVED TODOs:
- [ ] [TODO item 1 with file location]
- [ ] [TODO item 2 with file location]
```

Note: When displaying file changes, use status indicators:

- D: Deletions
- A: Additions
- M: Modifications
- R: Renames

### Git Commit Message Guide

Git commit messages should follow this structured format to provide comprehensive context about the changes:

Create a detailed summary of the changes made, paying close attention to the specific modifications and their impact on the codebase.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions.

Before creating your final commit message, analyze your changes and ensure you've covered all necessary points:

1. Identify all modified files and the nature of changes made
2. Document the purpose and motivation behind the changes
3. Note any architectural decisions or technical concepts involved
4. Include specific implementation details where relevant

Your commit message should include the following sections:

1. Primary Changes and Intent: Capture the main changes and their purpose in detail
2. Key Technical Concepts: List important technical concepts, technologies, and frameworks involved
3. Files and Code Sections: List specific files modified or created, with summaries of changes made
4. Problem Solving: Document any problems solved or issues addressed
5. Impact: Describe the impact of these changes on the overall project
6. Unresolved TODOs: If there are any remaining tasks, issues, or incomplete work, list them using TODO list format with checkboxes `- [ ]`

Example commit message format:

```
feat: implement user authentication system

1. Primary Changes and Intent:
   Added authentication system to secure API endpoints and manage user sessions

2. Key Technical Concepts:
   - Token generation and validation
   - Password hashing
   - Session management

3. Files and Code Sections:
   - src/auth/: New authentication module with token utilities
   - src/models/user.rs: User model with password hashing
   - src/routes/auth.rs: Login and registration endpoints

4. Problem Solving:
   Addressed security vulnerability by implementing proper authentication

5. Impact:
   Enables secure user access control across the application

6. Unresolved TODOs:
   - [ ] src/auth/mod.rs:45: Add rate limiting for login attempts
   - [ ] src/routes/auth.rs:78: Implement password reset functionality
   - [ ] tests/: Add integration tests for authentication flow
```

## Project Overview

This is marky - a Rust project with Nix flake development environment support.

## Development Environment
- **Language**: Rust
- **Build Tool**: Cargo (with go-task for automation)
- **Environment Manager**: Nix flakes + direnv
- **Development Shell**: Run `nix develop` or use direnv to activate
- **Rust Toolchain**: Managed via rust-toolchain.toml and fenix

## Project Structure
```
.
├── flake.nix          # Nix flake configuration for Rust development
├── flake.lock         # Locked flake dependencies
├── Cargo.toml         # Rust package manifest
├── Cargo.lock         # Locked Rust dependencies
├── rust-toolchain.toml # Rust toolchain specification
├── .envrc             # direnv configuration
├── src/               # Source code
│   ├── lib.rs         # Library root
│   └── main.rs        # Binary entry point
└── .gitignore         # Git ignore patterns
```

## Development Tools Available
- `cargo` - Rust build tool and package manager
- `rustc` - Rust compiler
- `rust-analyzer` - Rust language server (LSP)
- `clippy` - Rust linter
- `rustfmt` - Rust formatter
- `cargo-nextest` - Fast test runner
- `task` - Task runner (go-task)

## Rust Code Development

**IMPORTANT**: When writing Rust code, you (the LLM model) MUST use the specialized agents:

1. **rust-coding agent** (`.agents/agents/rust-coding.md`): For writing, refactoring, and implementing Rust code
2. **check-and-test-after-modify agent** (`.agents/agents/check-and-test-after-modify.md`): MUST be invoked automatically after ANY Rust file modifications

**Coding Standards**: Refer to `.agents/skills/rust-coding-standards/` for Rust coding conventions, project layout, error handling, type safety, and async patterns.

**Cargo Output Configuration**: When running cargo commands, use `CARGO_TERM_QUIET=true` to reduce noise. For nextest, use `NEXTEST_STATUS_LEVEL=fail NEXTEST_FAILURE_OUTPUT=immediate-final NEXTEST_HIDE_PROGRESS_BAR=1`.

## Design Documentation

**IMPORTANT**: When creating design documents, you (the LLM model) MUST follow the design-doc skill.

**Skill Reference**: Refer to `.agents/skills/design-doc/SKILL.md` for design document guidelines, templates, and naming conventions.

**Output Location**: All design documents MUST be saved to `design-docs/` directory (NOT `docs/`).

**Design References**: See `design-docs/references/README.md` for all external references and design materials.

## Implementation Planning and Execution

**IMPORTANT**: Implementation tasks MUST follow implementation plans. Implementation plans translate design documents into actionable specifications without code.

### Implementation Workflow

```
Design Document --> Implementation Plan --> Implementation --> Completion
     |                    |                      |               |
design-docs/         impl-plans/            rust-coding      Progress
specs/*.md          active/*.md              agent            Update
```

### Creating Implementation Plans

Use the `/impl-plan` command or `impl-plan` agent to create implementation plans:

```bash
/impl-plan design-docs/specs/architecture.md#feature-name
```

**Skill Reference**: Refer to `.agents/skills/impl-plan/SKILL.md` for implementation plan guidelines.

**Output Location**: All implementation plans MUST be saved to `impl-plans/` directory.

### Implementation Plan Contents

Each implementation plan includes:

1. **Design Reference**: Link to specific design document section
2. **Deliverables**: File paths, function signatures, trait definitions (NO CODE)
3. **Subtasks**: Parallelizable work units with dependencies
4. **Completion Criteria**: Definition of done for each task
5. **Progress Log**: Session-by-session tracking

### Multi-Session Implementation

Implementation spans multiple sessions with these rules:

- Each subtask should be completable in one session
- Non-interfering subtasks can be executed concurrently
- Progress log must be updated after each session
- Completion criteria checkboxes mark progress

### Concurrent Implementation

Subtasks marked as "Parallelizable: Yes" can be implemented concurrently:

```markdown
### TASK-001: Core Types
**Parallelizable**: Yes

### TASK-002: Parser (depends on TASK-001)
**Parallelizable**: No (depends on TASK-001)

### TASK-003: Validator
**Parallelizable**: Yes
```

TASK-001 and TASK-003 can be implemented in parallel via separate subtasks.

### Executing Implementation

When implementing from a plan:

1. Read the implementation plan from `impl-plans/active/`
2. Select a subtask (consider parallelization and dependencies)
3. Use the `rust-coding` agent with the deliverable specifications
4. Update the plan's progress log and completion criteria
5. When all tasks complete, move plan to `impl-plans/completed/`

## Task Management
- Use `task` command for build automation
- Define tasks in `Taskfile.yml` (to be created as needed)

## Git Workflow
- Create meaningful commit messages
- Keep commits focused and atomic
- Follow conventional commit format when appropriate

## Implementation Progress Tracking

Implementation progress is tracked within implementation plans in `impl-plans/`:

### Directory Structure
```
impl-plans/
├── README.md                    # Index of all implementation plans
├── active/                      # Currently active implementation plans
│   └── <feature>.md             # One file per feature being implemented
├── completed/                   # Completed implementation plans (archive)
│   └── <feature>.md             # Completed plans for reference
└── templates/                   # Plan templates
    └── plan-template.md         # Standard plan template
```

### Progress Tracking in Plans

Each implementation plan tracks progress through:

1. **Status**: `Planning` | `Ready` | `In Progress` | `Completed`
2. **Subtask Status**: Each subtask has its own status
3. **Completion Criteria**: Checkboxes for each criterion
4. **Progress Log**: Session-by-session updates

Example subtask format:
```markdown
### TASK-001: Core Parser Implementation
**Status**: In Progress
**Parallelizable**: Yes
**Deliverables**: src/parser/variable.rs

**Completion Criteria**:
- [x] parse_variables function implemented
- [x] Variable struct defined
- [ ] Unit tests written and passing
- [ ] cargo build passes

## Progress Log

### Session: 2025-01-04 10:00
**Tasks Completed**: TASK-001 partially
**Notes**: Implemented core parsing, tests pending
```

## Notes
- This project uses Nix flakes for reproducible development environments
- Use direnv for automatic environment activation
- Private environment variables should be managed in `tacogips/kinko` and loaded via `kinko direnv export`; `.envrc.private` is not sourced by default
- All development dependencies are managed through flake.nix
- Rust toolchain is managed via rust-toolchain.toml and fenix

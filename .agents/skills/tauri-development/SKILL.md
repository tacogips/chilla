---
name: tauri-development
description: Use when implementing or reviewing Tauri features that span the Bun/TypeScript frontend and the Rust backend. Provides boundary, verification, and project-structure guidance for desktop app development.
allowed-tools: Read, Grep, Glob, Bash
---

# Tauri Development Skill

This skill provides working rules for mixed Tauri applications where the frontend is implemented with Bun/TypeScript and the desktop/backend side is implemented with Rust.

## When to Apply

Apply this skill when:
- Changing both frontend code and `src-tauri/` Rust code
- Adding or modifying Tauri commands, events, menus, windows, or permissions
- Updating data contracts that cross the `invoke` boundary
- Reviewing architecture or implementation plans for desktop app features

## Core Principles

1. **Treat Tauri as a Contract Boundary**: Every change that crosses `invoke`, event, or plugin boundaries must be reflected on both sides.
2. **Keep Types Aligned**: Frontend request/response types and Rust command payloads must evolve together.
3. **Verify Both Toolchains**: Cross-boundary changes are not complete until Bun-side checks and Cargo-side checks both pass.
4. **Minimize Shell Risk**: Prefer Tauri APIs, typed commands, and explicit path validation over ad-hoc shell execution.
5. **Plan Full-Stack Work Explicitly**: Features touching `src/` and `src-tauri/` should normally go through an implementation plan.

## Project Boundaries

Use these boundaries when reasoning about changes:

- `src/`: Bun/TypeScript frontend, state, UI, editor/viewer behavior, invoke callers
- `src-tauri/`: Rust commands, desktop integration, filesystem access, application lifecycle
- `src-tauri/tauri.conf.json` and related config: packaging, capabilities, permissions, windows
- Shared contract surface: invoke command names, payload shapes, event names, persisted document formats

## Implementation Rules

### Command and Event Changes

When adding or changing a Tauri command:

1. Update the Rust command implementation and registration
2. Update the frontend invoke wrapper in the same task or plan
3. Keep command names centralized and stable
4. Prefer explicit request/response types over anonymous object literals
5. Document serialization assumptions when Rust and TypeScript types must remain compatible

### Filesystem and Markdown Handling

- Validate all paths before reading or writing files
- Keep filesystem access concentrated in Rust unless there is a clear frontend-only reason
- Normalize markdown loading/saving behavior across the viewer and editor flows
- Avoid duplicate parsing or sanitization rules across Rust and TypeScript when one shared rule can be made authoritative

### Error Handling

- Rust commands should return structured, user-actionable errors
- Frontend code should map Tauri invocation failures into typed UI-facing error states
- Do not leak raw system details to the UI unless they are needed for debugging and safe to expose

## Verification Checklist

For mixed Tauri work, verify:

- Bun/frontend checks: `bun run typecheck` and `bun run test` when available
- Rust/backend checks: `CARGO_TERM_QUIET=true cargo check`, `CARGO_TERM_QUIET=true cargo test`
- Cross-boundary behavior: command names, payload fields, and error mapping still match

If the change touches only one side, still review whether a contract change was introduced implicitly.

## Implementation Planning Guidance

Prefer an implementation plan when:
- The feature spans frontend and backend
- Multiple commands or windows are affected
- Markdown data model changes affect loading, editing, previewing, or persistence
- Packaging, permissions, or capability boundaries change

A good Tauri implementation plan should identify:
- Frontend deliverables
- `src-tauri/` deliverables
- Shared contract changes
- Verification steps for both toolchains

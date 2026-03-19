---
name: rust-coding-standards
description: Use when writing, reviewing, or refactoring Rust code. Provides type safety patterns, error handling, project layout, and async programming guidelines.
allowed-tools: Read, Grep, Glob
---

# Rust Coding Standards

This skill provides modern Rust coding guidelines and best practices for this project.

## When to Apply

Apply these standards when:
- Writing new Rust code
- Reviewing or refactoring existing Rust code
- Designing module APIs and public interfaces
- Implementing error handling strategies

## Core Principles

1. **Ownership Over Copying** - Leverage Rust's ownership system, avoid unnecessary clones
2. **Explicit Over Implicit** - Make types and intentions clear
3. **Simple Over Clever** - Prefer readable code over clever abstractions
4. **Fail Fast** - Catch errors at compile time via strong typing

## Quick Reference

### Must-Use Patterns

| Pattern | Use Case |
|---------|----------|
| Newtype pattern | IDs, validated strings, domain types |
| `Result<T, E>` | All fallible operations |
| `#[must_use]` | Functions where ignoring return is likely a bug |
| `#[non_exhaustive]` | Public enums that may gain variants |
| Builder pattern | Complex struct construction |
| Type state pattern | Compile-time state machine validation |

### Must-Avoid Anti-Patterns

| Anti-Pattern | Alternative |
|--------------|-------------|
| `.unwrap()` in production | `?` operator or explicit handling |
| `panic!` for expected failures | Return `Result<T, E>` |
| String for all text | Newtype wrappers for semantic meaning |
| Deep module nesting (>3 levels) | Flat, feature-based structure |
| `pub` on everything | Minimal public API surface |
| `clone()` to satisfy borrow checker | Restructure ownership |

## Detailed Guidelines

For comprehensive guidance, see:
- [Error Handling Patterns](./error-handling.md) - Result, Option, thiserror, anyhow
- [Type Safety Best Practices](./type-safety.md) - Newtype pattern, type state, lifetimes
- [Project Layout Conventions](./project-layout.md) - Cargo workspace, module structure
- [Async Programming Patterns](./async-patterns.md) - tokio, async/await, channels
- [Security Guidelines](./security.md) - Credential protection, path sanitization, sensitive data handling

## Clippy Configuration

This project uses strict Clippy linting. Ensure your code passes:

```bash
cargo clippy --all-targets -- -D warnings
```

Common Clippy lints enabled:
- `clippy::pedantic` - Extra strictness
- `clippy::nursery` - Experimental lints
- `clippy::unwrap_used` - Disallow unwrap in production
- `clippy::expect_used` - Disallow expect in production

## Rustfmt Configuration

If present, `rustfmt.toml` defines formatting rules:

```toml
edition = "2021"
max_width = 100
use_small_heuristics = "Max"
```

## References

- [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- [Effective Rust](https://www.lurklurk.org/effective-rust/)
- [Rust Design Patterns](https://rust-unofficial.github.io/patterns/)
- [The Rust Performance Book](https://nnethercote.github.io/perf-book/)

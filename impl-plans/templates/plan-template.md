# <Feature Name> Implementation Plan

**Status**: Planning | Ready | In Progress | Completed
**Design Reference**: design-docs/<file>.md#<section>
**Created**: YYYY-MM-DD
**Last Updated**: YYYY-MM-DD

---

## Design Document Reference

**Source**: design-docs/<file>.md

### Summary
Brief description of the feature being implemented.

### Scope
**Included**: What is being implemented
**Excluded**: What is NOT part of this implementation

---

## Modules

### 1. <Module Category>

#### src/path/to/file.rs

**Status**: NOT_STARTED

```rust
pub trait Example: Send + Sync {
    fn method(&self, param: &str) -> Result<()>;
}

#[derive(Debug, Clone)]
pub struct ExampleImpl {
    // fields
}
```

**Checklist**:
- [ ] Define Example trait
- [ ] Implement ExampleImpl struct
- [ ] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Example trait | `src/path/to/file.rs` | NOT_STARTED | - |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| This feature | Foundation layer | Available |

## Completion Criteria

- [ ] All modules implemented
- [ ] All tests passing
- [ ] cargo build passes
- [ ] cargo clippy passes

## Progress Log

### Session: YYYY-MM-DD HH:MM
**Tasks Completed**: None yet
**Tasks In Progress**: Starting implementation
**Blockers**: None
**Notes**: Initial session

## Related Plans

- **Previous**: (if split from larger plan)
- **Next**: (if continued in another plan)
- **Depends On**: (other plan files this depends on)

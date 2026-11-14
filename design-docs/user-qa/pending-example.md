# Example: CLI Output Format

**Status**: Pending Decision

**Created**: 2025-01-04

**Category**: Command Design

## Decision Needed

Should the CLI default output format be plain text or JSON?

## Background

The CLI tool needs a consistent output format strategy. This affects:
- User experience for interactive use
- Integration with other tools and scripts
- Error message formatting

## Alternatives

### Option A: Plain Text Default

```bash
$ myapp list
Name        Status    Created
─────────────────────────────
project-1   active    2025-01-01
project-2   pending   2025-01-03
```

- Better for human readability
- Requires `--json` flag for machine parsing

### Option B: JSON Default

```bash
$ myapp list
{"items":[{"name":"project-1","status":"active","created":"2025-01-01"},...]}
```

- Better for scripting and piping
- Requires `--pretty` or `--human` flag for readable output

### Option C: Auto-detect (TTY)

- Plain text when stdout is a terminal
- JSON when piped or redirected

## Impact

This decision affects:
- `command.md` - output format documentation
- All command implementations
- Error handling strategy

## Awaiting

User preference on primary use case (interactive vs scripted).

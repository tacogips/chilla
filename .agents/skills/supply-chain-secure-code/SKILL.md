---
name: supply-chain-secure-code
description: Use when writing Rust code that interacts with dependencies, handles credentials, executes commands, or manages configuration. Provides supply chain attack countermeasures at the code level including safe dependency usage, credential handling, subprocess hardening, and build.rs/proc-macro awareness. Adapted from Shai-Hulud npm attack lessons.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
user-invocable: true
---

# Supply Chain Secure Code (Rust)

This skill provides Rust coding patterns that defend against supply chain attacks at the application code level. Rust has unique attack surfaces (build.rs, proc macros, unsafe) that require specific attention beyond what Go or TypeScript need.

## When to Apply

Apply these guidelines when:
- Importing and using third-party crates
- Handling credentials, tokens, or API keys in code
- Executing external commands (`std::process::Command`)
- Loading configuration from files or environment variables
- Writing `build.rs` scripts
- Writing or using proc macros
- Reviewing code for supply chain attack vectors

## Threat Model: Rust-Specific Attack Vectors

| Attack Vector | Description | Runs When | Defense |
|---------------|-------------|-----------|---------|
| `build.rs` | Build scripts execute arbitrary code | `cargo build` | Audit build.rs, sandbox builds |
| Proc macros | Compile-time code execution | `cargo build` | Audit proc macro crates |
| `unsafe` blocks | Bypass memory safety | Runtime | Minimize unsafe, audit dependencies |
| Malicious runtime code | Compromised crate logic | Runtime | Minimize dependencies, review |
| `include_bytes!`/`include_str!` | Read files at compile time | `cargo build` | Check what files are included |

**CRITICAL**: Both `build.rs` and proc macros execute during `cargo build`, NOT just at runtime. This means **building untrusted code is equivalent to running it**.

## Credential Handling

### Never Hardcode Credentials

```rust
// BAD
const API_KEY: &str = "ghp_xxxxxxxxxxxxxxxxxxxx";

// BAD - included at compile time
const TOKEN: &str = include_str!("../secrets/token.txt");

// GOOD - environment variable at runtime
let api_key = std::env::var("API_KEY")
    .expect("API_KEY environment variable is required");
```

### Credential Validation at Startup

```rust
use std::env;

struct Config {
    api_key: String,
    database_url: String,
}

impl Config {
    fn from_env() -> Result<Self, String> {
        let api_key = env::var("API_KEY")
            .map_err(|_| "API_KEY is required")?;
        let database_url = env::var("DATABASE_URL")
            .map_err(|_| "DATABASE_URL is required")?;

        if api_key.len() < 20 {
            return Err("API_KEY appears too short".into());
        }

        Ok(Config { api_key, database_url })
    }
}

fn main() {
    // Validate ALL credentials at startup
    let config = Config::from_env().expect("Invalid configuration");
    // Use config throughout application
}
```

### Credential Isolation in Subprocesses

```rust
use std::process::Command;

// BAD - inherits ALL environment variables
let output = Command::new("some-tool")
    .arg("--flag")
    .output()?;
// Inherited env includes GITHUB_TOKEN, AWS keys, etc.

// GOOD - explicit environment
let output = Command::new("some-tool")
    .arg("--flag")
    .env_clear()  // Clear ALL inherited env vars
    .env("PATH", std::env::var("PATH").unwrap_or_default())
    .env("HOME", std::env::var("HOME").unwrap_or_default())
    .output()?;
```

### Zeroize Credentials in Memory

```rust
// Use the zeroize crate to clear sensitive data from memory
use zeroize::Zeroize;

fn process_token(token: &str) {
    let mut secret = token.to_string();
    // ... use secret ...

    // Clear from memory when done
    secret.zeroize();
}

// Or use ZeroizeOnDrop for automatic cleanup
use zeroize::ZeroizeOnDrop;

#[derive(ZeroizeOnDrop)]
struct Credentials {
    api_key: String,
    secret: String,
}
```

## Safe Dependency Usage

### Minimize Dependencies

```toml
# Cargo.toml - be explicit about features
[dependencies]
# BAD - pulls in many features
serde = "1"

# GOOD - only what you need
serde = { version = "1", default-features = false, features = ["derive"] }

# GOOD - use std when possible
# Don't add a crate for something std provides
```

### Audit Unsafe Usage in Dependencies

```bash
# Use cargo-geiger to find unsafe usage in dependency tree
cargo install cargo-geiger
cargo geiger

# Counts unsafe usage in all dependencies
# Flag crates with high unsafe counts for review
```

### Dependency Feature Minimization

```toml
[dependencies]
# Disable default features and enable only what you need
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json"] }
# This avoids pulling in openssl (native dependency with build.rs)
```

## Subprocess Security

### Command Injection Prevention

```rust
use std::process::Command;

// BAD - shell injection
let output = Command::new("sh")
    .arg("-c")
    .arg(format!("echo {}", user_input))
    .output()?;

// GOOD - no shell interpretation
let output = Command::new("echo")
    .arg(&user_input)  // Passed as single argument, no shell parsing
    .output()?;

// GOOD - validate input if shell is needed
fn safe_exec(name: &str) -> Result<(), Box<dyn std::error::Error>> {
    let re = regex::Regex::new(r"^[a-zA-Z0-9_-]+$")?;
    if !re.is_match(name) {
        return Err("Invalid input".into());
    }
    Command::new("tool")
        .arg("--name")
        .arg(name)
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .output()?;
    Ok(())
}
```

### Never Download and Execute

```rust
// DANGEROUS - Shai-Hulud pattern adapted to Rust
// BAD
let resp = reqwest::get("https://example.com/binary").await?;
let bytes = resp.bytes().await?;
std::fs::write("/tmp/tool", &bytes)?;
Command::new("/tmp/tool").spawn()?;

// GOOD - verify checksum before execution
use sha2::{Sha256, Digest};

async fn verified_download(
    url: &str,
    expected_sha256: &str,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let resp = reqwest::get(url).await?;
    let data = resp.bytes().await?;

    let hash = Sha256::digest(&data);
    let actual = hex::encode(hash);

    if actual != expected_sha256 {
        return Err(format!(
            "Integrity check failed: expected {}, got {}",
            expected_sha256, actual
        ).into());
    }
    Ok(data.to_vec())
}
```

## build.rs Security (Writing Safe Build Scripts)

If your crate needs a `build.rs`:

### Minimal build.rs Principles

```rust
// build.rs

fn main() {
    // DO: Generate code from static data
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=proto/schema.proto");

    // DO: Set cfg flags
    println!("cargo:rustc-cfg=feature=\"custom\"");

    // DO NOT: Make network requests
    // DO NOT: Read credential files
    // DO NOT: Execute external commands (unless absolutely necessary)
    // DO NOT: Read environment variables other than OUT_DIR, CARGO_*
}
```

### If External Commands Are Needed

```rust
// build.rs - if you must run external commands
fn main() {
    // Limit to known, safe commands
    let output = std::process::Command::new("protoc")
        .arg("--version")
        .env_clear()  // Don't leak env vars
        .env("PATH", "/usr/bin:/bin")
        .output()
        .expect("protoc must be installed");

    // Never use shell interpretation
    // Never download and execute
    // Never read credential files
}
```

## File Access Security

### Path Traversal Prevention

```rust
use std::path::{Path, PathBuf};

fn safe_path(base: &Path, user_path: &str) -> Result<PathBuf, String> {
    let resolved = base.join(user_path);
    let canonical = resolved.canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;

    if !canonical.starts_with(base.canonicalize().unwrap()) {
        return Err("Path traversal detected".into());
    }
    Ok(canonical)
}
```

### Credential File Awareness

```rust
// These files would be targeted by Shai-Hulud-style malware:
// ~/.cargo/credentials.toml  (crates.io token)
// ~/.npmrc                    (npm token, even in Rust projects)
// ~/.config/gcloud/application_default_credentials.json
// ~/.aws/credentials
// ~/.azure/

// Your code should NEVER read these files unless it is
// explicitly a credential management tool
```

## Network Security

### Outbound Request Validation

```rust
use url::Url;
use std::collections::HashSet;

fn validate_url(raw_url: &str, allowed_hosts: &HashSet<&str>) -> Result<Url, String> {
    let url = Url::parse(raw_url)
        .map_err(|e| format!("Invalid URL: {}", e))?;

    let host = url.host_str()
        .ok_or("No host in URL")?;

    if !allowed_hosts.contains(host) {
        return Err(format!("Blocked: unauthorized host {}", host));
    }

    // Block cloud metadata endpoints
    let blocked = ["169.254.169.254", "metadata.google.internal"];
    if blocked.contains(&host) {
        return Err(format!("Blocked: metadata endpoint {}", host));
    }

    Ok(url)
}
```

## Code Review Checklist

### High Priority

- [ ] No hardcoded credentials, tokens, or API keys
- [ ] No `include_str!`/`include_bytes!` on credential files
- [ ] No `Command::new` with unsanitized user input
- [ ] Subprocess calls use `env_clear()` or explicit env
- [ ] No download-and-execute patterns
- [ ] No reading of credential files without explicit need
- [ ] `build.rs` does not make network requests or read credentials

### Medium Priority

- [ ] External HTTP requests validate response bodies
- [ ] File paths validated against path traversal
- [ ] Environment variables validated at startup
- [ ] Dependency features minimized (`default-features = false`)
- [ ] `unsafe` usage is documented and justified

### Low Priority (Defense in Depth)

- [ ] Outbound network requests limited to known hosts
- [ ] `build.rs` in dependencies audited (`cargo-deny`, `cargo-vet`)
- [ ] Proc macro crates audited
- [ ] `cargo geiger` run to assess unsafe usage in dependencies
- [ ] Sensitive data uses `zeroize` for memory cleanup

## Post-Compromise Detection

```bash
# Check for suspicious build scripts in dependencies
grep -r "Command::new\|env::var\|home_dir\|reqwest\|ureq\|TcpStream" \
  $(cargo metadata --format-version 1 | jq -r '.target_directory')/../registry/src/ \
  --include="build.rs" 2>/dev/null

# Check for unexpected proc macro crates
cargo metadata --format-version 1 | \
  jq '.packages[] | select(.targets[].kind[] == "proc-macro") | .name'

# Audit unsafe usage
cargo geiger 2>/dev/null

# Check for unauthorized GitHub runners and workflows
gh api repos/{owner}/{repo}/actions/runners --jq '.runners[] | {name, status}'
find .github/workflows -name "*.yml" -newer Cargo.toml

# Verify Cargo.lock integrity
cargo build --locked 2>&1 | grep -i "error"
```

## References

- [Cargo Security - Build Scripts](https://doc.rust-lang.org/cargo/reference/build-scripts.html)
- [cargo-geiger - Unsafe Usage Detection](https://github.com/geiger-rs/cargo-geiger)
- [zeroize - Memory Cleanup](https://docs.rs/zeroize/)
- [RustSec Advisory Database](https://rustsec.org/)
- [Shai-Hulud 2.0 - Lessons for All Ecosystems](https://www.trendmicro.com/en_us/research/25/k/shai-hulud-2-0-targets-cloud-and-developer-systems.html)

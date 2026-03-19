# Error Handling Patterns

Modern Rust error handling prioritizes type safety and explicit error states. This guide covers idiomatic patterns for libraries and applications.

## The Result Type

Rust uses `Result<T, E>` for all fallible operations. Never panic for expected failures.

### Basic Pattern

```rust
use std::fs::File;
use std::io::{self, Read};

fn read_file_contents(path: &str) -> Result<String, io::Error> {
    let mut file = File::open(path)?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    Ok(contents)
}

// Handling
match read_file_contents("config.toml") {
    Ok(contents) => println!("Config: {contents}"),
    Err(e) => eprintln!("Failed to read config: {e}"),
}
```

### The ? Operator

Use `?` for error propagation. It converts errors via `From` trait:

```rust
fn process_data(path: &str) -> Result<Data, AppError> {
    let contents = std::fs::read_to_string(path)?; // io::Error -> AppError
    let data: Data = serde_json::from_str(&contents)?; // serde_json::Error -> AppError
    Ok(data)
}
```

## thiserror for Library Errors

Use `thiserror` when writing libraries. It provides derive macros for custom error types:

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ParseError {
    #[error("invalid syntax at line {line}: {message}")]
    Syntax { line: usize, message: String },

    #[error("unexpected token: expected {expected}, found {found}")]
    UnexpectedToken { expected: String, found: String },

    #[error("file not found: {0}")]
    FileNotFound(String),

    #[error(transparent)]
    Io(#[from] std::io::Error),
}

// Usage
fn parse_config(path: &str) -> Result<Config, ParseError> {
    let contents = std::fs::read_to_string(path)?; // Automatically converts io::Error

    if contents.is_empty() {
        return Err(ParseError::Syntax {
            line: 1,
            message: "empty file".to_string(),
        });
    }

    // Parse logic...
    Ok(Config::default())
}
```

### Error Variants Design

```rust
#[derive(Error, Debug)]
pub enum ServiceError {
    // Wrap lower-level errors with #[from]
    #[error("database error")]
    Database(#[from] sqlx::Error),

    #[error("serialization error")]
    Serialization(#[from] serde_json::Error),

    // Domain-specific errors with context
    #[error("user not found: {user_id}")]
    UserNotFound { user_id: String },

    #[error("permission denied: {action} requires {required_role}")]
    PermissionDenied { action: String, required_role: String },

    // Use #[source] for cause chain without #[from] conversion
    #[error("validation failed")]
    Validation {
        field: String,
        #[source]
        cause: ValidationError,
    },
}
```

## anyhow for Applications

Use `anyhow` in application code where you don't need to match on specific error types:

```rust
use anyhow::{Context, Result, bail, ensure};

fn load_config() -> Result<Config> {
    let path = std::env::var("CONFIG_PATH")
        .context("CONFIG_PATH environment variable not set")?;

    let contents = std::fs::read_to_string(&path)
        .with_context(|| format!("failed to read config file: {path}"))?;

    let config: Config = toml::from_str(&contents)
        .context("failed to parse config as TOML")?;

    ensure!(!config.api_key.is_empty(), "API key cannot be empty");

    if config.port == 0 {
        bail!("port must be non-zero");
    }

    Ok(config)
}

// In main
fn main() -> Result<()> {
    let config = load_config()?;
    run_server(config)?;
    Ok(())
}
```

### anyhow Features

```rust
use anyhow::{anyhow, Context, Result};

// Create ad-hoc errors
fn validate(input: &str) -> Result<()> {
    if input.is_empty() {
        return Err(anyhow!("input cannot be empty"));
    }
    Ok(())
}

// Add context to existing errors
fn process_file(path: &str) -> Result<Data> {
    let contents = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read {path}"))?;

    parse_data(&contents)
        .context("failed to parse data")
}

// Downcast to check specific error types when needed
fn handle_error(err: anyhow::Error) {
    if let Some(io_err) = err.downcast_ref::<std::io::Error>() {
        if io_err.kind() == std::io::ErrorKind::NotFound {
            eprintln!("File not found");
            return;
        }
    }
    eprintln!("Error: {err:?}");
}
```

## Option Type

Use `Option<T>` for values that may or may not exist:

```rust
fn find_user(id: &str) -> Option<User> {
    users.iter().find(|u| u.id == id).cloned()
}

// Handling with combinators
let user_name = find_user("123")
    .map(|u| u.name.clone())
    .unwrap_or_else(|| "Unknown".to_string());

// Pattern matching
match find_user("123") {
    Some(user) => println!("Found: {}", user.name),
    None => println!("User not found"),
}

// Early return with ?
fn get_user_email(id: &str) -> Option<String> {
    let user = find_user(id)?;
    let profile = user.profile.as_ref()?;
    Some(profile.email.clone())
}
```

### Option Combinators

```rust
let value: Option<i32> = Some(5);

// Transform the inner value
let doubled = value.map(|x| x * 2); // Some(10)

// Chain operations that return Option
let result = value
    .and_then(|x| if x > 0 { Some(x) } else { None })
    .and_then(|x| Some(x * 2));

// Provide defaults
let with_default = value.unwrap_or(0);
let with_default_fn = value.unwrap_or_else(|| expensive_default());

// Convert to Result
let as_result: Result<i32, &str> = value.ok_or("value was None");
```

## Converting Between Result and Option

```rust
// Option to Result
fn find_or_error(id: &str) -> Result<User, UserError> {
    find_user(id).ok_or_else(|| UserError::NotFound(id.to_string()))
}

// Result to Option (discarding error)
fn try_parse(s: &str) -> Option<i32> {
    s.parse().ok()
}

// Transpose: Option<Result<T, E>> <-> Result<Option<T>, E>
let opt_result: Option<Result<i32, Error>> = Some(Ok(42));
let result_opt: Result<Option<i32>, Error> = opt_result.transpose(); // Ok(Some(42))
```

## Error Handling Best Practices

### DO: Use #[must_use] for Results

```rust
#[must_use]
fn save_data(data: &Data) -> Result<(), SaveError> {
    // ...
}

// Compiler warns if Result is ignored
save_data(&data); // warning: unused Result
```

### DO: Provide Context

```rust
// BAD: No context
std::fs::read_to_string(path)?;

// GOOD: Clear context
std::fs::read_to_string(path)
    .with_context(|| format!("failed to read configuration from {path}"))?;
```

### DO: Use Custom Error Types for Public APIs

```rust
// Library exposes specific error type
pub fn parse(input: &str) -> Result<Ast, ParseError> { ... }

// Application uses anyhow internally
fn run() -> anyhow::Result<()> {
    let ast = parse(input)?; // ParseError converted via Display
    Ok(())
}
```

### DON'T: Use unwrap/expect in Production

```rust
// BAD: Panics on error
let config = load_config().unwrap();

// GOOD: Handle or propagate
let config = load_config()?;

// ACCEPTABLE: Only for truly impossible cases with comment
let regex = Regex::new(r"^\d+$").expect("regex is valid");
```

### DON'T: Swallow Errors

```rust
// BAD: Silent failure
let _ = save_data(&data);

// GOOD: Log or propagate
if let Err(e) = save_data(&data) {
    tracing::warn!("Failed to save data: {e}");
}
```

## When to Use Each Pattern

| Scenario | Pattern |
|----------|---------|
| Library public API | `thiserror` custom error types |
| Application code | `anyhow::Result` with context |
| Optional values | `Option<T>` |
| Recoverable errors | `Result<T, E>` |
| Programmer errors (bugs) | `panic!` (assertions, unreachable) |
| FFI boundaries | Consider raw error codes |

## References

- [Error Handling in Rust](https://doc.rust-lang.org/book/ch09-00-error-handling.html)
- [thiserror crate](https://docs.rs/thiserror)
- [anyhow crate](https://docs.rs/anyhow)
- [Rust API Guidelines - Errors](https://rust-lang.github.io/api-guidelines/interoperability.html#c-good-err)

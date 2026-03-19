# Type Safety Best Practices

This guide covers patterns that leverage Rust's type system to catch errors at compile time rather than runtime.

## The Newtype Pattern

Wrap primitive types to give them semantic meaning and prevent mixing:

### Basic Newtype

```rust
// Define distinct types for different kinds of IDs
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UserId(String);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct OrderId(String);

impl UserId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

// Functions are type-safe
fn get_user(id: UserId) -> Option<User> { ... }
fn get_order(id: OrderId) -> Option<Order> { ... }

// Compiler prevents mixing
let user_id = UserId::new("user-123");
let order_id = OrderId::new("order-456");

get_user(user_id);   // OK
get_user(order_id);  // Compile error: expected UserId, found OrderId
```

### Validated Newtype

```rust
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Email(String);

#[derive(Error, Debug)]
#[error("invalid email format: {0}")]
pub struct InvalidEmail(String);

impl Email {
    pub fn new(value: impl Into<String>) -> Result<Self, InvalidEmail> {
        let value = value.into();
        if value.contains('@') && value.len() > 3 {
            Ok(Self(value))
        } else {
            Err(InvalidEmail(value))
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

// Once constructed, Email is guaranteed valid
fn send_email(to: Email, subject: &str, body: &str) -> Result<(), SendError> {
    // No need to validate - type guarantees validity
    ...
}
```

### Newtype with Deref

For read-only access to inner value:

```rust
use std::ops::Deref;

#[derive(Debug, Clone)]
pub struct NonEmptyString(String);

impl Deref for NonEmptyString {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl NonEmptyString {
    pub fn new(value: impl Into<String>) -> Option<Self> {
        let value = value.into();
        if value.is_empty() {
            None
        } else {
            Some(Self(value))
        }
    }
}

// Can use &str methods directly
let name = NonEmptyString::new("Alice").unwrap();
println!("Length: {}", name.len()); // Deref to &str
```

## Type State Pattern

Encode state transitions in the type system. Invalid transitions become compile errors:

```rust
// Marker types for states (zero-sized)
pub struct Draft;
pub struct PendingReview;
pub struct Approved;
pub struct Published;

// Document with state as type parameter
pub struct Document<State> {
    title: String,
    content: String,
    _state: std::marker::PhantomData<State>,
}

impl Document<Draft> {
    pub fn new(title: String) -> Self {
        Self {
            title,
            content: String::new(),
            _state: std::marker::PhantomData,
        }
    }

    pub fn edit(&mut self, content: String) {
        self.content = content;
    }

    // Transition to PendingReview
    pub fn submit_for_review(self) -> Document<PendingReview> {
        Document {
            title: self.title,
            content: self.content,
            _state: std::marker::PhantomData,
        }
    }
}

impl Document<PendingReview> {
    pub fn approve(self) -> Document<Approved> {
        Document {
            title: self.title,
            content: self.content,
            _state: std::marker::PhantomData,
        }
    }

    pub fn reject(self) -> Document<Draft> {
        Document {
            title: self.title,
            content: self.content,
            _state: std::marker::PhantomData,
        }
    }
}

impl Document<Approved> {
    pub fn publish(self) -> Document<Published> {
        Document {
            title: self.title,
            content: self.content,
            _state: std::marker::PhantomData,
        }
    }
}

// Usage - invalid transitions are compile errors
let doc = Document::new("Title".into());
let doc = doc.submit_for_review();
let doc = doc.approve();
let doc = doc.publish();

// This would not compile:
// doc.edit("new content"); // Error: Document<Published> has no method edit
```

## Builder Pattern

For complex struct construction with compile-time validation:

```rust
#[derive(Debug)]
pub struct Server {
    host: String,
    port: u16,
    max_connections: usize,
    timeout_secs: u64,
}

#[derive(Default)]
pub struct ServerBuilder {
    host: Option<String>,
    port: Option<u16>,
    max_connections: Option<usize>,
    timeout_secs: Option<u64>,
}

impl ServerBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn host(mut self, host: impl Into<String>) -> Self {
        self.host = Some(host.into());
        self
    }

    pub fn port(mut self, port: u16) -> Self {
        self.port = Some(port);
        self
    }

    pub fn max_connections(mut self, max: usize) -> Self {
        self.max_connections = Some(max);
        self
    }

    pub fn timeout_secs(mut self, secs: u64) -> Self {
        self.timeout_secs = Some(secs);
        self
    }

    pub fn build(self) -> Result<Server, BuildError> {
        Ok(Server {
            host: self.host.ok_or(BuildError::MissingField("host"))?,
            port: self.port.ok_or(BuildError::MissingField("port"))?,
            max_connections: self.max_connections.unwrap_or(100),
            timeout_secs: self.timeout_secs.unwrap_or(30),
        })
    }
}

// Usage
let server = ServerBuilder::new()
    .host("localhost")
    .port(8080)
    .max_connections(1000)
    .build()?;
```

### Type-Safe Builder (Compile-Time Required Fields)

```rust
pub struct ServerBuilder<Host, Port> {
    host: Host,
    port: Port,
    max_connections: usize,
}

pub struct Missing;
pub struct Set<T>(T);

impl ServerBuilder<Missing, Missing> {
    pub fn new() -> Self {
        Self {
            host: Missing,
            port: Missing,
            max_connections: 100,
        }
    }
}

impl<P> ServerBuilder<Missing, P> {
    pub fn host(self, host: String) -> ServerBuilder<Set<String>, P> {
        ServerBuilder {
            host: Set(host),
            port: self.port,
            max_connections: self.max_connections,
        }
    }
}

impl<H> ServerBuilder<H, Missing> {
    pub fn port(self, port: u16) -> ServerBuilder<H, Set<u16>> {
        ServerBuilder {
            host: self.host,
            port: Set(port),
            max_connections: self.max_connections,
        }
    }
}

// build() only available when both are Set
impl ServerBuilder<Set<String>, Set<u16>> {
    pub fn build(self) -> Server {
        Server {
            host: self.host.0,
            port: self.port.0,
            max_connections: self.max_connections,
        }
    }
}

// Compile error if required fields missing:
// ServerBuilder::new().build(); // Error: build() not found
```

## Enums for Exhaustive Matching

Use enums to ensure all cases are handled:

```rust
#[derive(Debug)]
pub enum RequestStatus {
    Pending,
    Processing { started_at: DateTime },
    Completed { result: String },
    Failed { error: String, retries: u32 },
}

fn handle_status(status: RequestStatus) -> String {
    match status {
        RequestStatus::Pending => "Waiting to start".to_string(),
        RequestStatus::Processing { started_at } => {
            format!("Processing since {started_at}")
        }
        RequestStatus::Completed { result } => {
            format!("Done: {result}")
        }
        RequestStatus::Failed { error, retries } => {
            format!("Failed after {retries} retries: {error}")
        }
    }
    // Adding new variant requires updating all match expressions
}
```

### #[non_exhaustive] for Public Enums

```rust
// In library crate
#[non_exhaustive]
#[derive(Debug)]
pub enum ApiError {
    NotFound,
    Unauthorized,
    RateLimited,
}

// In consumer crate - must have wildcard arm
match api_error {
    ApiError::NotFound => ...,
    ApiError::Unauthorized => ...,
    ApiError::RateLimited => ...,
    _ => ..., // Required for non_exhaustive enums
}
```

## Lifetime Annotations

Make borrowing relationships explicit:

```rust
// Struct that borrows data
pub struct Parser<'input> {
    input: &'input str,
    position: usize,
}

impl<'input> Parser<'input> {
    pub fn new(input: &'input str) -> Self {
        Self { input, position: 0 }
    }

    // Return value lives as long as input
    pub fn next_token(&mut self) -> Option<&'input str> {
        // ...
    }
}

// Multiple lifetimes when needed
pub struct Context<'a, 'b> {
    config: &'a Config,
    request: &'b Request,
}
```

## Sealed Traits

Prevent external implementations:

```rust
mod private {
    pub trait Sealed {}
}

pub trait DatabaseDriver: private::Sealed {
    fn connect(&self) -> Connection;
}

// Only types in this crate can implement DatabaseDriver
pub struct PostgresDriver;
impl private::Sealed for PostgresDriver {}
impl DatabaseDriver for PostgresDriver {
    fn connect(&self) -> Connection { ... }
}

// External crates cannot implement DatabaseDriver
// because they cannot implement the Sealed trait
```

## Anti-Patterns to Avoid

```rust
// BAD: Stringly typed
fn process_user(user_id: String, email: String, role: String) { ... }

// GOOD: Strongly typed
fn process_user(user_id: UserId, email: Email, role: Role) { ... }

// BAD: Boolean parameters
fn create_user(name: String, is_admin: bool, is_active: bool) { ... }

// GOOD: Enums or builder
enum UserRole { Admin, Regular }
enum UserStatus { Active, Inactive }
fn create_user(name: String, role: UserRole, status: UserStatus) { ... }

// BAD: Returning tuple
fn get_stats() -> (u64, u64, u64) { ... } // What do these mean?

// GOOD: Named struct
struct Stats { requests: u64, errors: u64, latency_ms: u64 }
fn get_stats() -> Stats { ... }

// BAD: Magic numbers
const TIMEOUT: u64 = 30000; // 30000 what?

// GOOD: Type-safe duration
use std::time::Duration;
const TIMEOUT: Duration = Duration::from_secs(30);
```

## References

- [Rust API Guidelines - Type Safety](https://rust-lang.github.io/api-guidelines/type-safety.html)
- [Effective Rust - Types](https://www.lurklurk.org/effective-rust/types.html)
- [Typestate Pattern in Rust](https://cliffle.com/blog/rust-typestate/)
- [Rust Design Patterns - Newtype](https://rust-unofficial.github.io/patterns/patterns/behavioural/newtype.html)

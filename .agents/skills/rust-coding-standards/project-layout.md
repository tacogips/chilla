# Project Layout Conventions

Modern Rust project structure following Clean Architecture principles for clarity, maintainability, and testability.

## Clean Architecture Overview

Clean Architecture organizes code into concentric layers with dependencies pointing inward:

```
+--------------------------------------------------+
|                 Infrastructure                    |
|  +--------------------------------------------+  |
|  |                  Adapter                   |  |
|  |  +--------------------------------------+  |  |
|  |  |             Application              |  |  |
|  |  |  +--------------------------------+  |  |  |
|  |  |  |            Domain              |  |  |  |
|  |  |  |   (Entities, Value Objects)    |  |  |  |
|  |  |  +--------------------------------+  |  |  |
|  |  |       (Use Cases, Ports)             |  |  |
|  |  +--------------------------------------+  |  |
|  |     (Repositories, Mappers, DTOs)          |  |
|  +--------------------------------------------+  |
|       (Server, Config, External Services)        |
+--------------------------------------------------+
```

**Dependency Rule**: Inner layers MUST NOT know about outer layers. Domain cannot import from Application, Application cannot import from Adapter, etc.

## Single Crate Layout (Clean Architecture)

### Binary Application

```
project/
  src/
    main.rs               # Entry point, minimal code
    lib.rs                # Library root, module declarations

    domain/               # INNERMOST: Core business logic
      mod.rs
      entities/           # Business entities
        mod.rs
        user.rs
        order.rs
      value_objects/      # Value objects (immutable, no identity)
        mod.rs
        email.rs
        money.rs
      errors.rs           # Domain-specific errors

    application/          # Use cases and ports
      mod.rs
      usecases/           # Application use cases
        mod.rs
        create_user.rs
        get_user_by_id.rs
        list_orders.rs
      ports/              # Repository interfaces (abstractions)
        mod.rs
        user_repository.rs
        order_repository.rs
      dto.rs              # Data transfer objects for use case I/O

    adapter/              # Implementations of ports
      mod.rs
      persistence/        # Database implementations
        mod.rs
        postgres/
          mod.rs
          user_repository.rs
          order_repository.rs
        memory/
          mod.rs
          user_repository.rs
      mappers/            # Entity <-> External format mappers
        mod.rs
        user_mapper.rs

    infrastructure/       # OUTERMOST: External concerns
      mod.rs
      server/             # HTTP/gRPC server setup
        mod.rs
        routes.rs
        handlers.rs
      config.rs           # Configuration loading
      cli.rs              # CLI argument parsing

  tests/                  # Integration tests
    common/
      mod.rs
    api_tests.rs
  Cargo.toml
  Cargo.lock
```

### Layer Responsibilities

**Domain Layer** (`src/domain/`)
- Pure business logic with zero external dependencies
- Entities with business rules and validations
- Value objects for type safety
- Domain-specific error types

```rust
// src/domain/entities/user.rs
use crate::domain::value_objects::Email;
use crate::domain::errors::DomainError;

#[derive(Debug, Clone)]
pub struct User {
    id: UserId,
    email: Email,
    name: String,
}

impl User {
    pub fn new(email: Email, name: String) -> Result<Self, DomainError> {
        if name.is_empty() {
            return Err(DomainError::InvalidUserName);
        }
        Ok(Self {
            id: UserId::generate(),
            email,
            name,
        })
    }
}
```

**Application Layer** (`src/application/`)
- Use case implementations (business workflows)
- Repository interfaces (ports) - abstractions only
- Orchestrates domain entities

```rust
// src/application/ports/user_repository.rs
use crate::domain::entities::{User, UserId};
use async_trait::async_trait;

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn find_by_id(&self, id: &UserId) -> Result<Option<User>, RepositoryError>;
    async fn save(&self, user: &User) -> Result<(), RepositoryError>;
    async fn delete(&self, id: &UserId) -> Result<(), RepositoryError>;
}
```

```rust
// src/application/usecases/create_user.rs
use crate::application::ports::UserRepository;
use crate::domain::entities::User;
use crate::domain::value_objects::Email;

pub struct CreateUserUseCase<R: UserRepository> {
    user_repo: R,
}

impl<R: UserRepository> CreateUserUseCase<R> {
    pub fn new(user_repo: R) -> Self {
        Self { user_repo }
    }

    pub async fn execute(&self, input: CreateUserInput) -> Result<User, UseCaseError> {
        let email = Email::parse(&input.email)?;
        let user = User::new(email, input.name)?;
        self.user_repo.save(&user).await?;
        Ok(user)
    }
}
```

**Adapter Layer** (`src/adapter/`)
- Concrete implementations of repository interfaces
- Mappers to convert between external formats and domain entities
- Database-specific code, API clients

```rust
// src/adapter/persistence/postgres/user_repository.rs
use crate::application::ports::UserRepository;
use crate::domain::entities::{User, UserId};
use sqlx::PgPool;
use async_trait::async_trait;

pub struct PostgresUserRepository {
    pool: PgPool,
}

#[async_trait]
impl UserRepository for PostgresUserRepository {
    async fn find_by_id(&self, id: &UserId) -> Result<Option<User>, RepositoryError> {
        let row = sqlx::query_as!(UserRow, "SELECT * FROM users WHERE id = $1", id.as_str())
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.map(UserMapper::to_entity))
    }

    async fn save(&self, user: &User) -> Result<(), RepositoryError> {
        let row = UserMapper::to_row(user);
        sqlx::query!("INSERT INTO users (id, email, name) VALUES ($1, $2, $3)",
            row.id, row.email, row.name)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
```

**Infrastructure Layer** (`src/infrastructure/`)
- Server configuration and startup
- External service integrations
- CLI and configuration parsing

```rust
// src/infrastructure/server/routes.rs
use crate::application::usecases::CreateUserUseCase;
use crate::adapter::persistence::postgres::PostgresUserRepository;
use axum::{Router, routing::post};

pub fn create_router(pool: PgPool) -> Router {
    let user_repo = PostgresUserRepository::new(pool);
    let create_user = CreateUserUseCase::new(user_repo);

    Router::new()
        .route("/users", post(move |body| handlers::create_user(body, create_user)))
}
```

## Cargo Workspace Layout (Clean Architecture)

For larger projects, separate layers into distinct crates:

```
workspace/
  Cargo.toml              # Workspace manifest
  crates/
    domain/               # Domain layer crate (no external deps)
      src/
        lib.rs
        entities/
        value_objects/
        errors.rs
      Cargo.toml

    application/          # Application layer crate
      src/
        lib.rs
        usecases/
        ports/
        dto.rs
      Cargo.toml          # Depends on: domain

    adapter/              # Adapter layer crate
      src/
        lib.rs
        persistence/
        mappers/
      Cargo.toml          # Depends on: domain, application

    infrastructure/       # Infrastructure layer crate
      src/
        lib.rs
        server/
        config.rs
      Cargo.toml          # Depends on: domain, application, adapter

    cli/                  # CLI binary
      src/
        main.rs
      Cargo.toml          # Depends on: infrastructure

  tests/                  # Workspace-level integration tests
  docs/
```

### Workspace Cargo.toml

```toml
[workspace]
resolver = "2"
members = [
    "crates/domain",
    "crates/application",
    "crates/adapter",
    "crates/infrastructure",
    "crates/cli",
]

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "MIT"

[workspace.dependencies]
# Shared dependencies
tokio = { version = "1.0", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
thiserror = "1.0"
anyhow = "1.0"
tracing = "0.1"
async-trait = "0.1"

# Internal crates
domain = { path = "crates/domain" }
application = { path = "crates/application" }
adapter = { path = "crates/adapter" }
infrastructure = { path = "crates/infrastructure" }
```

### Domain Crate Cargo.toml (Minimal Dependencies)

```toml
[package]
name = "domain"
version.workspace = true
edition.workspace = true

[dependencies]
# Domain should have minimal dependencies
thiserror.workspace = true
# Avoid async runtime, database drivers, web frameworks here
```

### Application Crate Cargo.toml

```toml
[package]
name = "application"
version.workspace = true
edition.workspace = true

[dependencies]
domain.workspace = true
async-trait.workspace = true
thiserror.workspace = true
```

## Module Organization

### mod.rs Pattern

```rust
// src/domain/mod.rs
pub mod entities;
pub mod value_objects;
pub mod errors;

// Re-export commonly used items
pub use entities::{User, UserId, Order, OrderId};
pub use value_objects::{Email, Money};
pub use errors::DomainError;
```

### Visibility Rules

```rust
// Domain entities are public
pub struct User { ... }

// Internal helpers are crate-private
pub(crate) fn validate_format(s: &str) -> bool { ... }

// Implementation details are module-private
fn internal_helper() { ... }
```

## Testing Organization

### Unit Tests (Same File)

```rust
// src/domain/entities/user.rs

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_creation_with_valid_data() {
        let email = Email::parse("test@example.com").unwrap();
        let user = User::new(email, "Alice".to_string());
        assert!(user.is_ok());
    }

    #[test]
    fn test_user_creation_with_empty_name_fails() {
        let email = Email::parse("test@example.com").unwrap();
        let user = User::new(email, "".to_string());
        assert!(matches!(user, Err(DomainError::InvalidUserName)));
    }
}
```

### Use Case Tests with Mock Repository

```rust
// src/application/usecases/create_user.rs

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::ports::MockUserRepository;

    #[tokio::test]
    async fn test_create_user_success() {
        let mut mock_repo = MockUserRepository::new();
        mock_repo.expect_save().returning(|_| Ok(()));

        let usecase = CreateUserUseCase::new(mock_repo);
        let input = CreateUserInput {
            email: "test@example.com".to_string(),
            name: "Alice".to_string(),
        };

        let result = usecase.execute(input).await;
        assert!(result.is_ok());
    }
}
```

### Integration Tests

```rust
// tests/api_tests.rs
use infrastructure::server::create_app;

#[tokio::test]
async fn test_create_user_endpoint() {
    let app = create_app().await;
    let response = app.post("/users")
        .json(&json!({"email": "test@example.com", "name": "Alice"}))
        .await;
    assert_eq!(response.status(), 201);
}
```

## Anti-Patterns to Avoid

```
// BAD: Domain depends on infrastructure
// src/domain/entities/user.rs
use sqlx::FromRow;  // Domain should not know about database!

#[derive(FromRow)]
pub struct User { ... }

// GOOD: Keep domain pure
// src/domain/entities/user.rs
pub struct User { ... }

// src/adapter/persistence/postgres/user_repository.rs
use sqlx::FromRow;

#[derive(FromRow)]
struct UserRow { ... }  // Adapter-specific type
```

```
// BAD: Use case knows about HTTP
// src/application/usecases/create_user.rs
use axum::Json;  // Application should not know about web framework!

// GOOD: Use plain DTOs
pub struct CreateUserInput { ... }
pub struct CreateUserOutput { ... }
```

## Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| Crates | snake_case | `my_domain` |
| Modules | snake_case | `user_repository` |
| Types | PascalCase | `UserRepository` |
| Use Cases | PascalCase + UseCase | `CreateUserUseCase` |
| Ports (traits) | PascalCase + trait name | `UserRepository` |
| Functions | snake_case | `get_user_by_id` |

## References

- [Clean Architecture by Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Practical Clean Architecture in Rust](https://dev.to/msc29/practical-clean-architecture-in-typescript-rust-python-3a6d)
- [Cargo Book - Workspaces](https://doc.rust-lang.org/cargo/reference/workspaces.html)
- [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)

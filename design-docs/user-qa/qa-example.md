# Example: Database Selection

**Status**: Pending

**Created**: 2025-01-04

**Category**: Architecture Decision

## Question

Which database should be used for persistent storage?

## Context

The application requires persistent storage for user data and session management. The following factors need consideration:

- Expected data volume: ~10,000 users initially
- Query patterns: Primarily key-value lookups with occasional aggregations
- Deployment environment: Docker containers on cloud infrastructure

## Options

| Option | Pros | Cons |
|--------|------|------|
| PostgreSQL | ACID compliance, rich query support, mature ecosystem | Higher operational complexity |
| SQLite | Simple deployment, no separate server | Limited concurrent write performance |
| Redis | Excellent performance, built-in TTL | Data persistence requires configuration |

## Recommendation

PostgreSQL is recommended for production use due to:
- Strong data integrity guarantees
- Flexible query capabilities for future requirements
- Well-supported in Nix and Docker environments

## Decision

(Awaiting user confirmation)

## Notes

- If SQLite is chosen, consider WAL mode for better concurrency
- Redis may be added later as a caching layer regardless of primary database choice

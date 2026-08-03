# ADR 0001: Modular monolith with API and worker processes

## Status

Accepted.

## Context

Tuvansa currently has AI capabilities split between the quote extraction backend and the GPT catalog backend. The system needs to unify document extraction, semantic search, vector synchronization and AI suggestions without moving transactional business rules out of the core backend.

## Decision

Use one TypeScript repository organized as vertical business modules. Each module applies Clean Architecture internally. Build one codebase and run it through two independent entry points:

- API process for HTTP contracts, validation, job persistence and queue publication.
- Worker process for slow or externally dependent AI operations.

PostgreSQL stores job state and execution audit. Redis and BullMQ transport asynchronous work. The core backend remains the source of truth for quotes, customers, local products, requisitions and approvals. Pinecone remains a searchable projection, not a transactional database.

## Consequences

- API and worker can scale independently.
- AI provider adapters can be replaced without changing application use cases.
- Job execution is observable, retryable and idempotent.
- Redis becomes required infrastructure for asynchronous production processing.
- Existing endpoints must be migrated incrementally with compatibility aliases.

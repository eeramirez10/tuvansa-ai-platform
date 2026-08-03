# Tuvansa AI Platform

Unified backend for Tuvansa AI capabilities. It uses a modular monolith with Clean Architecture and runs as two independent processes:

- `api`: validates requests, persists jobs and publishes queue messages.
- `worker`: consumes jobs and performs AI processing.

The existing AI backends remain active while capabilities are migrated incrementally.

## Implemented in the first milestone

- Modular project structure.
- PostgreSQL job persistence and execution audit.
- Redis/BullMQ queue with idempotent job IDs, retries and exponential backoff.
- Text quote extraction as the first end-to-end vertical flow.
- Digital PDF and XLSX quote extraction with temporary file cleanup.
- Explicit rejection for scanned PDFs that require external OCR.
- OpenAI structured output adapter.
- API and worker graceful shutdown.
- Liveness and readiness endpoints.
- Compatibility aliases for current text job routes.

## Run locally

```bash
cp .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm prisma:migrate -- --name initialize-ai-jobs
pnpm dev:api
```

Run the worker in another terminal:

```bash
pnpm dev:worker
```

## Endpoints

```text
GET  /health/live
GET  /health/ready
POST /api/v1/extractions/text
POST /api/v1/extractions/documents
GET  /api/v1/jobs/:id
GET  /api/v1/jobs/:id/result
```

Temporary compatibility aliases:

```text
POST /api/extract/jobs/text
POST /api/extract/jobs
GET  /api/extract/jobs/:id/status
GET  /api/extract/jobs/:id/result
```

## Next migration slices

1. Quoted Excel extraction.
2. Supplier quote extraction.
3. Technical data suggestions.
4. Semantic catalog search and local product vector synchronization.
5. Catalog indexing, ranking and evaluation from `tuvansa-backend-gpt`.

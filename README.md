# Tuvansa AI Platform

Unified backend for Tuvansa AI capabilities. It uses a modular monolith with Clean Architecture and runs as two independent processes:

- `api`: validates requests, persists jobs and publishes queue messages.
- `worker`: consumes jobs and performs AI processing.

The existing AI backends remain active while capabilities are migrated incrementally.

## Implemented capabilities

- Modular project structure.
- PostgreSQL job persistence and execution audit.
- Redis/BullMQ queue with idempotent job IDs, retries and exponential backoff.
- Text quote extraction as the first end-to-end vertical flow.
- Digital PDF and XLSX quote extraction with temporary file cleanup.
- Seller-completed quote Excel extraction with per-item currency and commercial validation.
- Supplier quote extraction with supplier identity, commercial header, totals, items, evidence and review warnings.
- Compatibility response fields used by the current frontend (`file_name`, `file_type`, `items_count`).
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
POST /api/v1/extractions/quoted-excel
POST /api/v1/extractions/supplier-quotes
GET  /api/v1/jobs/:id
GET  /api/v1/jobs/:id/result
```

Temporary compatibility aliases:

```text
POST /api/extract/jobs/text
POST /api/extract/jobs
POST /api/extract/jobs/quoted-excel
POST /api/extract/jobs/supplier-quote
GET  /api/extract/jobs/:id/status
GET  /api/extract/jobs/:id/result
```

## Next migration slices

1. Technical data suggestions.
2. Missing product normalization and quote catalog code suggestions.
3. Semantic catalog search and local product vector synchronization.
4. Catalog indexing, ranking and evaluation from `tuvansa-backend-gpt`.

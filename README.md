# Tuvansa AI Platform

Unified backend for Tuvansa AI capabilities. It uses a modular monolith with Clean Architecture and runs as two independent processes:

- `api`: validates requests, persists jobs and publishes queue messages.
- `worker`: consumes jobs and performs AI processing.

The operational capabilities from the two previous AI backends are consolidated here. Keep legacy deployments available only during the production validation window.

## Implemented capabilities

- Modular project structure.
- PostgreSQL job persistence and execution audit.
- Redis/BullMQ queue with idempotent job IDs, retries and exponential backoff.
- Text quote extraction as the first end-to-end vertical flow.
- Digital PDF and XLSX quote extraction with temporary file cleanup.
- Seller-completed quote Excel extraction with per-item currency and commercial validation.
- Supplier quote extraction with supplier identity, commercial header, totals, items, evidence and review warnings.
- Missing product normalization for local temporary products.
- Technical data suggestions for individual items and batches.
- AI-assisted internal code generation for quote catalogs.
- Pure semantic product search with Voyage embeddings, Pinecone and ERP availability.
- Hybrid technical ranking for pipes, fittings, valves and flanges.
- EAN deduplication with explicit `SEMANTIC_ONLY` ranking.
- Local temporary product vector search, sync, update and delete lifecycle.
- Proscai vector projection and asynchronous incremental synchronization.
- Persisted catalog-search evaluation jobs and metrics.
- Async jobs for every migrated capability with synchronous compatibility adapters for the current frontend.
- Compatibility response fields used by the current frontend (`file_name`, `file_type`, `items_count`).
- Optional OpenAI OCR fallback controlled by `PDF_OCR_ENABLED`; disabled by default.
- OpenAI structured output adapter.
- API and worker graceful shutdown.
- Liveness and readiness endpoints.
- Compatibility aliases for current text job routes.
- Internal-key protection for all AI and semantic catalog routes.
- Authenticated browser integration through `cotizador-core-backend`.

## Run locally

```bash
cp .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm prisma:migrate
pnpm dev:api
```

Run the worker in another terminal:

```bash
pnpm dev:worker
```

Scanned PDFs are rejected with `PDF_REQUIRES_OCR` by default. To test automatic OCR, set `PDF_OCR_ENABLED=true`, configure `OPENAI_OCR_MODEL` and restart the worker.

## Endpoints

```text
GET  /health/live
GET  /health/ready
POST /api/v1/extractions/text
POST /api/v1/extractions/documents
POST /api/v1/extractions/quoted-excel
POST /api/v1/extractions/supplier-quotes
POST /api/v1/assistance/missing-products/normalize
POST /api/v1/assistance/technical-data/suggest
POST /api/v1/assistance/technical-data/suggest-batch
POST /api/v1/assistance/quote-catalogs/suggest-code
GET  /api/v1/jobs/:id
GET  /api/v1/jobs/:id/result
POST /api/v1/catalog/search/semantic
POST /api/v1/catalog/search/hybrid
POST /api/v1/catalog/index-jobs
GET  /api/v1/catalog/evaluation/cases
POST /api/v1/catalog/evaluation-jobs
```

Temporary compatibility aliases:

```text
POST /api/extract/jobs/text
POST /api/extract/jobs
POST /api/extract/jobs/quoted-excel
POST /api/extract/jobs/supplier-quote
POST /api/products/normalize-missing
POST /api/procurement/technical-data/suggest
POST /api/procurement/technical-data/suggest-batch
POST /api/quote-catalogs/suggest-code
GET  /api/extract/jobs/:id/status
GET  /api/extract/jobs/:id/result
POST /api/vector-catalog/search/semantic
POST /api/vector-catalog/search
POST /api/ai/products/similar-v2
POST /api/ai/products/similar-v2/semantic
POST /api/local-products-semantic/search
POST /api/local-products-semantic/sync
PUT  /api/local-products-semantic/:productId
DELETE /api/local-products-semantic/:productId
```

All `/api` endpoints require the configured internal key. The core backend owns browser authentication and proxies the compatibility routes.

See `docs/semantic-cutover.md`, `docs/deployment.md` and `docs/legacy-retirement.md` for production operation and retirement gates.

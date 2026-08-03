# AI platform cutover

The browser must not receive `INTERNAL_API_KEY`. AI traffic follows this path:

```text
cotizador-v2 -> cotizador-core-backend (JWT) -> tuvansa-ai-platform (internal key)
```

## Local configuration

In `cotizador-v2`:

```dotenv
VITE_AI_API_URL=http://localhost:4600
```

In `cotizador-core-backend`:

```dotenv
AI_PLATFORM_BASE_URL=http://localhost:4700
AI_PLATFORM_INTERNAL_API_KEY=use-the-same-internal-key
AI_PLATFORM_TIMEOUT_MS=75000
GPT_LOCAL_PRODUCTS_URL=http://localhost:4700/api/local-products-semantic
GPT_LOCAL_PRODUCTS_API_KEY=use-the-same-local-products-key
```

In `tuvansa-ai-platform`:

```dotenv
INTERNAL_API_KEY=use-the-same-internal-key
LOCAL_PRODUCTS_INTERNAL_API_KEY=use-the-same-local-products-key
```

All extraction, assistance and catalog search routes require an internal key. Health endpoints remain public.

## Validation completed locally

- Authenticated semantic-only search through core.
- Authenticated text extraction through core, Redis and worker.
- Authenticated XLSX upload through core, temporary storage and worker.
- Hybrid search parity with the previous GPT backend.
- Vector synchronization dry-run with no Pinecone mutations.
- Persisted catalog evaluation job with 100% accuracy on the executed case.

## Production order

1. Deploy the unified API, worker, PostgreSQL migrations and Redis.
2. Configure the internal key in the unified backend and core.
3. Deploy the core proxy and verify its health and one authenticated AI request.
4. Set `VITE_AI_API_URL` to the production core URL and deploy the frontend.
5. Observe errors, queue depth and OpenAI usage during the validation window.
6. Stop the legacy AI services only after no consumer traffic reaches them.

## Rollback

The frontend production URL can remain pointed at the legacy AI backend until the production validation succeeds. If the cutover fails, restore that URL; no quote or customer data needs to be rolled back because the AI database stores jobs and audit only.

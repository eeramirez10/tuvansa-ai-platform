# Semantic service cutover

The unified API can replace the pure semantic routes without changing response contracts.
Keep the previous services running during the validation window.

## Core backend

Point local temporary product vector operations to:

```dotenv
GPT_LOCAL_PRODUCTS_URL=http://localhost:4700/api/local-products-semantic
GPT_LOCAL_PRODUCTS_API_KEY=
```

Use the same value in `LOCAL_PRODUCTS_INTERNAL_API_KEY` when an internal key is enabled.

## Current AI backend proxy

Point the semantic catalog proxy to:

```dotenv
CATALOG_V2_SEMANTIC_SEARCH_URL=http://localhost:4700/api/vector-catalog/search/semantic
```

This keeps `/api/ai/products/similar-v2/semantic` on the current AI backend while the
frontend remains unchanged.

## Direct frontend cutover

After proxy validation, the frontend can use the unified API base URL and keep this path:

```dotenv
VITE_AI_SIMILAR_PRODUCTS_SEMANTIC_PATH=/api/ai/products/similar-v2/semantic
```

## Validation order

1. Compare the first ten EANs returned by the old and unified semantic routes.
2. Confirm every result has `rankingStrategy=SEMANTIC_ONLY` and no duplicate EAN.
3. Confirm ERP branch code, stock, currency, average cost and last cost.
4. Create, edit and deactivate one local product and verify Pinecone synchronization.
5. Keep the old routes available until frontend and core logs show no compatibility errors.

Hybrid search and bulk catalog indexing still belong to `tuvansa-backend-gpt` until their
separate migration is complete.

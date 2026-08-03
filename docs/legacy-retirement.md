# Legacy AI backend retirement

## Migrated operational capabilities

- Quote extraction from text, digital PDF and XLSX.
- Seller quote Excel extraction.
- Supplier quote extraction.
- Technical data, missing product and internal catalog-code suggestions.
- Pure semantic and hybrid Proscai catalog search.
- EAN deduplication and ERP availability expansion.
- Local product semantic lifecycle.
- Proscai vector projection, synchronization and evaluation jobs.

## Intentionally retired GPT experiments

The following `tuvansa-backend-gpt` endpoints have no active cotizador consumer and are not part of the production cutover:

- Legacy SQL/product matching and quote transformation routes under `/api/gpt`.
- Inventory quality, first-word and family-analysis reports.
- Normalized-product table maintenance and technical-summary/image experiments.
- The original non-variant vector index endpoints.

They remain available only in Git history. Do not expose them from the unified backend without a concrete business owner, authorization model and data-retention requirement.

## Retirement gate

Keep `New project` and `tuvansa-backend-gpt` deploys available during the production validation window. Retire them after:

1. Frontend production uses the authenticated core proxy.
2. Core local-product traffic uses the unified backend.
3. Extraction, semantic search and structured assistance succeed in production.
4. No legacy endpoint traffic is observed for the agreed validation period.

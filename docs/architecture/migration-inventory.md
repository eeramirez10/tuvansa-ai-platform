# AI backend migration inventory

## Source: tuvansa-ai-backend (`New project`)

- Quote document extraction from PDF and XLSX.
- Text quote extraction.
- Seller quote Excel extraction.
- Supplier quote extraction.
- Missing product normalization.
- Technical data suggestion, single and batch.
- Quote catalog code suggestion.
- Similar product facade calls.
- PostgreSQL extraction jobs.
- Optional OCR implementation currently disabled.

## Source: tuvansa-backend-gpt

- Proscai catalog vector indexing.
- Embedding-only and hybrid semantic search.
- Catalog variant generation and synchronization.
- EAN-aware ranking and deduplication.
- Local product semantic search, upsert and delete.
- Catalog search evaluation jobs.
- Inventory quality and normalization reports.
- Legacy GPT SQL and product analysis endpoints requiring separate review.

## Migration order

1. Text quote extraction.
2. PDF/XLSX quote extraction.
3. Seller quote Excel extraction.
4. Supplier quote extraction.
5. Technical data and catalog code suggestions.
6. Local product vector lifecycle.
7. Catalog semantic search and ranking.
8. Catalog indexing and evaluation.
9. Review and either migrate or retire legacy GPT analysis endpoints.

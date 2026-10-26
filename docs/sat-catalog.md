# SAT product and service catalog

The product-onboarding form searches the SAT catalog through the AI platform's PostgreSQL database. It does not use Neon or call the SAT website for every keystroke. Buyers can still enter a valid eight-digit code manually; suggestions are not an automatic classification decision.

The initial workbook supplied for this import has 52,513 unique codes and a publication date of 2022-12-21. That date does not establish that it is the latest SAT revision. Replace it with a newer official workbook when available, and review any validity changes before using new codes operationally.

## Import

1. Back up the AI platform PostgreSQL database.
2. Apply the additive Prisma migration for `sat_catalog_entries` and `sat_catalog_imports`.
3. Build the AI platform and run `pnpm sat:import /absolute/path/to/catalog.xlsx` with `DATABASE_URL` pointing to the AI platform PostgreSQL database. The importer accepts sheets named `c_ClaveProdServ` or `Hoja1` and rejects duplicate codes or fewer than 50,000 entries.
4. Verify `SELECT row_count, catalog_published_at, imported_at FROM sat_catalog_imports;` and search for known codes such as `40141600`.

The import is transactional and repeatable. It updates changed rows and removes codes absent from the replacement workbook. The import does not run during an API deploy and never modifies the core/Neon database.

The authenticated core backend proxies `POST /api/sat-catalog/search` to the AI platform's internal endpoint. Its existing `AI_PLATFORM_INTERNAL_API_KEY` must match the AI platform's `INTERNAL_API_KEY`.

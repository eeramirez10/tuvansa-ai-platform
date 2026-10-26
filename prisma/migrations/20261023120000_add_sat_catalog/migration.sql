CREATE TABLE "sat_catalog_entries" (
    "code" VARCHAR(8) NOT NULL,
    "description" TEXT NOT NULL,
    "similar_words" TEXT NOT NULL DEFAULT '',
    "search_text" TEXT NOT NULL,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    CONSTRAINT "sat_catalog_entries_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "sat_catalog_entries_search_idx"
    ON "sat_catalog_entries" USING GIN (to_tsvector('spanish', "search_text"));
CREATE INDEX "sat_catalog_entries_preferred_idx" ON "sat_catalog_entries" ("preferred");

CREATE TABLE "sat_catalog_imports" (
    "id" BOOLEAN NOT NULL DEFAULT true,
    "source_sha256" VARCHAR(64) NOT NULL,
    "catalog_published_at" TIMESTAMP(3),
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_count" INTEGER NOT NULL,
    CONSTRAINT "sat_catalog_imports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sat_catalog_imports_singleton" CHECK ("id" = true)
);

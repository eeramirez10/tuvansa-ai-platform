import { Router } from "express";
import { PlatformPrismaClient } from "../../shared/infrastructure/database/prisma-client";

export interface SatCatalogEntry {
  code: string;
  description: string;
  similarWords: string;
  validFrom: Date | null;
  validTo: Date | null;
}

export const normalizeSatSearch = (value: string): string => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

// Boost familiar product families, but never hide the rest of the SAT catalog.
export const isPreferredSatCode = (code: string): boolean => [
  "401416", "401417", "4015", "4017", "4018", "3010", "3011", "3116", "3117", "3123",
].some((prefix) => code.startsWith(prefix));

const queryTerms = (value: string): string[] => [...new Set(normalizeSatSearch(value)
  .split(" ")
  .filter((word) => word.length >= 3 && !["para", "con", "del", "las", "los", "por", "una", "uno", "pza", "pieza"].includes(word)))]
  .slice(0, 10);

interface SearchRow {
  code: string;
  description: string;
  preferred: boolean;
  score: number;
}

export const createSatCatalogRoutes = (prisma: PlatformPrismaClient): Router => {
  const router = Router();
  router.post("/sat-catalog/search", async (req, res, next) => {
    try {
      const raw = req.body?.query;
      if (typeof raw !== "string" || raw.trim().length < 2 || raw.length > 180) {
        res.status(400).json({ error: "La búsqueda SAT debe tener entre 2 y 180 caracteres." });
        return;
      }
      const terms = queryTerms(raw);
      const codePrefix = /^\d{2,8}$/.test(raw.trim()) ? `${raw.trim()}%` : "";
      if (!terms.length && !codePrefix) {
        res.json({ items: [] });
        return;
      }
      const tsQuery = terms.join(" | ");
      const rows = await prisma.$queryRawUnsafe<SearchRow[]>(`
        SELECT code, description, preferred,
          (CASE WHEN $1 <> '' AND code = left($1, length($1) - 1) THEN 100 ELSE 0 END
           + CASE WHEN $1 <> '' AND code LIKE $1 THEN 20 ELSE 0 END
           + CASE WHEN $3 <> '' AND search_text LIKE $3 || '%' THEN 5 ELSE 0 END
           + CASE WHEN preferred THEN 0.05 ELSE 0 END
           + CASE WHEN $2 <> '' THEN 10 * ts_rank_cd(to_tsvector('spanish', search_text), to_tsquery('spanish', $2)) ELSE 0 END) AS score
        FROM sat_catalog_entries
        WHERE ($1 <> '' AND code LIKE $1)
           OR ($2 <> '' AND to_tsvector('spanish', search_text) @@ to_tsquery('spanish', $2))
        ORDER BY score DESC, code ASC
        LIMIT 15`, codePrefix, tsQuery, terms[0] ?? "");
      res.json({ items: rows });
    } catch (error) { next(error); }
  });
  return router;
};

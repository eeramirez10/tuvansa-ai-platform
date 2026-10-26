import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import * as XLSX from "xlsx";
import { isPreferredSatCode, normalizeSatSearch } from "../modules/sat-catalog/sat-catalog";

interface SatRow {
  code: string;
  description: string;
  similarWords: string;
  searchText: string;
  preferred: boolean;
  validFrom: Date | null;
  validTo: Date | null;
}

const excelDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  if (typeof value === "number") {
    const parts = XLSX.SSF.parse_date_code(value);
    return parts ? new Date(Date.UTC(parts.y, parts.m - 1, parts.d)) : null;
  }
  return null;
};

export const parseSatCatalog = (buffer: Buffer, minimumRows = 50_000): { rows: SatRow[]; publishedAt: Date | null } => {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets.c_ClaveProdServ ?? workbook.Sheets.Hoja1;
  if (!sheet) throw new Error("No existe la hoja c_ClaveProdServ.");
  const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const header = values.findIndex((row) => row[0] === "c_ClaveProdServ" && row[1] === "Descripción");
  if (header < 0) throw new Error("La hoja no tiene encabezados válidos de c_ClaveProdServ.");
  const publishedAt = excelDate(values[2]?.[3]);
  const seen = new Set<string>();
  const rows: SatRow[] = [];
  for (const row of values.slice(header + 1)) {
    if (row[0] === null || row[0] === undefined || row[0] === "") continue;
    const code = String(row[0]).padStart(8, "0");
    const description = String(row[1] ?? "").trim();
    if (!/^\d{8}$/.test(code) || !description || seen.has(code)) {
      throw new Error(`Clave SAT inválida o duplicada: ${code}.`);
    }
    seen.add(code);
    const similarWords = String(row[8] ?? "").trim();
    rows.push({
      code, description, similarWords,
      searchText: normalizeSatSearch(`${description} ${similarWords}`),
      preferred: isPreferredSatCode(code),
      validFrom: excelDate(row[5]), validTo: excelDate(row[6]),
    });
  }
  if (rows.length < minimumRows) throw new Error(`Catálogo incompleto: ${rows.length} claves; se esperaban al menos ${minimumRows}.`);
  return { rows, publishedAt };
};

const main = async () => {
  const path = process.argv[2];
  const databaseUrl = process.env.DATABASE_URL;
  if (!path || !databaseUrl) throw new Error("Uso: DATABASE_URL=... node dist/scripts/import-sat-catalog.js /ruta/catalogo.xlsx");
  const source = readFileSync(path);
  const hash = createHash("sha256").update(source).digest("hex");
  const { rows, publishedAt } = parseSatCatalog(source);
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE sat_import (LIKE sat_catalog_entries INCLUDING DEFAULTS) ON COMMIT DROP");
    for (let offset = 0; offset < rows.length; offset += 500) {
      const batch = rows.slice(offset, offset + 500);
      const values: unknown[] = [];
      const placeholders = batch.map((row, index) => {
        values.push(row.code, row.description, row.similarWords, row.searchText, row.preferred, row.validFrom, row.validTo);
        return `(${Array.from({ length: 7 }, (_, field) => `$${index * 7 + field + 1}`).join(",")})`;
      }).join(",");
      await client.query(`INSERT INTO sat_import (code, description, similar_words, search_text, preferred, valid_from, valid_to) VALUES ${placeholders}`, values);
    }
    await client.query(`INSERT INTO sat_catalog_entries SELECT * FROM sat_import WHERE true
      ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, similar_words = EXCLUDED.similar_words,
      search_text = EXCLUDED.search_text, preferred = EXCLUDED.preferred,
      valid_from = EXCLUDED.valid_from, valid_to = EXCLUDED.valid_to`);
    await client.query("DELETE FROM sat_catalog_entries e WHERE NOT EXISTS (SELECT 1 FROM sat_import i WHERE i.code = e.code)");
    await client.query(`INSERT INTO sat_catalog_imports (id, source_sha256, catalog_published_at, row_count)
      VALUES (true, $1, $2, $3) ON CONFLICT (id) DO UPDATE SET source_sha256 = EXCLUDED.source_sha256,
      catalog_published_at = EXCLUDED.catalog_published_at, imported_at = CURRENT_TIMESTAMP, row_count = EXCLUDED.row_count`,
      [hash, publishedAt, rows.length]);
    await client.query("COMMIT");
    console.log(JSON.stringify({ imported: rows.length, publishedAt: publishedAt?.toISOString() ?? null, sha256: hash }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

if (require.main === module) main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

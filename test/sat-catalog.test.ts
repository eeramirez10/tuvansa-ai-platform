import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { isPreferredSatCode, normalizeSatSearch } from "../src/modules/sat-catalog/sat-catalog";
import { parseSatCatalog } from "../src/scripts/import-sat-catalog";

const workbookWithRows = (rows: unknown[][]): Buffer => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Catálogo SAT"], ["Publicación"], [null, null, null, new Date(2022, 11, 21)],
    ["c_ClaveProdServ", "Descripción", null, null, null, "Inicio de vigencia", "Fin de vigencia", null, "Palabras similares"],
    ...rows,
  ]), "c_ClaveProdServ");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellDates: true });
};

test("normaliza descripciones y solo prioriza familias industriales", () => {
  assert.equal(normalizeSatSearch("VÁLVULA de acero 2\""), "valvula de acero 2");
  assert.equal(isPreferredSatCode("40141600"), true);
  assert.equal(isPreferredSatCode("10101500"), false);
});

test("lee claves, palabras similares y fechas sin hora residual", () => {
  const { rows, publishedAt } = parseSatCatalog(workbookWithRows([
    [40141600, "Válvulas", null, null, null, new Date(2022, 0, 1), null, null, "Llaves"],
    [40171600, "Tubos", null, null, null, null, null, null, "Tubería"],
  ]), 2);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].code, "40141600");
  assert.equal(rows[0].searchText, "valvulas llaves");
  assert.equal(rows[0].validFrom?.toISOString(), "2022-01-01T00:00:00.000Z");
  assert.equal(publishedAt?.toISOString(), "2022-12-21T00:00:00.000Z");
});

test("rechaza catálogos incompletos o con claves duplicadas", () => {
  const incomplete = workbookWithRows([[40141600, "Válvulas"]]);
  assert.throws(() => parseSatCatalog(incomplete, 2), /Catálogo incompleto/);
  assert.throws(() => parseSatCatalog(workbookWithRows([
    [40141600, "Válvulas"], [40141600, "Válvulas duplicadas"],
  ]), 2), /duplicada/);
});

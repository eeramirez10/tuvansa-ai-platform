import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEanAttributes, parseEanDescription } from "../src/modules/ai-assistance/infrastructure/openai-erp-ean.extractor";

test("validates description length and keeps grounded enumerated attributes", () => {
  assert.throws(() => parseEanDescription({ description: "a" }));
  const description = "Tubo sin costura de acero al carbón, importado";
  const result = normalizeEanAttributes({ attributes: [
    { key: "kind", value: "PIPE", evidence: "Tubo", confidence: 0.95 },
    { key: "seam", value: "SEAMLESS", evidence: "sin costura", confidence: 0.9 },
    { key: "origin", value: "NATIONAL", evidence: "importado", confidence: 0.99 },
    { key: "invented", value: "CODE", evidence: "Tubo", confidence: 1 },
  ], unmapped: ["acero al carbón", "no está"] }, description);
  assert.deepEqual(result.attributes.map((entry) => entry.key), ["kind", "seam"]);
  assert.deepEqual(result.unmapped, ["acero al carbón"]);
});

test("extracts grounded flange types and faces without accepting invented attributes", () => {
  const description = 'Brida slip-on de acero al carbón 2" clase 150 cara realzada, nacional';
  const result = normalizeEanAttributes({ attributes: [
    { key: "kind", value: "FLANGE", evidence: "Brida", confidence: 0.95 },
    { key: "flangeType", value: "SLIP_ON", evidence: "slip-on", confidence: 0.95 },
    { key: "face", value: "RAISED", evidence: "cara realzada", confidence: 0.95 },
    { key: "origin", value: "IMPORTED", evidence: "nacional", confidence: 0.95 },
  ], unmapped: [] }, description);
  assert.deepEqual(result.attributes.map((entry) => entry.key), ["kind", "flangeType", "face"]);
});

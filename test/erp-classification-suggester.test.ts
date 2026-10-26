import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeClassificationSuggestions,
  parseClassificationInput,
} from "../src/modules/ai-assistance/infrastructure/openai-erp-classification.suggester";

const input = parseClassificationInput({
  description: "TUBO DE ACERO SIN COSTURA",
  groups: [{ code: "2", label: "PRODUCTO", options: [
    { code: "2TUB", description: "TUBOS" },
    { code: "2---", description: "NO ASIGNADO" },
  ] }],
});

test("classification input limits description and allowed FFAM groups", () => {
  assert.equal(input.groups[0]?.options[0]?.code, "2TUB");
  assert.throws(() => parseClassificationInput({ description: "x", groups: input.groups }), /descripción/);
  assert.throws(() => parseClassificationInput({ description: input.description, groups: [{ code: "Z", label: "Otro", options: [] }] }), /Grupo/);
});

test("classification output keeps only grounded catalog choices", () => {
  assert.deepEqual(normalizeClassificationSuggestions({ suggestions: [
    { group: "2", code: "2---", confidence: 0.99, evidence: "TUBO" },
    { group: "2", code: "2TUB", confidence: 0.92, evidence: "TUBO" },
    { group: "2", code: "2TUB", confidence: 0.93, evidence: "TUBO" },
    { group: "2", code: "2XXX", confidence: 0.99, evidence: "ACERO" },
  ] }, input), [{ group: "2", code: "2TUB", confidence: 0.92, evidence: "TUBO" }]);
  assert.deepEqual(normalizeClassificationSuggestions({ suggestions: [
    { group: "2", code: "2TUB", confidence: 0.99, evidence: "VÁLVULA" },
  ] }, input), []);
});

import assert from "node:assert/strict";
import test from "node:test";
import { groundedCustomerReference } from "../src/modules/document-extraction/domain/customer-reference";
import { UnitNormalizerService } from "../src/modules/document-extraction/infrastructure/normalization/unit-normalizer.service";
import { OpenAiQuoteTextExtractorAdapter } from "../src/modules/document-extraction/infrastructure/openai-quote-text-extractor.adapter";
import { ProcessTextExtractionJobUseCase } from "../src/modules/document-extraction/application/use-cases/process-text-extraction-job.use-case";
import { ProcessDocumentExtractionJobUseCase } from "../src/modules/document-extraction/application/use-cases/process-document-extraction-job.use-case";
import { AiJobType } from "../src/modules/job-management/domain/ai-job.entity";

test("references require source evidence and reject ambiguous or unrelated codes", () => {
  assert.equal(groundedCustomerReference("rfq-005/A", "Referencia del cliente: RFQ-005/A\nTubo"), "RFQ-005/A");
  assert.equal(groundedCustomerReference("R-07", "Requisición | R-07\nDescripción | Cantidad"), "R-07");
  assert.equal(groundedCustomerReference("Costa del Golfo", "Proyecto: Costa del Golfo"), "Costa del Golfo");
  assert.equal(groundedCustomerReference("RFQ-01", "RFQ: RFQ-01\nSolicitud: RFQ-02"), null);
  assert.equal(groundedCustomerReference("ABC", "Folio Tuvansa: ABC\nCódigo material: ABC\nRef proveedor: ABC"), null);
  assert.equal(groundedCustomerReference("RFQ-01", "RFQ: RFQ-019"), null);
  assert.equal(groundedCustomerReference("REQ-02", "Tubería\nEXTRACTION_HINTS\nSolicitud: REQ-02"), null);
  assert.equal(groundedCustomerReference(null, "Referencia del cliente: REQ-02"), null);
});

test("quote extractor schema is nullable and can detect TON and reference together", async () => {
  const adapter = new OpenAiQuoteTextExtractorAdapter("fixture", "fixture");
  const client = (adapter as unknown as { client: { chat: { completions: { create: (input: any) => Promise<any> } } } }).client;
  client.chat.completions.create = async input => {
    const schema = input.response_format.json_schema.schema;
    assert.ok(schema.required.includes("customer_reference"));
    assert.deepEqual(schema.properties.customer_reference.type, ["string", "null"]);
    return { choices: [{ message: { content: JSON.stringify({
      customer_reference: "RFQ-07", customer: null, items: [{
        description_original: "Tubo de acero", description_normalizada: "Tubo de acero",
        cantidad: 2, unidad_original: "toneladas", unidad_normalizada: "TON", idioma: "es", requiere_revision: false,
      }],
    }) } }] };
  };
  const result = await adapter.extract("RFQ: RFQ-07\n2 toneladas de tubo de acero");
  assert.equal(result.customerReference, "RFQ-07");
  assert.equal(result.items[0].toPrimitives().unidad_normalizada, "TON");
  assert.equal(new UnitNormalizerService(true).normalize("tonelada"), "TON");
  assert.equal(new UnitNormalizerService().normalize("tonelada"), null);
});

test("text and document jobs return the same optional reference field", async () => {
  const extractor = { extract: async () => ({
    items: [], customer: null, customerReference: "RFQ-07", usage: { provider: "test", model: "test", latencyMs: 0 },
  }) };
  for (const [type, input, fileType] of [
    [AiJobType.QUOTE_TEXT_EXTRACTION, { text: "RFQ: RFQ-07" }, "text"],
    [AiJobType.QUOTE_DOCUMENT_EXTRACTION, { fileName: "solicitud.pdf", filePath: "/tmp/fixture.pdf", mimeType: "application/pdf" }, "pdf"],
    [AiJobType.QUOTE_DOCUMENT_EXTRACTION, { fileName: "solicitud.xlsx", filePath: "/tmp/fixture.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, "xlsx"],
  ] as const) {
    let result: any;
    const repo = {
      markProcessing: async () => ({ type, input }),
      updateProgress: async () => {}, recordRun: async () => {},
      markCompleted: async (_id: string, payload: unknown) => { result = payload; },
    } as unknown as ConstructorParameters<typeof ProcessTextExtractionJobUseCase>[0];
    if (type === AiJobType.QUOTE_TEXT_EXTRACTION) {
      await new ProcessTextExtractionJobUseCase(repo, extractor).execute("job");
    } else {
      await new ProcessDocumentExtractionJobUseCase(repo,
        { read: async () => Buffer.from("fixture"), remove: async () => {}, save: async () => { throw new Error("unused"); } },
        { extract: async () => ({ textContent: "RFQ: RFQ-07", extractionHints: null, fileType }) },
        extractor,
        { extract: async () => { throw new Error("unexpected seller import"); } },
        { extract: async () => { throw new Error("unexpected supplier import"); } },
      ).execute("job");
    }
    assert.equal(result.customer_reference, "RFQ-07");
    assert.equal(result.file_type, fileType);
  }
});

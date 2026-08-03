import assert from "node:assert/strict";
import test from "node:test";
import OpenAI from "openai";
import { OpenAiSupplierQuoteExtractorAdapter } from "../src/modules/document-extraction/infrastructure/openai-supplier-quote-extractor.adapter";

test("retries item extraction when a supplier table returns no items", async () => {
  const responses = [
    {
      supplier: {
        name: "PROVEEDOR INDUSTRIAL",
        taxId: null,
        state: null,
        contactName: null,
        email: null,
        phone: null,
        confidence: 0.9,
        evidence: "PROVEEDOR INDUSTRIAL",
      },
      header: {
        reference: "TVP-0088",
        quoteDate: "2026-07-29",
        validUntil: null,
        currency: "USD",
        exchangeRate: null,
        paymentTerms: null,
        deliveryTerms: null,
      },
      totals: {
        subtotal: 39882.75,
        discount: null,
        freight: null,
        otherCharges: null,
        taxIncluded: false,
        taxRate: 16,
        tax: 6381.24,
        total: 46263.99,
      },
      items: [],
      warnings: [],
    },
    {
      items: [{
        lineNumber: "1",
        supplierProductCode: null,
        alternateCodes: [],
        description: "TUBO ACERO AL CARBON 6 PULGADAS CEDULA 10",
        quantity: 1331.2,
        unit: "MTS",
        listUnitPrice: 29.96,
        discountPct: null,
        netUnitPrice: 29.96,
        subtotal: 39882.75,
        brand: "EAST STEEL",
        origin: null,
        deliveryTime: "INMEDIATO",
        availableDate: null,
        minimumQuantity: null,
        confidence: 0.95,
        requiresReview: false,
        evidence: "1 1331.20 MTS TUBO ACERO 6 C-10 $29.96 $39,882.75",
      }],
      warnings: [],
    },
  ];
  const responseFormats: string[] = [];
  let calls = 0;
  const client = {
    chat: {
      completions: {
        create: async (request: { response_format?: { type?: string } }) => {
          responseFormats.push(request.response_format?.type ?? "");
          const response = responses[calls++];
          return {
            choices: [{ message: { content: JSON.stringify(response) } }],
            usage: { prompt_tokens: 100, completion_tokens: 25 },
          };
        },
      },
    },
  } as unknown as OpenAI;
  const extractor = new OpenAiSupplierQuoteExtractorAdapter("unused", "test-model", client);

  const extraction = await extractor.extract(
    "No. Cantidad U.M. Descripcion P.U. Importe\n" +
      "1 1331.20 MTS TUBO ACERO AL CARBON 6 C-10 $29.96 $39,882.75",
    "supplier.pdf",
  );

  assert.equal(calls, 2);
  assert.deepEqual(responseFormats, ["json_schema", "json_schema"]);
  assert.equal(extraction.result.items.length, 1);
  assert.equal(extraction.result.items[0]?.quantity, 1331.2);
  assert.equal(extraction.usage.inputTokens, 200);
  assert.equal(extraction.usage.outputTokens, 50);
});

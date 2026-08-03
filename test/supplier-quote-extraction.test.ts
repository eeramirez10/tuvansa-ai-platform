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
        country: null,
        contactName: null,
        email: null,
        phone: null,
        contacts: [],
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

test("normalizes and deduplicates multiple supplier contacts", async () => {
  const response = {
    supplier: {
      name: "PROVEEDOR INDUSTRIAL",
      taxId: null,
      state: null,
      country: "MÉXICO",
      contactName: "Ventas",
      email: "ventas@example.com",
      phone: "81 1234 5678",
      contacts: [
        { channel: "EMAIL", value: "ventas@example.com", phoneKind: null, extension: null, isWhatsApp: false, contactName: "Ventas", label: "Ventas", confidence: 0.95, evidence: "ventas@example.com" },
        { channel: "EMAIL", value: "VENTAS@example.com", phoneKind: null, extension: null, isWhatsApp: false, contactName: null, label: null, confidence: 0.9, evidence: null },
        { channel: "PHONE", value: "81 1234 5678", phoneKind: "LANDLINE", extension: "204", isWhatsApp: false, contactName: "Ventas", label: "Tel", confidence: 0.9, evidence: "Tel. 81 1234 5678 ext. 204" },
        { channel: "PHONE", value: "81 9999 0000", phoneKind: "MOBILE", extension: null, isWhatsApp: true, contactName: "Ventas", label: "WhatsApp", confidence: 0.98, evidence: "WhatsApp 81 9999 0000" },
      ],
      confidence: 0.95,
      evidence: "PROVEEDOR INDUSTRIAL",
    },
    header: { reference: null, quoteDate: null, validUntil: null, currency: "MXN", exchangeRate: null, paymentTerms: null, deliveryTerms: null },
    totals: { subtotal: null, discount: null, freight: null, otherCharges: null, taxIncluded: null, taxRate: null, tax: null, total: null },
    items: [],
    warnings: [],
  };
  const client = { chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify(response) } }], usage: {} }) } } } as unknown as OpenAI;
  const extractor = new OpenAiSupplierQuoteExtractorAdapter("unused", "test-model", client);

  const extraction = await extractor.extract("PROVEEDOR INDUSTRIAL", "supplier.pdf");

  assert.equal(extraction.result.supplier.contacts.length, 3);
  assert.equal(extraction.result.supplier.email, "ventas@example.com");
  assert.equal(extraction.result.supplier.phone, "81 1234 5678");
  assert.equal(extraction.result.supplier.contacts[2]?.isWhatsApp, true);
  assert.equal(extraction.result.supplier.contacts[1]?.extension, "204");
});

import assert from "node:assert/strict";
import test from "node:test";
import OpenAI from "openai";
import { OpenAiPdfOcrTextReaderAdapter } from "../src/modules/document-extraction/infrastructure/openai-pdf-ocr-text-reader.adapter";

test("sends PDF OCR input as an application/pdf data URL", async () => {
  let fileData: string | undefined;
  const client = {
    responses: {
      create: async (request: {
        input: Array<{ content: Array<{ type: string; file_data?: string }> }>;
      }) => {
        fileData = request.input[0]?.content[1]?.file_data;
        return { output_text: "  TEXTO EXTRAIDO  " };
      },
    },
  } as unknown as OpenAI;
  const reader = new OpenAiPdfOcrTextReaderAdapter("unused", "test-model", client);

  const text = await reader.read(Buffer.from("%PDF-1.7 test"));

  assert.equal(text, "TEXTO EXTRAIDO");
  assert.equal(fileData, `data:application/pdf;base64,${Buffer.from("%PDF-1.7 test").toString("base64")}`);
});

test("rejects an empty PDF before calling OpenAI", async () => {
  let calls = 0;
  const client = {
    responses: {
      create: async () => {
        calls += 1;
        return { output_text: "" };
      },
    },
  } as unknown as OpenAI;
  const reader = new OpenAiPdfOcrTextReaderAdapter("unused", "test-model", client);

  await assert.rejects(reader.read(Buffer.alloc(0)), /PDF vacio/);
  assert.equal(calls, 0);
});

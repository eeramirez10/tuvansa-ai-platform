import assert from "node:assert/strict";
import test from "node:test";
import { CustomerAssistantToolPort } from "../src/modules/customer-whatsapp-assistant/application/ports/customer-assistant-tool.port";
import { OpenAiCustomerWhatsAppAssistant } from "../src/modules/customer-whatsapp-assistant/infrastructure/openai-customer-whatsapp-assistant";

class ToolStub extends CustomerAssistantToolPort {
  calls: Array<{ conversationId: string; turnId: string; name: string; arguments: Record<string, unknown> }> = [];

  async execute(input: { conversationId: string; turnId: string; name: string; arguments: Record<string, unknown> }) {
    this.calls.push(input);
    return { quotes: [{ quoteNumber: "QT-1", status: "QUOTED" }] };
  }
}

test("uses Responses API function tools before answering with quote data", async () => {
  const responses = [
    {
      id: "resp-1",
      output_text: "",
      output: [{ type: "function_call", call_id: "call-1", name: "list_customer_quotes", arguments: '{"limit":5}' }],
    },
    {
      id: "resp-2",
      output_text: "Encontré la cotización QT-1, actualmente cotizada.",
      output: [{ type: "message" }],
    },
  ];
  const createInputs: Record<string, unknown>[] = [];
  const client = {
    responses: {
      create: async (input: Record<string, unknown>) => {
        createInputs.push(input);
        const response = responses.shift();
        if (!response) throw new Error("Unexpected response call");
        return response;
      },
    },
  };
  const tools = new ToolStub();
  const assistant = new OpenAiCustomerWhatsAppAssistant("test", "test-model", tools, 4, client as never);

  const result = await assistant.respond({
    turnId: "turn-1",
    conversationId: "conversation-1",
    participantPhone: "+525511223344",
    message: "¿Cómo van las propuestas que me enviaron?",
    mediaCount: 0,
    previousResponseId: null,
  });

  assert.equal(result.responseId, "resp-2");
  assert.equal(tools.calls.length, 1);
  assert.deepEqual(tools.calls[0], {
    conversationId: "conversation-1",
    turnId: "turn-1",
    name: "list_customer_quotes",
    arguments: { limit: 5 },
  });
  assert.equal(createInputs[1].previous_response_id, "resp-1");
  assert.equal(createInputs[1].parallel_tool_calls, false);
});

test("restarts context when OpenAI no longer has the previous response", async () => {
  const createInputs: Record<string, unknown>[] = [];
  const client = {
    responses: {
      create: async (input: Record<string, unknown>) => {
        createInputs.push(input);
        if (createInputs.length === 1) {
          throw Object.assign(new Error("previous_response_id was not found"), { status: 404 });
        }
        return { id: "resp-new", output_text: "Puedo ayudarte con tu cotización.", output: [{ type: "message" }] };
      },
    },
  };
  const assistant = new OpenAiCustomerWhatsAppAssistant("test", "test-model", new ToolStub(), 4, client as never);

  const result = await assistant.respond({
    turnId: "turn-2",
    conversationId: "conversation-1",
    participantPhone: "+525511223344",
    message: "¿Cómo va mi cotización?",
    mediaCount: 0,
    previousResponseId: "resp-expired",
  });

  assert.equal(result.responseId, "resp-new");
  assert.equal(createInputs[0].previous_response_id, "resp-expired");
  assert.equal(createInputs[1].previous_response_id, undefined);
});

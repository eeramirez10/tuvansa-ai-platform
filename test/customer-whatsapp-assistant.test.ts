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
    message: "¿Cómo van las propuestas que me enviaron?",
    mediaCount: 0,
    previousResponseId: null,
    principal: {
      audience: "CUSTOMER",
      isVerified: false,
      capabilities: ["CUSTOMER_QUOTES", "CUSTOMER_QUOTE_ACTIONS"],
    },
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
    message: "¿Cómo va mi cotización?",
    mediaCount: 0,
    previousResponseId: "resp-expired",
    principal: {
      audience: "CUSTOMER",
      isVerified: false,
      capabilities: ["CUSTOMER_QUOTES", "CUSTOMER_QUOTE_ACTIONS"],
    },
  });

  assert.equal(result.responseId, "resp-new");
  assert.equal(createInputs[0].previous_response_id, "resp-expired");
  assert.equal(createInputs[1].previous_response_id, undefined);
});

test("acknowledges inbound files by name without claiming they cannot be read", async () => {
  const createInputs: Record<string, unknown>[] = [];
  const client = {
    responses: {
      create: async (input: Record<string, unknown>) => {
        createInputs.push(input);
        return { id: "resp-file", output_text: "Recibí materiales.xlsx. ¿Quieres que lo usemos para preparar tu cotización?", output: [{ type: "message" }] };
      },
    },
  };
  const assistant = new OpenAiCustomerWhatsAppAssistant("test", "test-model", new ToolStub(), 4, client as never);

  await assistant.respond({
    turnId: "turn-file",
    conversationId: "conversation-file",
    message: "Te envío la lista",
    mediaCount: 1,
    attachments: [{ originalName: "materiales.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
    previousResponseId: null,
    principal: { audience: "UNKNOWN", isVerified: false, capabilities: ["LEAD_INTAKE"] },
  });

  const initialInput = createInputs[0].input as Array<{ content: string }>;
  assert.match(initialInput[0].content, /materiales\.xlsx/);
  assert.match(initialInput[0].content, /preparar una cotización/);
  assert.doesNotMatch(initialInput[0].content, /lectura de archivos todavía no está habilitada/i);
  assert.match(String(createInputs[0].instructions), /Nunca digas que no puedes recibir o leer documentos e imágenes/);
});

test("voice notes are not presented as unnamed quote files", async () => {
  const createInputs: Record<string, unknown>[] = [];
  const client = {
    responses: {
      create: async (input: Record<string, unknown>) => {
        createInputs.push(input);
        return { id: "resp-audio", output_text: "Por ahora no puedo recibir notas de voz. ¿Podrías escribirme tu solicitud?", output: [{ type: "message" }] };
      },
    },
  };
  const assistant = new OpenAiCustomerWhatsAppAssistant("test", "test-model", new ToolStub(), 4, client as never);

  await assistant.respond({
    turnId: "turn-audio",
    conversationId: "conversation-audio",
    message: "Nota de voz recibida (no compatible)",
    mediaCount: 1,
    hasUnsupportedAudio: true,
    attachments: [],
    previousResponseId: null,
    principal: { audience: "CUSTOMER", isVerified: false, capabilities: ["CUSTOMER_QUOTES"] },
  });

  const initialInput = createInputs[0].input as Array<{ content: string }>;
  assert.match(initialInput[0].content, /No aceptamos ni transcribimos audios/);
  assert.doesNotMatch(initialInput[0].content, /nombre pendiente de sincronización|archivo\(s\)/i);
});

test("unverified internal users only receive verification tools", async () => {
  const createInputs: Record<string, unknown>[] = [];
  const client = {
    responses: {
      create: async (input: Record<string, unknown>) => {
        createInputs.push(input);
        return { id: "resp-internal", output_text: "Verifica tu identidad.", output: [{ type: "message" }] };
      },
    },
  };
  const assistant = new OpenAiCustomerWhatsAppAssistant("test", "test-model", new ToolStub(), 4, client as never);

  await assistant.respond({
    turnId: "turn-internal",
    conversationId: "conversation-internal",
    message: "Dame el reporte de este mes",
    mediaCount: 0,
    previousResponseId: null,
    principal: {
      audience: "INTERNAL_USER",
      isVerified: false,
      capabilities: ["INTERNAL_VERIFICATION"],
    },
  });

  const toolNames = (createInputs[0].tools as Array<{ name: string }>).map((tool) => tool.name);
  assert.deepEqual(toolNames, ["request_internal_verification", "verify_internal_code"]);
  assert.doesNotMatch(String(createInputs[0].instructions), /list_customer_quotes/);
});

test("verified credit and collections users only receive onboarding tools", async () => {
  const createInputs: Record<string, unknown>[] = [];
  const client = { responses: { create: async (input: Record<string, unknown>) => {
    createInputs.push(input);
    return { id: "resp-cxc", output_text: "Consulto las altas de tu sucursal.", output: [{ type: "message" }] };
  } } };
  const assistant = new OpenAiCustomerWhatsAppAssistant("test", "test-model", new ToolStub(), 4, client as never);
  await assistant.respond({ turnId: "turn-cxc", conversationId: "conversation-cxc", message: "¿Qué altas están pendientes?",
    mediaCount: 0, previousResponseId: null,
    principal: { audience: "INTERNAL_USER", isVerified: true, capabilities: ["INTERNAL_ONBOARDINGS"] } });
  assert.deepEqual((createInputs[0].tools as Array<{ name: string }>).map((tool) => tool.name),
    ["list_internal_onboardings", "get_internal_onboarding"]);
  assert.doesNotMatch(String(createInputs[0].instructions), /get_internal_performance/);
});

test("unknown numbers receive no data tools", async () => {
  const createInputs: Record<string, unknown>[] = [];
  const client = {
    responses: {
      create: async (input: Record<string, unknown>) => {
        createInputs.push(input);
        return { id: "resp-unknown", output_text: "Comunícate con tu ejecutivo.", output: [{ type: "message" }] };
      },
    },
  };
  const assistant = new OpenAiCustomerWhatsAppAssistant("test", "test-model", new ToolStub(), 4, client as never);

  await assistant.respond({
    turnId: "turn-unknown",
    conversationId: "conversation-unknown",
    message: "Muéstrame cotizaciones",
    mediaCount: 0,
    previousResponseId: null,
    principal: { audience: "UNKNOWN", isVerified: false, capabilities: [] },
  });

  assert.deepEqual(createInputs[0].tools, []);
});

test("shared customer phones must provide a folio and cannot list quotes or start onboarding", async () => {
  const createInputs: Record<string, unknown>[] = [];
  const client = { responses: { create: async (input: Record<string, unknown>) => {
    createInputs.push(input);
    return { id: "resp-shared", output_text: "¿Me compartes el folio de tu cotización?", output: [{ type: "message" }] };
  } } };
  const assistant = new OpenAiCustomerWhatsAppAssistant("test", "test-model", new ToolStub(), 4, client as never);

  await assistant.respond({
    turnId: "turn-shared", conversationId: "conversation-shared", message: "¿Cómo va mi cotización?",
    mediaCount: 0, previousResponseId: null,
    principal: { audience: "CUSTOMER", isVerified: false, sharedCustomerPhone: true, capabilities: ["CUSTOMER_QUOTES", "CUSTOMER_QUOTE_ACTIONS"] },
  });

  const names = (createInputs[0].tools as Array<{ name: string }>).map((tool) => tool.name);
  assert.ok(names.includes("get_quote_details"));
  assert.ok(!names.includes("list_customer_quotes"));
  assert.ok(!names.includes("get_customer_onboarding"));
  assert.match(String(createInputs[0].instructions), /solicita su folio/);
});

test("unknown numbers with lead intake can save prospect data but cannot access quotes", async () => {
  const createInputs: Record<string, unknown>[] = [];
  const client = {
    responses: {
      create: async (input: Record<string, unknown>) => {
        createInputs.push(input);
        return { id: "resp-lead", output_text: "Registré tu solicitud.", output: [{ type: "message" }] };
      },
    },
  };
  const assistant = new OpenAiCustomerWhatsAppAssistant("test", "test-model", new ToolStub(), 4, client as never);

  await assistant.respond({
    turnId: "turn-lead",
    conversationId: "conversation-lead",
    message: "Soy Ana de Aceros del Centro y necesito 20 metros de tubería",
    mediaCount: 0,
    previousResponseId: null,
    principal: { audience: "UNKNOWN", isVerified: false, capabilities: ["LEAD_INTAKE"] },
  });

  const toolNames = (createInputs[0].tools as Array<{ name: string }>).map((tool) => tool.name);
  assert.deepEqual(toolNames, [
    "get_whatsapp_lead",
    "update_whatsapp_lead",
    "upsert_whatsapp_quote_request",
    "close_whatsapp_quote_request",
  ]);
  assert.ok(!toolNames.includes("list_customer_quotes"));
  assert.match(String(createInputs[0].instructions), /Trátalo como un prospecto/);
  assert.match(String(createInputs[0].instructions), /falta el correo, solicítalo explícitamente/);
});

test("known customers receive quote request lifecycle tools", async () => {
  const createInputs: Record<string, unknown>[] = [];
  const client = {
    responses: {
      create: async (input: Record<string, unknown>) => {
        createInputs.push(input);
        return { id: "resp-request", output_text: "Registré tu nueva solicitud.", output: [{ type: "message" }] };
      },
    },
  };
  const assistant = new OpenAiCustomerWhatsAppAssistant("test", "test-model", new ToolStub(), 4, client as never);

  await assistant.respond({
    turnId: "turn-request",
    conversationId: "conversation-customer",
    message: "Ahora necesito cotizar válvulas de 4 pulgadas",
    mediaCount: 0,
    previousResponseId: null,
    principal: {
      audience: "CUSTOMER",
      isVerified: false,
      capabilities: ["CUSTOMER_QUOTES", "CUSTOMER_QUOTE_ACTIONS", "QUOTE_REQUESTS"],
    },
  });

  const toolNames = (createInputs[0].tools as Array<{ name: string }>).map((tool) => tool.name);
  assert.deepEqual(toolNames.slice(0, 3), [
    "get_whatsapp_lead",
    "upsert_whatsapp_quote_request",
    "close_whatsapp_quote_request",
  ]);
  assert.match(String(createInputs[0].instructions), /otra cotización independiente/);
  assert.ok(!toolNames.includes("get_customer_onboarding"));
  assert.doesNotMatch(String(createInputs[0].instructions), /Solicita primero la Constancia/);
  assert.match(String(createInputs[0].instructions), /Este cliente ya está registrado en ERP/);
});

test("local customers can send a fiscal PDF for seller review after accepting a quote", async () => {
  const createInputs: Record<string, unknown>[] = [];
  const client = {
    responses: {
      create: async (input: Record<string, unknown>) => {
        createInputs.push(input);
        return { id: "resp-onboarding", output_text: "Envíame tu constancia fiscal.", output: [{ type: "message" }] };
      },
    },
  };
  const assistant = new OpenAiCustomerWhatsAppAssistant("test", "test-model", new ToolStub(), 4, client as never);

  await assistant.respond({
    turnId: "turn-onboarding",
    conversationId: "conversation-local",
    message: "Acepto la cotización",
    mediaCount: 0,
    previousResponseId: null,
    principal: {
      audience: "CUSTOMER",
      isVerified: false,
      capabilities: ["CUSTOMER_QUOTES", "CUSTOMER_QUOTE_ACTIONS", "CUSTOMER_ONBOARDING"],
    },
  });

  const toolNames = (createInputs[0].tools as Array<{ name: string }>).map((tool) => tool.name);
  assert.ok(toolNames.includes("get_customer_onboarding"));
  assert.ok(!toolNames.includes("process_customer_tax_document"));
  assert.match(String(createInputs[0].instructions), /Solo inicia un alta fiscal si confirm_quote_acceptance devuelve customerOnboarding/);
  assert.match(String(createInputs[0].instructions), /su ejecutivo lo revisará antes de extraer los datos/);
});

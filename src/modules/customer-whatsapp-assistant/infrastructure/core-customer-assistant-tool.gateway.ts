import { CustomerAssistantToolPort } from "../application/ports/customer-assistant-tool.port";

export class CoreCustomerAssistantToolGateway extends CustomerAssistantToolPort {
  constructor(
    private readonly baseUrl: string,
    private readonly internalApiKey: string,
    private readonly timeoutMs = 30_000,
  ) {
    super();
  }

  async execute(input: {
    conversationId: string;
    turnId: string;
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<unknown> {
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/api/internal/whatsapp-assistant/tools`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-api-key": this.internalApiKey },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      return {
        error: typeof payload.error === "string" ? payload.error : "CORE_TOOL_FAILED",
        status: response.status,
      };
    }
    return payload.result;
  }
}

import type { Request, Response } from "express";
import type { WhatsAppAssistantPrincipal } from "../domain/customer-assistant.types";
import type { OpenAiCustomerWhatsAppAssistant } from "../infrastructure/openai-customer-whatsapp-assistant";

export class CustomerWhatsAppAssistantController {
  constructor(private readonly assistant: OpenAiCustomerWhatsAppAssistant) {}

  respond = async (req: Request, res: Response): Promise<void> => {
    const turnId = this.text(req.body?.turnId);
    const conversationId = this.text(req.body?.conversationId);
    const message = this.text(req.body?.message);
    const mediaCount = typeof req.body?.mediaCount === "number" ? Math.max(0, Math.trunc(req.body.mediaCount)) : 0;
    const attachments = this.attachments(req.body?.attachments);
    const previousResponseId = this.text(req.body?.previousResponseId) || null;
    const principal = this.principal(req.body?.principal);
    if (!turnId || !conversationId || !message) {
      res.status(400).json({ error: "turnId, conversationId and message are required." });
      return;
    }
    const result = await this.assistant.respond({
      turnId,
      conversationId,
      message,
      mediaCount,
      attachments,
      previousResponseId,
      principal,
    });
    res.status(200).json(result);
  };

  private text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  private attachments(value: unknown): Array<{ id: string; originalName: string; mimeType: string }> {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 10).flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const candidate = item as Record<string, unknown>;
      const originalName = this.text(candidate.originalName).slice(0, 255);
      const id = this.text(candidate.id);
      if (!id || !originalName) return [];
      return [{
        id,
        originalName,
        mimeType: this.text(candidate.mimeType).slice(0, 120) || "application/octet-stream",
      }];
    });
  }

  private principal(value: unknown): WhatsAppAssistantPrincipal {
    const input = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    const audience = ["CUSTOMER", "INTERNAL_USER", "UNKNOWN"].includes(`${input.audience}`)
      ? input.audience as WhatsAppAssistantPrincipal["audience"]
      : "UNKNOWN";
    const allowedCapabilities = new Set<WhatsAppAssistantPrincipal["capabilities"][number]>([
      "CUSTOMER_QUOTES",
      "CUSTOMER_QUOTE_ACTIONS",
      "CUSTOMER_ONBOARDING",
      "INTERNAL_VERIFICATION",
      "INTERNAL_REPORTS",
      "INTERNAL_QUOTES",
      "LEAD_INTAKE",
      "QUOTE_REQUESTS",
    ]);
    const capabilities = Array.isArray(input.capabilities)
      ? input.capabilities.filter((item): item is WhatsAppAssistantPrincipal["capabilities"][number] => (
          typeof item === "string" && allowedCapabilities.has(item as WhatsAppAssistantPrincipal["capabilities"][number])
        ))
      : [];
    return { audience, isVerified: input.isVerified === true, capabilities };
  }
}

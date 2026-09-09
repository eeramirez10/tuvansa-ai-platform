import type { Request, Response } from "express";
import type { OpenAiCustomerWhatsAppAssistant } from "../infrastructure/openai-customer-whatsapp-assistant";

export class CustomerWhatsAppAssistantController {
  constructor(private readonly assistant: OpenAiCustomerWhatsAppAssistant) {}

  respond = async (req: Request, res: Response): Promise<void> => {
    const turnId = this.text(req.body?.turnId);
    const conversationId = this.text(req.body?.conversationId);
    const participantPhone = this.text(req.body?.participantPhone);
    const message = this.text(req.body?.message);
    const mediaCount = typeof req.body?.mediaCount === "number" ? Math.max(0, Math.trunc(req.body.mediaCount)) : 0;
    const previousResponseId = this.text(req.body?.previousResponseId) || null;
    if (!turnId || !conversationId || !participantPhone || !message) {
      res.status(400).json({ error: "turnId, conversationId, participantPhone and message are required." });
      return;
    }
    const result = await this.assistant.respond({
      turnId,
      conversationId,
      participantPhone,
      message,
      mediaCount,
      previousResponseId,
    });
    res.status(200).json(result);
  };

  private text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }
}

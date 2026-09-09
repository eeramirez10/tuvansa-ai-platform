import { Router } from "express";
import type { CustomerWhatsAppAssistantController } from "./customer-whatsapp-assistant.controller";

export class CustomerWhatsAppAssistantRoutes {
  constructor(private readonly controller: CustomerWhatsAppAssistantController) {}

  build(): Router {
    const router = Router();
    router.post("/v1/assistants/customer-whatsapp/respond", this.controller.respond);
    return router;
  }
}

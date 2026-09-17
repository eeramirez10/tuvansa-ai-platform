export interface WhatsAppAssistantPrincipal {
  audience: "CUSTOMER" | "INTERNAL_USER" | "UNKNOWN";
  isVerified: boolean;
  capabilities: Array<"CUSTOMER_QUOTES" | "CUSTOMER_QUOTE_ACTIONS" | "INTERNAL_VERIFICATION" | "INTERNAL_REPORTS" | "INTERNAL_QUOTES" | "LEAD_INTAKE">;
}

export interface CustomerAssistantRequest {
  turnId: string;
  conversationId: string;
  message: string;
  mediaCount: number;
  attachments?: Array<{
    originalName: string;
    mimeType: string;
  }>;
  previousResponseId: string | null;
  principal: WhatsAppAssistantPrincipal;
}

export interface CustomerAssistantResponse {
  responseId: string;
  text: string;
}

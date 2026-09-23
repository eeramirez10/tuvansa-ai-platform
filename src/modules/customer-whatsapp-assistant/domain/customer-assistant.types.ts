export interface WhatsAppAssistantPrincipal {
  audience: "CUSTOMER" | "INTERNAL_USER" | "UNKNOWN";
  isVerified: boolean;
  sharedCustomerPhone?: boolean;
  capabilities: Array<"CUSTOMER_QUOTES" | "CUSTOMER_QUOTE_ACTIONS" | "CUSTOMER_ONBOARDING" | "INTERNAL_VERIFICATION" | "INTERNAL_REPORTS" | "INTERNAL_QUOTES" | "INTERNAL_ONBOARDINGS" | "LEAD_INTAKE" | "QUOTE_REQUESTS">;
}

export interface CustomerAssistantRequest {
  turnId: string;
  conversationId: string;
  message: string;
  mediaCount: number;
  attachments?: Array<{
    id: string;
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

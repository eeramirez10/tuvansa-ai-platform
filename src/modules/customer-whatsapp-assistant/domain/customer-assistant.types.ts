export interface CustomerAssistantRequest {
  turnId: string;
  conversationId: string;
  participantPhone: string;
  message: string;
  mediaCount: number;
  previousResponseId: string | null;
}

export interface CustomerAssistantResponse {
  responseId: string;
  text: string;
}

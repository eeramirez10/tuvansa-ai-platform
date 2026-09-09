export abstract class CustomerAssistantToolPort {
  abstract execute(input: {
    conversationId: string;
    turnId: string;
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<unknown>;
}

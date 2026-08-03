import { VoyageAIClient } from "voyageai";
import { TextEmbeddingPort } from "../application/ports/text-embedding.port";

export class VoyageTextEmbeddingAdapter implements TextEmbeddingPort {
  private readonly client: VoyageAIClient;
  private nextRequestAt = 0;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly dimension: number,
    private readonly minRequestIntervalMs: number,
  ) {
    this.client = new VoyageAIClient({ apiKey });
  }

  public async embedQuery(text: string): Promise<number[]> {
    return (await this.embed([text], "query"))[0];
  }

  public async embedDocument(text: string): Promise<number[]> {
    return (await this.embed([text], "document"))[0];
  }

  public async embedDocuments(texts: string[]): Promise<number[][]> {
    const result: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += 128) {
      result.push(...await this.embed(texts.slice(offset, offset + 128), "document"));
    }
    return result;
  }

  private async embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
    const input = texts.map((text) => text.trim());
    if (input.length === 0 || input.some((text) => !text)) {
      throw new Error("No valid text was provided for embeddings.");
    }

    await this.waitForRequestSlot();
    const response = await this.client.embed({ input, model: this.model, inputType });
    const embeddings = (response.data ?? [])
      .map((item) => item.embedding)
      .filter((item): item is number[] => Array.isArray(item));
    if (embeddings.length !== input.length) {
      throw new Error("Voyage did not return every requested embedding.");
    }
    for (const embedding of embeddings) {
      if (embedding.length !== this.dimension) {
        throw new Error(`Invalid Voyage embedding dimension ${embedding.length}; expected ${this.dimension}.`);
      }
    }
    return embeddings;
  }

  private async waitForRequestSlot(): Promise<void> {
    const now = Date.now();
    const requestAt = Math.max(now, this.nextRequestAt);
    this.nextRequestAt = requestAt + this.minRequestIntervalMs;
    if (requestAt > now) {
      await new Promise((resolve) => setTimeout(resolve, requestAt - now));
    }
  }
}

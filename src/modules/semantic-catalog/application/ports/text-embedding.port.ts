export abstract class TextEmbeddingPort {
  public abstract embedQuery(text: string): Promise<number[]>;
  public abstract embedDocument(text: string): Promise<number[]>;
  public abstract embedDocuments(texts: string[]): Promise<number[][]>;
}

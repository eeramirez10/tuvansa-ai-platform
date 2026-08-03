import { TextEmbeddingPort } from "../ports/text-embedding.port";
import { VectorIndexPort } from "../ports/vector-index.port";
import { LocalProductVectorEntity } from "../../domain/local-product-vector.entity";
import {
  LocalProductVectorMatch,
  LocalProductVectorMetadata,
  VectorMetadata,
} from "../../domain/semantic-catalog.types";

export interface LocalProductInput {
  productId: string;
  description: string;
  unit: string;
  branchId?: string | null;
}

export class LocalProductSemanticUseCase {
  private readonly searchCache = new Map<string, { expiresAt: number; items: LocalProductVectorMatch[] }>();
  private readonly searchesInFlight = new Map<string, Promise<LocalProductVectorMatch[]>>();

  constructor(
    private readonly embeddings: TextEmbeddingPort,
    private readonly vectorIndex: VectorIndexPort,
    private readonly cacheTtlMs = 30_000,
  ) {}

  public async search(description: string, unit: string, topK: number): Promise<LocalProductVectorMatch[]> {
    const cacheKey = JSON.stringify([
      LocalProductVectorEntity.canonicalize(description),
      LocalProductVectorEntity.canonicalize(unit),
      topK,
    ]);
    const cached = this.searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.items;

    const inFlight = this.searchesInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const request = this.executeSearch(description, unit, topK)
      .then((items) => {
        this.searchCache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, items });
        return items;
      })
      .finally(() => this.searchesInFlight.delete(cacheKey));
    this.searchesInFlight.set(cacheKey, request);
    return request;
  }

  public async upsert(input: LocalProductInput): Promise<void> {
    const metadata = LocalProductVectorEntity.metadata(input);
    const values = await this.embeddings.embedDocument(
      LocalProductVectorEntity.embeddingText(metadata.description, metadata.unit),
    );
    await this.vectorIndex.upsert([{
      id: LocalProductVectorEntity.vectorId(metadata.productId),
      values,
      metadata,
    }]);
    this.searchCache.clear();
  }

  public async upsertMany(inputs: LocalProductInput[]): Promise<void> {
    if (inputs.length === 0) return;
    const records = inputs.map((input) => {
      const metadata = LocalProductVectorEntity.metadata(input);
      return {
        id: LocalProductVectorEntity.vectorId(metadata.productId),
        text: LocalProductVectorEntity.embeddingText(metadata.description, metadata.unit),
        metadata,
      };
    });
    const values = await this.embeddings.embedDocuments(records.map((record) => record.text));
    await this.vectorIndex.upsert(records.map((record, index) => ({
      id: record.id,
      values: values[index],
      metadata: record.metadata,
    })));
    this.searchCache.clear();
  }

  public async delete(productId: string): Promise<void> {
    await this.vectorIndex.delete([LocalProductVectorEntity.vectorId(productId)]);
    this.searchCache.clear();
  }

  private async executeSearch(
    description: string,
    unit: string,
    topK: number,
  ): Promise<LocalProductVectorMatch[]> {
    const vector = await this.embeddings.embedQuery(
      LocalProductVectorEntity.embeddingText(description, unit),
    );
    const matches = await this.vectorIndex.query(vector, topK, { source: "LOCAL_TEMP" });

    return matches.flatMap((match) => {
      const metadata = match.metadata ?? {};
      const productId = this.readString(metadata, "productId");
      const candidateDescription = this.readString(metadata, "description");
      const candidateUnit = this.readString(metadata, "unit");
      if (!productId || !candidateDescription || !candidateUnit) return [];

      const branchId = this.readString(metadata, "branchId");
      const localMetadata: LocalProductVectorMetadata = {
        source: "LOCAL_TEMP",
        productId,
        description: candidateDescription,
        unit: candidateUnit,
        ...(branchId ? { branchId } : {}),
      };
      return [{
        productId,
        score: typeof match.score === "number" ? match.score : 0,
        metadata: localMetadata,
      }];
    });
  }

  private readString(metadata: VectorMetadata, key: string): string | null {
    const value = metadata[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}

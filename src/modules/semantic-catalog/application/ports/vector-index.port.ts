import { VectorMatch, VectorMetadata } from "../../domain/semantic-catalog.types";

export interface VectorRecord {
  id: string;
  values: number[];
  metadata: VectorMetadata;
}

export abstract class VectorIndexPort {
  public abstract query(
    vector: number[],
    topK: number,
    filter?: Record<string, string>,
  ): Promise<VectorMatch[]>;

  public abstract upsert(records: VectorRecord[]): Promise<void>;
  public abstract delete(ids: string[]): Promise<void>;
}

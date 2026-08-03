import { Index, Pinecone, RecordMetadata } from "@pinecone-database/pinecone";
import { ManageableVectorIndexPort, VectorRecord } from "../application/ports/vector-index.port";
import { VectorMatch, VectorMetadata } from "../domain/semantic-catalog.types";

export class PineconeVectorIndexAdapter implements ManageableVectorIndexPort {
  private readonly index: Index<RecordMetadata>;

  constructor(apiKey: string, indexName: string, namespace: string) {
    const client = new Pinecone({ apiKey });
    const index = client.Index<RecordMetadata>(indexName);
    this.index = namespace ? index.namespace(namespace) : index;
  }

  public async query(
    vector: number[],
    topK: number,
    filter?: Record<string, string>,
  ): Promise<VectorMatch[]> {
    const result = await this.index.query({
      vector,
      topK,
      includeMetadata: true,
      includeValues: false,
      ...(filter && Object.keys(filter).length > 0 ? { filter } : {}),
    });
    return (result.matches ?? []).map((match) => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata as VectorMatch["metadata"],
    }));
  }

  public async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.index.upsert(records.map((record) => ({
      id: record.id,
      values: record.values,
      metadata: record.metadata as RecordMetadata,
    })));
  }

  public async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.index.deleteMany(ids);
  }

  public async findMetadata(ids: string[]): Promise<Map<string, VectorMetadata>> {
    if (ids.length === 0) return new Map();
    const result = await this.index.fetch(ids);
    return new Map(Object.entries(result.records ?? {}).map(([id, record]) => [
      id,
      (record.metadata ?? {}) as VectorMetadata,
    ]));
  }

  public async listIds(prefix = ""): Promise<string[]> {
    const ids: string[] = [];
    let paginationToken: string | undefined;
    do {
      const result = await this.index.listPaginated({
        prefix,
        limit: 100,
        ...(paginationToken ? { paginationToken } : {}),
      });
      for (const vector of result.vectors ?? []) {
        if (vector.id) ids.push(vector.id);
      }
      paginationToken = result.pagination?.next;
    } while (paginationToken);
    return ids;
  }
}

import { RecordMetadata } from "@pinecone-database/pinecone";

import { ParsedCatalogSearchQuery } from "../../../domain/entities/catalog-search-query.entity";

export interface CatalogRankingScore {
  bonus: number;
  penalty: number;
  reasons: string[];
}

export interface CatalogRankingStrategy {
  readonly name: string;
  supports(query: ParsedCatalogSearchQuery, metadata: RecordMetadata): boolean;
  score(query: ParsedCatalogSearchQuery, metadata: RecordMetadata): CatalogRankingScore;
}

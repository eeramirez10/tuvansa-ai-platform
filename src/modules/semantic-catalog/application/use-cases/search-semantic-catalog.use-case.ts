import { ProductAvailabilityPort } from "../ports/product-availability.port";
import { TextEmbeddingPort } from "../ports/text-embedding.port";
import { VectorIndexPort } from "../ports/vector-index.port";
import { SemanticCatalogRankingService } from "../services/semantic-catalog-ranking.service";
import { TechnicalCatalogQueryParserService } from "../services/technical-catalog-query-parser.service";
import {
  ProductAvailability,
  ProductAvailabilityLookupStatus,
  SemanticCatalogMatch,
} from "../../domain/semantic-catalog.types";
import { ParsedCatalogSearchQuery } from "../../domain/entities/catalog-search-query.entity";

export interface SearchSemanticCatalogInput {
  query: string;
  candidateTopK: number;
  limit: number;
  filters: Record<string, string>;
  includeAvailability?: boolean;
}

export interface SearchSemanticCatalogResult {
  matches: SemanticCatalogMatch[];
  availabilityStatus: ProductAvailabilityLookupStatus;
  availabilityByEan: Map<string, ProductAvailability>;
  availabilityError: string | null;
  parsedQuery?: ParsedCatalogSearchQuery;
}

export class SearchSemanticCatalogUseCase {
  constructor(
    private readonly embeddings: TextEmbeddingPort,
    private readonly vectorIndex: VectorIndexPort,
    private readonly availability?: ProductAvailabilityPort,
  ) {}

  public async execute(input: SearchSemanticCatalogInput): Promise<SearchSemanticCatalogResult> {
    const vector = await this.embeddings.embedQuery(input.query);
    const matches = await this.vectorIndex.query(vector, input.candidateTopK, input.filters);
    const ranked = SemanticCatalogRankingService.rank(matches).slice(0, input.limit);
    const availability = await this.resolveAvailability(ranked, Boolean(input.includeAvailability));

    return { matches: ranked, ...availability };
  }

  public async executeHybrid(input: SearchSemanticCatalogInput): Promise<SearchSemanticCatalogResult> {
    const parsedQuery = TechnicalCatalogQueryParserService.parse(input.query);
    const vector = await this.embeddings.embedQuery(input.query);
    const matches = await this.vectorIndex.query(vector, input.candidateTopK, input.filters);
    const ranked = SemanticCatalogRankingService
      .rankHybrid(matches, parsedQuery)
      .slice(0, input.limit);
    const availability = await this.resolveAvailability(ranked, Boolean(input.includeAvailability));

    return { matches: ranked, parsedQuery, ...availability };
  }

  private async resolveAvailability(
    matches: SemanticCatalogMatch[],
    requested: boolean,
  ): Promise<Pick<SearchSemanticCatalogResult, "availabilityStatus" | "availabilityByEan" | "availabilityError">> {
    if (!requested) {
      return { availabilityStatus: "not_requested", availabilityByEan: new Map(), availabilityError: null };
    }
    if (!this.availability?.isEnabled()) {
      return { availabilityStatus: "disabled", availabilityByEan: new Map(), availabilityError: null };
    }

    try {
      const eans = Array.from(new Set(matches.map((match) => match.ean).filter(Boolean)));
      const products = await this.availability.findByEans(eans);
      return {
        availabilityStatus: "resolved",
        availabilityByEan: new Map(products.map((product) => [product.ean, product])),
        availabilityError: null,
      };
    } catch (error) {
      return {
        availabilityStatus: "unavailable",
        availabilityByEan: new Map(),
        availabilityError: error instanceof Error ? error.message : "ERP availability service failed.",
      };
    }
  }
}

import { RecordMetadata } from "@pinecone-database/pinecone";
import {
  SemanticCatalogMatch,
  VectorMatch,
  VectorMetadata,
} from "../../domain/semantic-catalog.types";
import { ParsedCatalogSearchQuery } from "../../domain/entities/catalog-search-query.entity";
import { CatalogRankingStrategy } from "./catalog-ranking/catalog-ranking.types";
import { FittingCatalogRankingStrategy } from "./catalog-ranking/fitting-catalog-ranking.strategy";
import { FlangeCatalogRankingStrategy } from "./catalog-ranking/flange-catalog-ranking.strategy";
import { GenericCatalogRankingStrategy } from "./catalog-ranking/generic-catalog-ranking.strategy";
import { PipeCatalogRankingStrategy } from "./catalog-ranking/pipe-catalog-ranking.strategy";
import { ValveCatalogRankingStrategy } from "./catalog-ranking/valve-catalog-ranking.strategy";

export class SemanticCatalogRankingService {
  private static readonly strategies: CatalogRankingStrategy[] = [
    new PipeCatalogRankingStrategy(),
    new FittingCatalogRankingStrategy(),
    new ValveCatalogRankingStrategy(),
    new FlangeCatalogRankingStrategy(),
    new GenericCatalogRankingStrategy(),
  ];

  public static rank(matches: VectorMatch[]): SemanticCatalogMatch[] {
    const bestByEan = new Map<string, SemanticCatalogMatch>();

    for (const match of matches) {
      const metadata = match.metadata ?? {};
      const ean = this.readString(metadata, "ean") ?? match.id.trim();
      if (!ean) continue;

      const semanticSimilarity = this.normalizeScore(match.score);
      const candidate: SemanticCatalogMatch = {
        id: match.id,
        ean,
        metadata,
        semanticSimilarity,
        finalSimilarity: semanticSimilarity,
        confidence: this.confidence(semanticSimilarity),
        rankingStrategy: "SEMANTIC_ONLY",
        reasons: ["semantic similarity"],
      };
      const previous = bestByEan.get(ean);
      if (!previous || candidate.semanticSimilarity > previous.semanticSimilarity) {
        bestByEan.set(ean, candidate);
      }
    }

    return Array.from(bestByEan.values())
      .sort((left, right) => right.semanticSimilarity - left.semanticSimilarity);
  }

  public static rankHybrid(
    matches: VectorMatch[],
    query: ParsedCatalogSearchQuery,
  ): SemanticCatalogMatch[] {
    const bestByEan = new Map<string, SemanticCatalogMatch>();

    for (const match of matches) {
      const metadata = match.metadata ?? {};
      const ean = this.readString(metadata, "ean") ?? match.id.trim();
      if (!ean) continue;

      const rankingMetadata = metadata as RecordMetadata;
      const strategy = this.strategies.find((candidate) => candidate.supports(query, rankingMetadata))
        ?? this.strategies[this.strategies.length - 1];
      const semanticSimilarity = this.normalizeScore(match.score);
      const rerank = strategy.score(query, rankingMetadata);
      const ruleBoost = Math.min(0.2, rerank.bonus);
      const finalSimilarity = Math.max(
        0,
        Math.min(
          0.9999,
          semanticSimilarity + ruleBoost * (1 - semanticSimilarity) - rerank.penalty,
        ),
      );
      const candidate: SemanticCatalogMatch = {
        id: match.id,
        ean,
        metadata,
        semanticSimilarity,
        finalSimilarity,
        confidence: this.confidence(finalSimilarity),
        rankingStrategy: strategy.name,
        reasons: rerank.reasons.length > 0 ? rerank.reasons : ["semantic similarity"],
      };
      const previous = bestByEan.get(ean);
      if (!previous || candidate.finalSimilarity > previous.finalSimilarity) {
        bestByEan.set(ean, candidate);
      }
    }

    return Array.from(bestByEan.values())
      .sort((left, right) => right.finalSimilarity - left.finalSimilarity);
  }

  public static readString(metadata: VectorMetadata, key: string): string | null {
    const value = metadata[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private static normalizeScore(score?: number): number {
    if (!Number.isFinite(score)) return 0;
    if (score! >= 0 && score! <= 1) return score!;
    return score! > 1 ? score! / (score! + 1) : 0;
  }

  private static confidence(score: number): "high" | "medium" | "low" {
    if (score >= 0.86) return "high";
    if (score >= 0.75) return "medium";
    return "low";
  }
}

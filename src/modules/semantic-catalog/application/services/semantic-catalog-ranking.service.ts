import {
  SemanticCatalogMatch,
  VectorMatch,
  VectorMetadata,
} from "../../domain/semantic-catalog.types";

export class SemanticCatalogRankingService {
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

import { RecordMetadata } from "@pinecone-database/pinecone";

import { ParsedCatalogSearchQuery } from "../../../domain/entities/catalog-search-query.entity";
import { CatalogRankingUtils } from "./catalog-ranking.utils";
import { CatalogRankingScore, CatalogRankingStrategy } from "./catalog-ranking.types";

export class GenericCatalogRankingStrategy implements CatalogRankingStrategy {
  public readonly name = "GENERIC";

  public supports(): boolean {
    return true;
  }

  public score(query: ParsedCatalogSearchQuery, metadata: RecordMetadata): CatalogRankingScore {
    let bonus = 0;
    let penalty = 0;
    const reasons: string[] = [];
    const product = CatalogRankingUtils.read(metadata, "product");
    const material = CatalogRankingUtils.read(metadata, "material");

    if (query.product && product) {
      if (CatalogRankingUtils.includes(query.product, product)) {
        bonus += 0.07;
        reasons.push("product match");
      } else {
        penalty += 0.12;
        reasons.push("product mismatch");
      }
    }

    if (query.material && material) {
      if (CatalogRankingUtils.includes(query.material, material)) {
        bonus += 0.08;
        reasons.push("material match");
      } else {
        penalty += 0.15;
        reasons.push("material mismatch");
      }
    }

    if (CatalogRankingUtils.descriptionOverlap(query.normalizedQuery, metadata) >= 0.35) {
      bonus += 0.05;
      reasons.push("description token overlap");
    }

    return { bonus, penalty, reasons };
  }
}

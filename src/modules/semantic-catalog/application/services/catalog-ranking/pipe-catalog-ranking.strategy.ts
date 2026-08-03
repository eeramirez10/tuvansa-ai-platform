import { RecordMetadata } from "@pinecone-database/pinecone";

import { ParsedCatalogSearchQuery } from "../../../domain/entities/catalog-search-query.entity";
import { CatalogRankingUtils } from "./catalog-ranking.utils";
import { CatalogRankingScore, CatalogRankingStrategy } from "./catalog-ranking.types";
import { GenericCatalogRankingStrategy } from "./generic-catalog-ranking.strategy";

export class PipeCatalogRankingStrategy implements CatalogRankingStrategy {
  public readonly name = "PIPE";

  constructor(private readonly genericStrategy = new GenericCatalogRankingStrategy()) {}

  public supports(query: ParsedCatalogSearchQuery, metadata: RecordMetadata): boolean {
    if (query.product && query.product !== "TUBO") return false;

    return query.family === "PIPE"
      || CatalogRankingUtils.equals(CatalogRankingUtils.read(metadata, "product"), "TUBO")
      || CatalogRankingUtils.equals(CatalogRankingUtils.read(metadata, "category"), "TUBERIA");
  }

  public score(query: ParsedCatalogSearchQuery, metadata: RecordMetadata): CatalogRankingScore {
    const generic = this.genericStrategy.score(query, metadata);
    let bonus = generic.bonus;
    let penalty = generic.penalty;
    const reasons = [...generic.reasons];

    const diameter = CatalogRankingUtils.read(metadata, "diameter");
    if (query.diameter && diameter) {
      if (CatalogRankingUtils.dimensionsEqual(query.diameter, diameter)) {
        bonus += 0.1;
        reasons.push("diameter match");
      } else {
        penalty += 0.14;
        reasons.push("diameter mismatch");
      }
    }

    const ced = CatalogRankingUtils.read(metadata, "ced");
    if (query.ced && ced) {
      if (CatalogRankingUtils.equals(query.ced, ced)) {
        bonus += 0.05;
        reasons.push("schedule match");
      } else {
        penalty += 0.1;
        reasons.push("schedule mismatch");
      }
    }

    const costura = CatalogRankingUtils.read(metadata, "costura");
    if (query.costura && costura) {
      if (CatalogRankingUtils.equals(query.costura, costura)) {
        bonus += 0.04;
        reasons.push("seam type match");
      } else {
        penalty += 0.08;
        reasons.push("seam type mismatch");
      }
    }

    const termino = CatalogRankingUtils.read(metadata, "termino");
    if (query.termino && termino) {
      if (CatalogRankingUtils.includes(query.termino, termino)) {
        bonus += 0.04;
        reasons.push("end type match");
      } else {
        penalty += 0.08;
        reasons.push("end type mismatch");
      }
    } else {
      penalty += this.unrequestedEndPenalty(query.normalizedQuery, termino);
    }

    const acabado = CatalogRankingUtils.read(metadata, "acabado");
    if (query.acabado && acabado) {
      if (CatalogRankingUtils.includes(query.acabado, acabado)) {
        bonus += 0.04;
        reasons.push("finish match");
      } else {
        penalty += 0.06;
        reasons.push("finish mismatch");
      }
    } else if (acabado && !CatalogRankingUtils.includes(acabado, "NEGRO")) {
      penalty += 0.04;
    }

    const unit = CatalogRankingUtils.read(metadata, "unit");
    if (query.unit && unit) {
      if (CatalogRankingUtils.equals(query.unit, unit)) {
        bonus += 0.03;
        reasons.push("commercial unit match");
      } else {
        penalty += 0.08;
        reasons.push("commercial unit mismatch");
      }
    }

    return { bonus, penalty, reasons };
  }

  private unrequestedEndPenalty(query: string, termino?: string): number {
    const normalizedTermino = CatalogRankingUtils.normalize(termino ?? "");
    if (normalizedTermino.includes("RANURADO") && !query.includes("RANUR")) return 0.1;
    if (normalizedTermino.includes("ROSCADO") && !query.includes("ROSC")) return 0.06;
    if (normalizedTermino.includes("BISELADO") && !query.includes("BISEL")) return 0.04;
    return 0;
  }
}

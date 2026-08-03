import { RecordMetadata } from "@pinecone-database/pinecone";

import { ParsedCatalogSearchQuery } from "../../../domain/entities/catalog-search-query.entity";
import { CatalogRankingUtils } from "./catalog-ranking.utils";
import { CatalogRankingScore, CatalogRankingStrategy } from "./catalog-ranking.types";
import { GenericCatalogRankingStrategy } from "./generic-catalog-ranking.strategy";

export class FittingCatalogRankingStrategy implements CatalogRankingStrategy {
  public readonly name = "FITTING";

  private static readonly PRODUCTS = new Set([
    "CODO",
    "TEE",
    "YEE",
    "REDUCCION",
    "NIPLE",
    "COPLE",
    "UNION",
    "ADAPTADOR",
    "CRUZ",
    "TAPON",
    "PORTABRIDA",
  ]);

  constructor(private readonly genericStrategy = new GenericCatalogRankingStrategy()) {}

  public supports(query: ParsedCatalogSearchQuery, metadata: RecordMetadata): boolean {
    if (query.product && !FittingCatalogRankingStrategy.PRODUCTS.has(query.product)) return false;

    const product = CatalogRankingUtils.read(metadata, "product");
    return query.family === "FITTING"
      || FittingCatalogRankingStrategy.PRODUCTS.has(product ?? "")
      || CatalogRankingUtils.equals(CatalogRankingUtils.read(metadata, "category"), "CONEXIONES");
  }

  public score(query: ParsedCatalogSearchQuery, metadata: RecordMetadata): CatalogRankingScore {
    const generic = this.genericStrategy.score(query, metadata);
    let bonus = generic.bonus;
    let penalty = generic.penalty;
    const reasons = [...generic.reasons];
    const candidateText = this.candidateText(metadata);

    const diameter = CatalogRankingUtils.read(metadata, "diameter")
      ?? this.extractDiameter(candidateText);
    ({ bonus, penalty } = this.compareDimension(
      query.diameter,
      diameter,
      bonus,
      penalty,
      reasons,
    ));

    const termino = this.normalizeTermino(
      CatalogRankingUtils.read(metadata, "termino") ?? candidateText,
    );
    if (query.termino && termino) {
      if (this.terminosMatch(query.termino, termino)) {
        bonus += 0.08;
        reasons.push("connection type match");
      } else {
        penalty += 0.12;
        reasons.push("connection type mismatch");
      }
    } else if (query.termino) {
      penalty += 0.04;
      reasons.push("connection type unavailable");
    }

    const angle = CatalogRankingUtils.read(metadata, "angulo") ?? this.extractAngle(candidateText);
    if (query.angulo && angle) {
      if (CatalogRankingUtils.equals(query.angulo, angle)) {
        bonus += 0.07;
        reasons.push("angle match");
      } else {
        penalty += 0.1;
        reasons.push("angle mismatch");
      }
    } else if (query.angulo) {
      penalty += 0.03;
      reasons.push("angle unavailable");
    }

    const figura = CatalogRankingUtils.read(metadata, "figura") ?? this.extractFigura(candidateText);
    if (query.figura && figura) {
      if (CatalogRankingUtils.includes(query.figura, figura)) {
        bonus += 0.06;
        reasons.push("shape match");
      } else {
        penalty += 0.08;
        reasons.push("shape mismatch");
      }
    }

    const radio = CatalogRankingUtils.read(metadata, "radio") ?? this.extractRadio(candidateText);
    if (query.radio && radio) {
      if (CatalogRankingUtils.includes(query.radio, radio)) {
        bonus += 0.05;
        reasons.push("radius match");
      } else {
        penalty += 0.06;
        reasons.push("radius mismatch");
      }
    }

    const pressure = CatalogRankingUtils.read(metadata, "presion");
    if (query.presion && pressure) {
      if (CatalogRankingUtils.includes(query.presion, pressure)) {
        bonus += 0.05;
        reasons.push("pressure match");
      } else {
        penalty += 0.08;
        reasons.push("pressure mismatch");
      }
    }

    const unit = this.normalizeUnit(CatalogRankingUtils.read(metadata, "unit"));
    if (query.unit && unit) {
      if (CatalogRankingUtils.equals(query.unit, unit)) {
        bonus += 0.02;
        reasons.push("commercial unit match");
      } else {
        penalty += 0.04;
        reasons.push("commercial unit mismatch");
      }
    }

    const gender = this.extractConnectionGender(candidateText);
    if (query.connectionGender && gender) {
      if (CatalogRankingUtils.equals(query.connectionGender, gender)) {
        bonus += 0.05;
        reasons.push("connection gender match");
      } else {
        penalty += 0.08;
        reasons.push("connection gender mismatch");
      }
    } else if (query.connectionGender) {
      penalty += 0.03;
      reasons.push("connection gender unavailable");
    }

    if (query.material && !CatalogRankingUtils.read(metadata, "material")) {
      const material = this.extractMaterial(candidateText);
      if (material) {
        if (CatalogRankingUtils.includes(query.material, material)) {
          bonus += 0.08;
          reasons.push("material match from description");
        } else {
          penalty += 0.15;
          reasons.push("material mismatch from description");
        }
      }
    }

    return { bonus, penalty, reasons };
  }

  private compareDimension(
    expected: string | undefined,
    actual: string | undefined,
    bonus: number,
    penalty: number,
    reasons: string[],
  ): { bonus: number; penalty: number } {
    if (!expected) return { bonus, penalty };
    if (!actual) {
      reasons.push("diameter unavailable");
      return { bonus, penalty: penalty + 0.05 };
    }

    if (CatalogRankingUtils.dimensionsEqual(expected, actual)) {
      reasons.push("diameter match");
      return { bonus: bonus + 0.1, penalty };
    }

    reasons.push("diameter mismatch");
    return { bonus, penalty: penalty + 0.14 };
  }

  private terminosMatch(expected: string, actual: string): boolean {
    const normalizedExpected = this.normalizeTermino(expected);
    if (!normalizedExpected) return false;
    if (normalizedExpected === actual) return true;

    return normalizedExpected === "SOLDABLE" && actual === "SOLDABLE A TOPE";
  }

  private normalizeTermino(value: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value);
    if (/\b(?:BUTT WELD|BW|SOLDABLE A TOPE)\b/.test(normalized)) return "SOLDABLE A TOPE";
    if (/\b(?:SOCKET WELD|SW|SOLDABLE|SOLDAR)\b/.test(normalized)) return "SOLDABLE";
    if (/\b(?:ROSCADO|ROSCA|CUERDA)\b/.test(normalized)) return "ROSCADO";
    if (/\bRANURAD[OA]\b/.test(normalized)) return "RANURADO";
    if (/\bCEMENTAR\b/.test(normalized)) return "CEMENTAR";
    if (/\bCAMPANA\b/.test(normalized)) return "CAMPANA";
    return undefined;
  }

  private candidateText(metadata: RecordMetadata): string {
    return [
      CatalogRankingUtils.read(metadata, "termino"),
      CatalogRankingUtils.read(metadata, "material"),
      CatalogRankingUtils.read(metadata, "normalizedDescription"),
      CatalogRankingUtils.read(metadata, "originalDescription"),
    ].filter((value): value is string => Boolean(value)).join(" ");
  }

  private extractDiameter(value: string): string | undefined {
    return value.match(/(?:^|[^0-9])(\d+(?:\s+\d+)?\s*\/\s*\d+|\d+(?:\.\d+)?)\s*["¨]/)?.[1]
      ?.replace(/\s*\/\s*/g, "/");
  }

  private extractAngle(value: string): string | undefined {
    return value.match(/\b(\d{2,3})\s*(?:GRADOS?\b|°|O\b)/)?.[1];
  }

  private extractFigura(value: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value);
    if (/\bCONCENTRIC[OA]\b/.test(normalized)) return "CONCENTRICA";
    if (/\bEXCENTRIC[OA]\b/.test(normalized)) return "EXCENTRICA";
    if (/\bRECT[OA]\b/.test(normalized)) return "RECTA";
    return undefined;
  }

  private extractRadio(value: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value);
    if (/\b(?:RADIO LARGO|LONG RADIUS|LR)\b/.test(normalized)) return "RADIO LARGO";
    if (/\b(?:RADIO CORTO|SHORT RADIUS|SR)\b/.test(normalized)) return "RADIO CORTO";
    return undefined;
  }

  private extractConnectionGender(value: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value);
    if (/\b(?:CUERDA|ROSCA) INTERIOR\b|\bHEMBRA\b|\bHH\b/.test(normalized)) return "INTERIOR";
    if (/\b(?:CUERDA|ROSCA) EXTERIOR\b|\bMACHO\b|\bMM\b/.test(normalized)) return "EXTERIOR";
    return undefined;
  }

  private extractMaterial(value: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value);
    if (/\bCOBRE\b/.test(normalized)) return "COBRE";
    if (/\bBRONCE\b/.test(normalized)) return "BRONCE";
    if (/\bLATON\b/.test(normalized)) return "LATON";
    if (/\b(?:ACERO AL CARBON|A\s*\/\s*C)\b/.test(normalized)) return "ACERO AL CARBON";
    if (/\b(?:ACERO INOXIDABLE|ACERO INOX|INOXIDABLE)\b/.test(normalized)) return "ACERO INOXIDABLE";
    if (/\bCPVC\b/.test(normalized)) return "CPVC";
    if (/\bPVC\b/.test(normalized)) return "PVC";
    if (/\bPPR(?:C)?\b/.test(normalized)) return "PPR";
    if (/\b(?:HDPE|PEAD)\b/.test(normalized)) return "HDPE";
    return undefined;
  }

  private normalizeUnit(value?: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value ?? "");
    if (/^PIEZAS?$/.test(normalized)) return "PIEZA";
    if (/^METROS?$/.test(normalized)) return "METRO";
    if (/^TRAMOS?$/.test(normalized)) return "TRAMO";
    return normalized || undefined;
  }
}

import { RecordMetadata } from "@pinecone-database/pinecone";

import { ParsedCatalogSearchQuery } from "../../../domain/entities/catalog-search-query.entity";
import { CatalogRankingUtils } from "./catalog-ranking.utils";
import { CatalogRankingScore, CatalogRankingStrategy } from "./catalog-ranking.types";
import { GenericCatalogRankingStrategy } from "./generic-catalog-ranking.strategy";

export class ValveCatalogRankingStrategy implements CatalogRankingStrategy {
  public readonly name = "VALVE";

  constructor(private readonly genericStrategy = new GenericCatalogRankingStrategy()) {}

  public supports(query: ParsedCatalogSearchQuery, metadata: RecordMetadata): boolean {
    if (query.product && query.product !== "VALVULA") return false;

    return query.family === "VALVE"
      || CatalogRankingUtils.equals(CatalogRankingUtils.read(metadata, "product"), "VALVULA")
      || CatalogRankingUtils.equals(CatalogRankingUtils.read(metadata, "category"), "VALVULAS");
  }

  public score(query: ParsedCatalogSearchQuery, metadata: RecordMetadata): CatalogRankingScore {
    const generic = this.genericStrategy.score(query, metadata);
    let bonus = generic.bonus;
    let penalty = generic.penalty;
    const reasons = [...generic.reasons];
    const candidateText = this.candidateText(metadata);

    const subtype = this.normalizeSubtype(
      CatalogRankingUtils.read(metadata, "subtipo") ?? candidateText,
    );
    if (query.subtipo && subtype) {
      if (CatalogRankingUtils.equals(query.subtipo, subtype)) {
        bonus += 0.1;
        reasons.push("valve type match");
      } else {
        penalty += 0.14;
        reasons.push("valve type mismatch");
      }
    } else if (query.subtipo) {
      penalty += 0.05;
      reasons.push("valve type unavailable");
    }

    const diameter = CatalogRankingUtils.read(metadata, "diameter")
      ?? this.extractDiameter(candidateText);
    if (query.diameter && diameter) {
      if (CatalogRankingUtils.dimensionsEqual(query.diameter, diameter)) {
        bonus += 0.1;
        reasons.push("diameter match");
      } else {
        penalty += 0.14;
        reasons.push("diameter mismatch");
      }
    } else if (query.diameter) {
      penalty += 0.05;
      reasons.push("diameter unavailable");
    }

    const termino = this.normalizeTermino(
      CatalogRankingUtils.read(metadata, "termino") ?? candidateText,
    );
    if (query.termino && termino) {
      if (this.terminosMatch(query.termino, termino)) {
        bonus += 0.08;
        reasons.push("connection type match");
      } else {
        penalty += 0.1;
        reasons.push("connection type mismatch");
      }
    } else if (query.termino) {
      penalty += 0.04;
      reasons.push("connection type unavailable");
    }

    const expectedPressure = this.normalizePressure(query.presion);
    const actualPressure = this.normalizePressure(
      CatalogRankingUtils.read(metadata, "presion") ?? candidateText,
    );
    if (expectedPressure && actualPressure) {
      if (expectedPressure === actualPressure) {
        bonus += 0.07;
        reasons.push("pressure class match");
      } else {
        penalty += 0.12;
        reasons.push("pressure class mismatch");
      }
    } else if (expectedPressure) {
      penalty += 0.05;
      reasons.push("pressure class unavailable");
    }

    const actuation = this.extractActuation(candidateText);
    if (query.actuation && actuation) {
      if (CatalogRankingUtils.equals(query.actuation, actuation)) {
        bonus += 0.05;
        reasons.push("actuation match");
      } else {
        penalty += 0.07;
        reasons.push("actuation mismatch");
      }
    } else if (query.actuation) {
      penalty += 0.03;
      reasons.push("actuation unavailable");
    }

    const figure = CatalogRankingUtils.read(metadata, "figura") ?? this.extractFigure(candidateText);
    if (query.figura && figure) {
      if (CatalogRankingUtils.equals(query.figura, figure)) {
        bonus += 0.04;
        reasons.push("figure match");
      } else {
        penalty += 0.05;
        reasons.push("figure mismatch");
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

  private normalizeSubtype(value: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value);
    if (/\bCOMPUERTA\b/.test(normalized)) return "COMPUERTA";
    if (/\bGLOBO\b/.test(normalized)) return "GLOBO";
    if (/\bMARIPOSA\b/.test(normalized)) return "MARIPOSA";
    if (/\b(?:CHECK|RETENCION)\b/.test(normalized)) return "CHECK";
    if (/\bBOLA\b/.test(normalized)) return "BOLA";
    if (/\bAGUJA\b/.test(normalized)) return "AGUJA";
    if (/\bDIAFRAGMA\b/.test(normalized)) return "DIAFRAGMA";
    if (/\bMACHO\b/.test(normalized)) return "MACHO";
    if (/\bALIVIO\b/.test(normalized)) return "ALIVIO";
    if (/\bSEGURIDAD\b/.test(normalized)) return "SEGURIDAD";
    return undefined;
  }

  private normalizeTermino(value: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value);
    if (/\bBRIDAD[OA]\b/.test(normalized)) return "BRIDADO";
    if (/\bWAFER\b/.test(normalized)) return "WAFER";
    if (/\bLUG\b/.test(normalized)) return "LUG";
    if (/\b(?:BUTT WELD|BW|SOLDABLE A TOPE)\b/.test(normalized)) return "SOLDABLE A TOPE";
    if (/\b(?:SOCKET WELD|SW|SOLDABLE|SOLDAR)\b/.test(normalized)) return "SOLDABLE";
    if (/\b(?:ROSCADO|ROSCA|CUERDA)\b/.test(normalized)) return "ROSCADO";
    if (/\bRANURAD[OA]\b/.test(normalized)) return "RANURADO";
    return undefined;
  }

  private terminosMatch(expected: string, actual: string): boolean {
    const normalizedExpected = this.normalizeTermino(expected);
    if (!normalizedExpected) return false;
    if (normalizedExpected === actual) return true;
    return normalizedExpected === "SOLDABLE" && actual === "SOLDABLE A TOPE";
  }

  private normalizePressure(value?: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value ?? "");
    const pressureClass = normalized.match(/\b(?:CLASE|CLASS)\s*(\d{2,5})(?:\.\d+)?\b/)?.[1];
    if (pressureClass) return pressureClass;

    const pressure = normalized.match(/\b(\d{2,5})(?:\.\d+)?\s*(?:LBS?|PSI|BAR)\b/)?.[1];
    if (pressure) return pressure;

    return normalized.match(/\b(?:LBS?|PSI|BAR)\s*(\d{2,5})(?:\.\d+)?\b/)?.[1];
  }

  private extractActuation(value: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value);
    if (/\bPALANCA\b/.test(normalized)) return "PALANCA";
    if (/\bVOLANTE\b/.test(normalized)) return "VOLANTE";
    if (/\b(?:ENGRANAJE|GEAR)\b/.test(normalized)) return "ENGRANAJE";
    if (/\bACTUADOR ELECTRIC[OA]\b|\bMOTORIZAD[OA]\b/.test(normalized)) return "ACTUADOR ELECTRICO";
    if (/\bACTUADOR NEUMATIC[OA]\b/.test(normalized)) return "ACTUADOR NEUMATICO";
    if (/\bSOLENOIDE\b/.test(normalized)) return "SOLENOIDE";
    return undefined;
  }

  private candidateText(metadata: RecordMetadata): string {
    return [
      CatalogRankingUtils.read(metadata, "subtipo"),
      CatalogRankingUtils.read(metadata, "termino"),
      CatalogRankingUtils.read(metadata, "material"),
      CatalogRankingUtils.read(metadata, "presion"),
      CatalogRankingUtils.read(metadata, "normalizedDescription"),
      CatalogRankingUtils.read(metadata, "originalDescription"),
    ].filter((value): value is string => Boolean(value)).join(" ");
  }

  private extractDiameter(value: string): string | undefined {
    return value.match(/(?:^|[^0-9])(\d+(?:\s+\d+)?\s*\/\s*\d+|\d+(?:\.\d+)?)\s*["¨]/)?.[1]
      ?.replace(/\s*\/\s*/g, "/");
  }

  private extractFigure(value: string): string | undefined {
    return CatalogRankingUtils.normalize(value)
      .match(/\b(?:FIGURA|FIG\.?|F\.?)\s*[-.]?\s*([0-9][A-Z0-9-]*)\b/)?.[1];
  }

  private extractMaterial(value: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value);
    if (/\b(?:ACERO AL CARBON|A\s*\/\s*C)\b/.test(normalized)) return "ACERO AL CARBON";
    if (/\b(?:ACERO INOXIDABLE|ACERO INOX|INOXIDABLE)\b/.test(normalized)) return "ACERO INOXIDABLE";
    if (/\bHIERRO\b/.test(normalized)) return "HIERRO";
    if (/\bBRONCE\b/.test(normalized)) return "BRONCE";
    if (/\bLATON\b/.test(normalized)) return "LATON";
    if (/\bPVC\b/.test(normalized)) return "PVC";
    return undefined;
  }

  private normalizeUnit(value?: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value ?? "");
    if (/^PIEZAS?$/.test(normalized)) return "PIEZA";
    if (/^METROS?$/.test(normalized)) return "METRO";
    return normalized || undefined;
  }
}

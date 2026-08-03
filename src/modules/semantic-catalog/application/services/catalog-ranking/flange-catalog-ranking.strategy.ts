import { RecordMetadata } from "@pinecone-database/pinecone";

import { ParsedCatalogSearchQuery } from "../../../domain/entities/catalog-search-query.entity";
import { CatalogRankingUtils } from "./catalog-ranking.utils";
import { CatalogRankingScore, CatalogRankingStrategy } from "./catalog-ranking.types";
import { GenericCatalogRankingStrategy } from "./generic-catalog-ranking.strategy";

export class FlangeCatalogRankingStrategy implements CatalogRankingStrategy {
  public readonly name = "FLANGE";

  constructor(private readonly genericStrategy = new GenericCatalogRankingStrategy()) {}

  public supports(query: ParsedCatalogSearchQuery, metadata: RecordMetadata): boolean {
    if (query.product && query.product !== "BRIDA") return false;

    return query.family === "FLANGE"
      || CatalogRankingUtils.equals(CatalogRankingUtils.read(metadata, "product"), "BRIDA");
  }

  public score(query: ParsedCatalogSearchQuery, metadata: RecordMetadata): CatalogRankingScore {
    const generic = this.genericStrategy.score(query, metadata);
    let bonus = generic.bonus;
    let penalty = generic.penalty;
    const reasons = [...generic.reasons];
    const candidateText = this.candidateText(metadata);

    const requestedReducing = /\bREDUCID[OA]\b/.test(query.normalizedQuery);
    const candidateReducing = /\bREDUCID[OA]\b/.test(CatalogRankingUtils.normalize(candidateText));
    if (requestedReducing && candidateReducing) {
      bonus += 0.04;
      reasons.push("reducing flange match");
    } else if (requestedReducing && !candidateReducing) {
      penalty += 0.08;
      reasons.push("reducing flange mismatch");
    } else if (!requestedReducing && candidateReducing) {
      penalty += 0.08;
      reasons.push("unrequested reducing flange");
    }

    const type = this.normalizeType(CatalogRankingUtils.read(metadata, "tipo") ?? candidateText);
    if (query.tipo && type) {
      if (CatalogRankingUtils.equals(query.tipo, type)) {
        bonus += 0.1;
        reasons.push("flange type match");
      } else {
        penalty += 0.14;
        reasons.push("flange type mismatch");
      }
    } else if (query.tipo) {
      penalty += 0.05;
      reasons.push("flange type unavailable");
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

    const expectedPressure = this.normalizePressure(query.presion);
    const actualPressure = this.normalizePressure(
      CatalogRankingUtils.read(metadata, "presion") ?? candidateText,
    );
    if (expectedPressure && actualPressure) {
      if (expectedPressure === actualPressure) {
        bonus += 0.08;
        reasons.push("pressure class match");
      } else {
        penalty += 0.12;
        reasons.push("pressure class mismatch");
      }
    } else if (expectedPressure) {
      penalty += 0.05;
      reasons.push("pressure class unavailable");
    }

    const face = this.extractFace(candidateText);
    if (query.face && face) {
      if (CatalogRankingUtils.equals(query.face, face)) {
        bonus += 0.08;
        reasons.push("flange face match");
      } else {
        penalty += 0.1;
        reasons.push("flange face mismatch");
      }
    } else if (query.face) {
      penalty += 0.04;
      reasons.push("flange face unavailable");
    }

    const expectedGrade = this.normalizeGrade(query.grado ?? query.norma);
    const actualGrade = this.normalizeGrade(
      CatalogRankingUtils.read(metadata, "grado") ?? candidateText,
    );
    if (expectedGrade && actualGrade) {
      if (expectedGrade === actualGrade) {
        bonus += 0.06;
        reasons.push("material grade match");
      } else {
        penalty += 0.08;
        reasons.push("material grade mismatch");
      }
    }

    const ced = CatalogRankingUtils.read(metadata, "ced");
    if (query.ced && ced) {
      if (CatalogRankingUtils.equals(query.ced, ced)) {
        bonus += 0.05;
        reasons.push("schedule match");
      } else {
        penalty += 0.08;
        reasons.push("schedule mismatch");
      }
    }

    const termino = this.normalizeTermino(
      CatalogRankingUtils.read(metadata, "termino") ?? candidateText,
    );
    if (query.termino && termino) {
      if (this.terminosMatch(query.termino, termino)) {
        bonus += 0.04;
        reasons.push("connection type match");
      } else {
        penalty += 0.06;
        reasons.push("connection type mismatch");
      }
    }

    const acabado = CatalogRankingUtils.read(metadata, "acabado");
    if (query.acabado && acabado) {
      if (CatalogRankingUtils.includes(query.acabado, acabado)) {
        bonus += 0.03;
        reasons.push("finish match");
      } else {
        penalty += 0.04;
        reasons.push("finish mismatch");
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

    return { bonus, penalty, reasons };
  }

  private normalizeType(value: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value);
    if (/\b(?:CIEGA|BLIND)\b/.test(normalized)) return "CIEGA";
    if (/\b(?:LAP JOINT|LJ)\b/.test(normalized)) return "LAP JOINT";
    if (/\b(?:SOCKET WELD|SW)\b/.test(normalized)) return "SOCKET WELD";
    if (/\b(?:ROSCADA|THREADED)\b/.test(normalized)) return "ROSCADA";
    if (/\b(?:SLIP ON|SO|SIN CUELLO)\b/.test(normalized)) return "SIN CUELLO";
    if (/\b(?:WELD NECK|WN|CON CUELLO)\b/.test(normalized)) return "CON CUELLO";
    if (/\b(?:ORIFICIO|ORIFICE)\b/.test(normalized)) return "ORIFICIO";
    return undefined;
  }

  private extractFace(value: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value);
    if (/\bRTJ\b|R\s*\.\s*T\s*\.\s*J|RING TYPE JOINT/.test(normalized)) return "RTJ";
    if (/\bRF\b|CARA REALZADA|\bC\s*\.?\s*R\.?\b/.test(normalized)) return "RF";
    if (/\bFF\b|CARA PLANA|\bC\s*\.?\s*P\.?\b/.test(normalized)) return "FF";
    return undefined;
  }

  private normalizePressure(value?: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value ?? "");
    if (/^\d{2,5}$/.test(normalized)) return normalized;

    const pressureClass = normalized.match(/\b(?:CLASE|CLASS)\s*(\d{2,5})(?:\.\d+)?\b/)?.[1];
    if (pressureClass) return pressureClass;
    const pressure = normalized.match(/\b(\d{2,5})(?:\.\d+)?\s*(?:LBS?|PSI)\b/)?.[1];
    if (pressure) return pressure;
    return normalized.match(/\b(?:LBS?|PSI)\s*(\d{2,5})(?:\.\d+)?\b/)?.[1];
  }

  private normalizeGrade(value?: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value ?? "");
    if (/^\d{3}(?:L|\s+LF\d)?$/.test(normalized)) return normalized;

    const astmGrade = normalized.match(/\bA\s*[- ]?\s*(\d{3})(?:\s*[- ]?\s*(LF\d))?\b/);
    if (astmGrade) return `${astmGrade[1]}${astmGrade[2] ? ` ${astmGrade[2]}` : ""}`;
    return normalized.match(/\b[FT]\s*[- ]?\s*(\d{3}L?)\b/)?.[1];
  }

  private normalizeTermino(value: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value);
    if (/\b(?:WELD NECK|WN|CON CUELLO|BUTT WELD|BW)\b/.test(normalized)) return "SOLDABLE A TOPE";
    if (/\b(?:SLIP ON|SO|SOCKET WELD|SW|SOLDABLE)\b/.test(normalized)) return "SOLDABLE";
    if (/\b(?:ROSCADA|THREADED|ROSCA)\b/.test(normalized)) return "ROSCADO";
    return undefined;
  }

  private terminosMatch(expected: string, actual: string): boolean {
    const normalizedExpected = this.normalizeTermino(expected);
    if (!normalizedExpected) return false;
    if (normalizedExpected === actual) return true;
    return normalizedExpected === "SOLDABLE" && actual === "SOLDABLE A TOPE";
  }

  private candidateText(metadata: RecordMetadata): string {
    return [
      CatalogRankingUtils.read(metadata, "tipo"),
      CatalogRankingUtils.read(metadata, "termino"),
      CatalogRankingUtils.read(metadata, "grado"),
      CatalogRankingUtils.read(metadata, "presion"),
      CatalogRankingUtils.read(metadata, "normalizedDescription"),
      CatalogRankingUtils.read(metadata, "originalDescription"),
    ].filter((value): value is string => Boolean(value)).join(" ");
  }

  private extractDiameter(value: string): string | undefined {
    return value.match(/(?:^|[^0-9])(\d+(?:\s+\d+)?\s*\/\s*\d+|\d+(?:\.\d+)?)\s*["¨]/)?.[1]
      ?.replace(/\s*\/\s*/g, "/");
  }

  private normalizeUnit(value?: string): string | undefined {
    const normalized = CatalogRankingUtils.normalize(value ?? "");
    if (/^PIEZAS?$/.test(normalized)) return "PIEZA";
    return normalized || undefined;
  }
}

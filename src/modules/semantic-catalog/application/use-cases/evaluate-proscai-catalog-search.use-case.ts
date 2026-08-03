import { RecordMetadata } from "@pinecone-database/pinecone";

import { CATALOG_SEARCH_EVALUATION_CASES } from "../services/catalog-search-evaluation-cases";
import { SearchSemanticCatalogUseCase } from "./search-semantic-catalog.use-case";
import {
  CatalogSearchEvaluationAttributeCheck,
  CatalogSearchEvaluationCase,
  CatalogSearchEvaluationProgress,
  CatalogSearchEvaluationResult,
  CatalogSearchEvaluationSummary,
} from "../../domain/entities/catalog-search-evaluation.entity";

export interface EvaluateProscaiCatalogSearchInput {
  caseIds?: string[];
  onProgress?: (progress: CatalogSearchEvaluationProgress) => void | Promise<void>;
}

export class EvaluateProscaiCatalogSearchUseCase {
  constructor(private readonly searchCatalogUseCase: SearchSemanticCatalogUseCase) {}

  public listCases(): CatalogSearchEvaluationCase[] {
    return CATALOG_SEARCH_EVALUATION_CASES.map((evaluationCase) => ({ ...evaluationCase }));
  }

  public selectCases(caseIds?: string[]): CatalogSearchEvaluationCase[] {
    if (!caseIds || caseIds.length === 0) return this.listCases();

    const normalizedIds = Array.from(new Set(caseIds.map((id) => id.trim()).filter(Boolean)));
    const selected = CATALOG_SEARCH_EVALUATION_CASES.filter((evaluationCase) => (
      normalizedIds.includes(evaluationCase.id)
    ));
    const selectedIds = new Set(selected.map((evaluationCase) => evaluationCase.id));
    const unknownIds = normalizedIds.filter((id) => !selectedIds.has(id));

    if (unknownIds.length > 0) {
      throw new Error(`Casos de evaluacion no validos: ${unknownIds.join(", ")}.`);
    }

    return selected.map((evaluationCase) => ({ ...evaluationCase }));
  }

  public async execute(input: EvaluateProscaiCatalogSearchInput): Promise<CatalogSearchEvaluationProgress> {
    const cases = this.selectCases(input.caseIds);
    const results: CatalogSearchEvaluationResult[] = [];

    for (const evaluationCase of cases) {
      const startedAt = Date.now();

      try {
        const searchResult = await this.searchCatalogUseCase.executeHybrid({
          query: evaluationCase.query,
          limit: evaluationCase.topK,
          candidateTopK: evaluationCase.candidateTopK,
          filters: {},
        });
        const topMatch = searchResult.matches[0];
        const returnedEans = searchResult.matches.map((match) => match.ean);
        const parserChecks = this.checkAttributes(
          searchResult.parsedQuery as unknown as Record<string, unknown>,
          evaluationCase.expectedParsedAttributes,
        );
        const metadataChecks = this.checkAttributes(
          topMatch?.metadata ?? {},
          evaluationCase.expectedTopMetadata,
        );
        const missingReasons = evaluationCase.expectedTopReasons.filter((reason) => (
          !topMatch?.reasons.includes(reason)
        ));
        const top1Hit = Boolean(topMatch && evaluationCase.expectedEans.includes(topMatch.ean));
        const top5Hit = returnedEans.slice(0, 5).some((ean) => evaluationCase.expectedEans.includes(ean));
        const strategyHit = topMatch?.rankingStrategy === evaluationCase.expectedStrategy;
        const parserHit = parserChecks.every((check) => check.passed);
        const reasonsHit = missingReasons.length === 0;
        const metadataHit = metadataChecks.every((check) => check.passed);

        results.push({
          caseId: evaluationCase.id,
          name: evaluationCase.name,
          family: evaluationCase.family,
          query: evaluationCase.query,
          expectedEans: evaluationCase.expectedEans,
          top1Ean: topMatch?.ean,
          returnedEans,
          top1Hit,
          top5Hit,
          strategyHit,
          parserHit,
          reasonsHit,
          metadataHit,
          passed: top1Hit && strategyHit && parserHit && reasonsHit && metadataHit,
          rankingStrategy: topMatch?.rankingStrategy,
          similarityPercent: topMatch ? this.toPercent(topMatch.finalSimilarity) : undefined,
          durationMs: Date.now() - startedAt,
          parserChecks,
          metadataChecks,
          missingReasons,
        });
      } catch (error) {
        results.push({
          caseId: evaluationCase.id,
          name: evaluationCase.name,
          family: evaluationCase.family,
          query: evaluationCase.query,
          expectedEans: evaluationCase.expectedEans,
          returnedEans: [],
          top1Hit: false,
          top5Hit: false,
          strategyHit: false,
          parserHit: false,
          reasonsHit: false,
          metadataHit: false,
          passed: false,
          durationMs: Date.now() - startedAt,
          parserChecks: [],
          metadataChecks: [],
          missingReasons: evaluationCase.expectedTopReasons,
          error: error instanceof Error ? error.message : "Error desconocido al evaluar la busqueda.",
        });
      }

      await input.onProgress?.(this.buildProgress(cases.length, evaluationCase.id, results));
    }

    return this.buildProgress(cases.length, undefined, results);
  }

  public emptySummary(total: number): CatalogSearchEvaluationSummary {
    return this.buildSummary(total, []);
  }

  private checkAttributes(
    source: Record<string, unknown> | RecordMetadata,
    expected: Record<string, string>,
  ): CatalogSearchEvaluationAttributeCheck[] {
    return Object.entries(expected).map(([field, expectedValue]) => {
      const actual = this.readValue(source[field]);
      return {
        field,
        expected: expectedValue,
        actual,
        passed: this.normalize(actual) === this.normalize(expectedValue),
      };
    });
  }

  private buildProgress(
    totalCases: number,
    currentCaseId: string | undefined,
    results: CatalogSearchEvaluationResult[],
  ): CatalogSearchEvaluationProgress {
    return {
      totalCases,
      completedCases: results.length,
      currentCaseId,
      summary: this.buildSummary(totalCases, results),
      results: results.map((result) => ({ ...result })),
    };
  }

  private buildSummary(
    total: number,
    results: CatalogSearchEvaluationResult[],
  ): CatalogSearchEvaluationSummary {
    const completed = results.length;
    const passed = results.filter((result) => result.passed).length;
    const latencies = results.map((result) => result.durationMs).sort((first, second) => first - second);

    return {
      total,
      completed,
      passed,
      failed: completed - passed,
      errors: results.filter((result) => Boolean(result.error)).length,
      top1Hits: results.filter((result) => result.top1Hit).length,
      top5Hits: results.filter((result) => result.top5Hit).length,
      strategyHits: results.filter((result) => result.strategyHit).length,
      parserHits: results.filter((result) => result.parserHit).length,
      top1AccuracyPercent: this.accuracy(results.filter((result) => result.top1Hit).length, completed),
      top5AccuracyPercent: this.accuracy(results.filter((result) => result.top5Hit).length, completed),
      strategyAccuracyPercent: this.accuracy(results.filter((result) => result.strategyHit).length, completed),
      parserAccuracyPercent: this.accuracy(results.filter((result) => result.parserHit).length, completed),
      averageLatencyMs: completed > 0
        ? Math.round(latencies.reduce((totalLatency, latency) => totalLatency + latency, 0) / completed)
        : 0,
      p95LatencyMs: latencies.length > 0
        ? latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)]
        : 0,
      maxLatencyMs: latencies.at(-1) ?? 0,
    };
  }

  private accuracy(hits: number, total: number): number {
    return total > 0 ? Math.round((hits / total) * 10_000) / 100 : 0;
  }

  private toPercent(value: number): number {
    return Math.round(value * 10_000) / 100;
  }

  private readValue(value: unknown): string | undefined {
    if (typeof value === "string") return value.trim() || undefined;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return undefined;
  }

  private normalize(value?: string): string {
    return (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .toUpperCase()
      .trim();
  }
}

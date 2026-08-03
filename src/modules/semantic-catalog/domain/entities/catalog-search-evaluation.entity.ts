export interface CatalogSearchEvaluationCase {
  id: string;
  name: string;
  family: string;
  query: string;
  expectedEans: string[];
  expectedStrategy: string;
  expectedParsedAttributes: Record<string, string>;
  expectedTopReasons: string[];
  expectedTopMetadata: Record<string, string>;
  topK: number;
  candidateTopK: number;
}

export interface CatalogSearchEvaluationAttributeCheck {
  field: string;
  expected: string;
  actual?: string;
  passed: boolean;
}

export interface CatalogSearchEvaluationResult {
  caseId: string;
  name: string;
  family: string;
  query: string;
  expectedEans: string[];
  top1Ean?: string;
  returnedEans: string[];
  top1Hit: boolean;
  top5Hit: boolean;
  strategyHit: boolean;
  parserHit: boolean;
  reasonsHit: boolean;
  metadataHit: boolean;
  passed: boolean;
  rankingStrategy?: string;
  similarityPercent?: number;
  durationMs: number;
  parserChecks: CatalogSearchEvaluationAttributeCheck[];
  metadataChecks: CatalogSearchEvaluationAttributeCheck[];
  missingReasons: string[];
  error?: string;
}

export interface CatalogSearchEvaluationSummary {
  total: number;
  completed: number;
  passed: number;
  failed: number;
  errors: number;
  top1Hits: number;
  top5Hits: number;
  strategyHits: number;
  parserHits: number;
  top1AccuracyPercent: number;
  top5AccuracyPercent: number;
  strategyAccuracyPercent: number;
  parserAccuracyPercent: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
}

export interface CatalogSearchEvaluationProgress {
  totalCases: number;
  completedCases: number;
  currentCaseId?: string;
  summary: CatalogSearchEvaluationSummary;
  results: CatalogSearchEvaluationResult[];
}

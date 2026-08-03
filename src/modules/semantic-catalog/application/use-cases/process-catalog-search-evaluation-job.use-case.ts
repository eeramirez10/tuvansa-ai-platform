import { AiJobRepository } from "../../../job-management/application/ports/ai-job.repository";
import { AiJobType } from "../../../job-management/domain/ai-job.entity";
import { EvaluateProscaiCatalogSearchUseCase } from "./evaluate-proscai-catalog-search.use-case";

export class ProcessCatalogSearchEvaluationJobUseCase {
  constructor(
    private readonly repository: AiJobRepository,
    private readonly evaluation: EvaluateProscaiCatalogSearchUseCase,
    private readonly model: string,
  ) {}

  public async execute(jobId: string): Promise<void> {
    const current = await this.repository.findById(jobId);
    if (!current) throw new Error(`Catalog evaluation job ${jobId} was not found.`);
    if (current.type !== AiJobType.CATALOG_SEARCH_EVALUATION) {
      throw new Error(`Job ${jobId} is not a catalog evaluation job.`);
    }
    const processing = await this.repository.markProcessing(jobId, 5);
    if (!processing) return;
    const startedAt = Date.now();
    try {
      const result = await this.evaluation.execute({
        caseIds: this.readCaseIds(processing.input),
        onProgress: async (progress) => {
          const percent = progress.totalCases > 0
            ? 5 + Math.floor((progress.completedCases / progress.totalCases) * 90)
            : 95;
          await this.repository.updateProgress(jobId, Math.min(95, percent));
        },
      });
      await this.repository.markCompleted(jobId, result);
      await this.repository.recordRun({
        jobId,
        attempt: processing.attempts,
        provider: "voyage-pinecone",
        model: this.model,
        promptVersion: processing.promptVersion ?? undefined,
        latencyMs: Date.now() - startedAt,
        succeeded: true,
      });
    } catch (error) {
      await this.repository.recordRun({
        jobId,
        attempt: processing.attempts,
        provider: "voyage-pinecone",
        model: this.model,
        promptVersion: processing.promptVersion ?? undefined,
        latencyMs: Date.now() - startedAt,
        succeeded: false,
        errorCode: "CATALOG_SEARCH_EVALUATION_FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown catalog evaluation error.",
      });
      throw error;
    }
  }

  private readCaseIds(value: unknown): string[] | undefined {
    if (!value || typeof value !== "object") return undefined;
    const caseIds = (value as Record<string, unknown>).caseIds;
    return Array.isArray(caseIds) && caseIds.every((id) => typeof id === "string")
      ? caseIds
      : undefined;
  }
}

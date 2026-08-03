import { AiJobRepository } from "../../../job-management/application/ports/ai-job.repository";
import { AiJobType } from "../../../job-management/domain/ai-job.entity";
import { VectorCatalogSyncJobInput } from "./create-vector-catalog-sync-job.use-case";
import { SyncCatalogVariantsResult, SyncProscaiCatalogVariantsUseCase } from "./sync-proscai-catalog-variants.use-case";

export class ProcessVectorCatalogSyncJobUseCase {
  constructor(
    private readonly repository: AiJobRepository,
    private readonly syncCatalog: SyncProscaiCatalogVariantsUseCase,
    private readonly model: string,
  ) {}

  public async execute(jobId: string): Promise<void> {
    const current = await this.repository.findById(jobId);
    if (!current) throw new Error(`Catalog sync job ${jobId} was not found.`);
    if (current.type !== AiJobType.VECTOR_CATALOG_SYNC) {
      throw new Error(`Job ${jobId} is not a vector catalog sync job.`);
    }
    const processing = await this.repository.markProcessing(jobId, 5);
    if (!processing) return;

    const input = this.parseInput(processing.input);
    const startedAt = Date.now();
    try {
      const result = await this.syncCatalog.execute({
        ...input,
        onProgress: async (progress) => {
          await this.repository.updateProgress(jobId, this.progress(progress, input.maxVariants));
        },
      });
      await this.repository.markCompleted(jobId, result);
      await this.repository.recordRun({
        jobId,
        attempt: processing.attempts,
        provider: "proscai-voyage-pinecone",
        model: this.model,
        promptVersion: processing.promptVersion ?? undefined,
        latencyMs: Date.now() - startedAt,
        succeeded: true,
      });
    } catch (error) {
      await this.repository.recordRun({
        jobId,
        attempt: processing.attempts,
        provider: "proscai-voyage-pinecone",
        model: this.model,
        promptVersion: processing.promptVersion ?? undefined,
        latencyMs: Date.now() - startedAt,
        succeeded: false,
        errorCode: "VECTOR_CATALOG_SYNC_FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown catalog sync error.",
      });
      throw error;
    }
  }

  private parseInput(value: unknown): VectorCatalogSyncJobInput {
    const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const maxVariants = Number(input.maxVariants);
    return {
      ...(Number.isInteger(maxVariants) && maxVariants > 0 ? { maxVariants } : {}),
      dryRun: input.dryRun === true,
      deleteStale: input.deleteStale !== false,
    };
  }

  private progress(result: SyncCatalogVariantsResult, maxVariants?: number): number {
    const selected = Math.min(result.eligible, maxVariants ?? result.eligible);
    const processed = result.unchanged + (result.dryRun ? result.changed : result.embedded);
    if (selected <= 0) return 90;
    return Math.min(95, 10 + Math.floor((processed / selected) * 80));
  }
}

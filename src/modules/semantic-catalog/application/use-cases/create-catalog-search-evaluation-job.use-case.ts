import { createHash, randomUUID } from "node:crypto";
import { JobQueuePort } from "../../../../shared/application/ports/job-queue.port";
import { AppError } from "../../../../shared/domain/app-error";
import { StableJsonSerializer } from "../../../../shared/infrastructure/serialization/stable-json-serializer";
import { AiJobRepository } from "../../../job-management/application/ports/ai-job.repository";
import { AiJobType } from "../../../job-management/domain/ai-job.entity";

export interface CatalogSearchEvaluationJobInput {
  caseIds?: string[];
}

export class CreateCatalogSearchEvaluationJobUseCase {
  constructor(
    private readonly repository: AiJobRepository,
    private readonly queue: JobQueuePort,
    private readonly version: string,
    private readonly serializer = new StableJsonSerializer(),
  ) {}

  public async execute(input: CatalogSearchEvaluationJobInput, requestedIdempotencyKey?: string) {
    const serialized = this.serializer.stringify(input);
    const inputHash = createHash("sha256").update(serialized).digest("hex");
    const externalKey = requestedIdempotencyKey?.trim();
    const idempotencyKey = externalKey
      ? `${AiJobType.CATALOG_SEARCH_EVALUATION}:${externalKey}`
      : `${AiJobType.CATALOG_SEARCH_EVALUATION}:${randomUUID()}`;
    const creation = await this.repository.createOrFind({
      type: AiJobType.CATALOG_SEARCH_EVALUATION,
      idempotencyKey,
      inputHash,
      input,
      promptVersion: this.version,
    });
    if (creation.created) {
      try {
        await this.queue.enqueue({ jobId: creation.job.id, type: AiJobType.CATALOG_SEARCH_EVALUATION });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Queue unavailable.";
        await this.repository.markFailed(creation.job.id, "QUEUE_UNAVAILABLE", message);
        throw new AppError("The evaluation job could not be queued.", 503, "QUEUE_UNAVAILABLE");
      }
    }
    return creation;
  }
}

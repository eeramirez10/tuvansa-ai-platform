import { createHash } from "node:crypto";
import { JobQueuePort } from "../../../../shared/application/ports/job-queue.port";
import { AppError } from "../../../../shared/domain/app-error";
import { StableJsonSerializer } from "../../../../shared/infrastructure/serialization/stable-json-serializer";
import { AiJobRepository } from "../../../job-management/application/ports/ai-job.repository";
import { AiJobType } from "../../../job-management/domain/ai-job.entity";

const SUPPORTED_TYPES = new Set<AiJobType>([
  AiJobType.TECHNICAL_DATA_SUGGESTION,
  AiJobType.MISSING_PRODUCT_NORMALIZATION,
  AiJobType.QUOTE_CATALOG_CODE_SUGGESTION,
  AiJobType.PARTY_DATA_EXTRACTION,
]);

export class CreateStructuredAiJobUseCase {
  constructor(
    private readonly repository: AiJobRepository,
    private readonly queue: JobQueuePort,
    private readonly promptVersion: string,
    private readonly serializer = new StableJsonSerializer(),
  ) {}

  public async execute(type: AiJobType, input: unknown) {
    if (!SUPPORTED_TYPES.has(type)) {
      throw new AppError(`Unsupported structured AI job type: ${type}`, 400, "UNSUPPORTED_JOB_TYPE");
    }
    const serialized = this.serializer.stringify(input);
    const inputHash = createHash("sha256").update(serialized).digest("hex");
    const creation = await this.repository.createOrFind({
      type,
      idempotencyKey: [type, this.promptVersion, inputHash].join(":"),
      inputHash,
      input,
      promptVersion: this.promptVersion,
    });

    if (creation.created) {
      try {
        await this.queue.enqueue({ jobId: creation.job.id, type });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Queue unavailable.";
        await this.repository.markFailed(creation.job.id, "QUEUE_UNAVAILABLE", message);
        throw new AppError("The job could not be queued.", 503, "QUEUE_UNAVAILABLE");
      }
    }
    return creation;
  }
}

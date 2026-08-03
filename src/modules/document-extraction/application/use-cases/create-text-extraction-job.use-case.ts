import { createHash } from "node:crypto";
import { JobQueuePort } from "../../../../shared/application/ports/job-queue.port";
import { AppError } from "../../../../shared/domain/app-error";
import { AiJobType } from "../../../job-management/domain/ai-job.entity";
import { AiJobRepository } from "../../../job-management/application/ports/ai-job.repository";

export type TextExtractionSource = "email" | "whatsapp" | "manual" | "ai_assistant";

export interface CreateTextExtractionJobInput {
  text: string;
  source?: TextExtractionSource;
}

export class CreateTextExtractionJobUseCase {
  constructor(
    private readonly repository: AiJobRepository,
    private readonly queue: JobQueuePort,
    private readonly promptVersion: string,
  ) {}

  public async execute(input: CreateTextExtractionJobInput) {
    const text = input.text.trim();
    if (!text) throw new AppError("Text is required.", 400, "TEXT_REQUIRED");
    if (text.length > 20_000) {
      throw new AppError("Text exceeds the 20000 character limit.", 400, "TEXT_TOO_LONG");
    }

    const source = input.source ?? "manual";
    const inputHash = createHash("sha256").update(text).digest("hex");
    const idempotencyKey = [AiJobType.QUOTE_TEXT_EXTRACTION, this.promptVersion, inputHash].join(":");
    const creation = await this.repository.createOrFind({
      type: AiJobType.QUOTE_TEXT_EXTRACTION,
      idempotencyKey,
      inputHash,
      input: { text, source },
      promptVersion: this.promptVersion,
    });

    if (creation.created) {
      try {
        await this.queue.enqueue({ jobId: creation.job.id, type: creation.job.type });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Queue unavailable.";
        await this.repository.markFailed(creation.job.id, "QUEUE_UNAVAILABLE", message);
        throw new AppError("The job could not be queued.", 503, "QUEUE_UNAVAILABLE");
      }
    }

    return creation;
  }
}

import { AppError } from "../../../../shared/domain/app-error";
import { AiJobRepository } from "../../../job-management/application/ports/ai-job.repository";
import { AiJobType } from "../../../job-management/domain/ai-job.entity";
import { StructuredAiProcessorPort } from "../ports/structured-ai-processor.port";

export class ProcessStructuredAiJobUseCase {
  constructor(
    private readonly repository: AiJobRepository,
    private readonly type: AiJobType,
    private readonly processor: StructuredAiProcessorPort,
    private readonly errorCode: string,
  ) {}

  public async execute(jobId: string): Promise<void> {
    const job = await this.repository.markProcessing(jobId, 10);
    if (!job) return;
    if (job.type !== this.type) {
      throw new AppError(`Unsupported job type: ${job.type}`, 400, "UNSUPPORTED_JOB_TYPE");
    }

    const startedAt = Date.now();
    try {
      await this.repository.updateProgress(jobId, 35);
      const processed = await this.processor.process(job.input);
      await this.repository.updateProgress(jobId, 90);
      await this.repository.recordRun({
        jobId,
        attempt: job.attempts,
        provider: processed.usage.provider,
        model: processed.usage.model,
        promptVersion: job.promptVersion ?? undefined,
        inputTokens: processed.usage.inputTokens,
        outputTokens: processed.usage.outputTokens,
        latencyMs: processed.usage.latencyMs,
        succeeded: true,
      });
      await this.repository.markCompleted(jobId, processed.result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown structured AI error.";
      await this.repository.recordRun({
        jobId,
        attempt: job.attempts,
        provider: "openai",
        model: "unknown",
        promptVersion: job.promptVersion ?? undefined,
        latencyMs: Date.now() - startedAt,
        succeeded: false,
        errorCode: this.errorCode,
        errorMessage: message,
      });
      throw error;
    }
  }
}

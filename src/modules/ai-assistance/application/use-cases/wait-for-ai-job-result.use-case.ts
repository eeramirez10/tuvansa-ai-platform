import { AppError } from "../../../../shared/domain/app-error";
import { AiJobRepository } from "../../../job-management/application/ports/ai-job.repository";
import { AiJobStatus } from "../../../job-management/domain/ai-job.entity";

export class WaitForAiJobResultUseCase {
  constructor(
    private readonly repository: AiJobRepository,
    private readonly timeoutMs: number,
    private readonly pollIntervalMs: number,
  ) {}

  public async execute(jobId: string): Promise<unknown> {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      const job = await this.repository.findById(jobId);
      if (!job) throw new AppError("Job not found.", 404, "JOB_NOT_FOUND");
      if (job.status === AiJobStatus.COMPLETED) return job.result;
      if (job.status === AiJobStatus.FAILED || job.status === AiJobStatus.CANCELLED) {
        throw new AppError(
          job.errorMessage ?? "The AI job failed.",
          502,
          job.errorCode ?? "AI_JOB_FAILED",
        );
      }
      await new Promise<void>((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
    throw new AppError(
      "The AI job continues processing. Query its status using the returned job id.",
      504,
      "AI_JOB_WAIT_TIMEOUT",
    );
  }
}

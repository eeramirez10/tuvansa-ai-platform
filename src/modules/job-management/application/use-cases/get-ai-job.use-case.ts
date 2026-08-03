import { AppError } from "../../../../shared/domain/app-error";
import { AiJobRepository } from "../ports/ai-job.repository";

export class GetAiJobUseCase {
  constructor(private readonly repository: AiJobRepository) {}

  public async execute(id: string) {
    const job = await this.repository.findById(id);
    if (!job) throw new AppError("Job not found.", 404, "JOB_NOT_FOUND");
    return job;
  }
}

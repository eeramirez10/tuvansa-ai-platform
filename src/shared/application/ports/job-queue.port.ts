import { AiJobType } from "../../../modules/job-management/domain/ai-job.entity";

export interface EnqueueJobInput {
  jobId: string;
  type: AiJobType;
}

export interface JobQueuePort {
  enqueue(input: EnqueueJobInput): Promise<void>;
}

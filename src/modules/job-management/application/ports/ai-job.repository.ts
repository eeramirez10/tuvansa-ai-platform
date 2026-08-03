import { AiJob, AiJobType } from "../../domain/ai-job.entity";

export interface CreateAiJobInput {
  type: AiJobType;
  idempotencyKey: string;
  inputHash: string;
  input: unknown;
  promptVersion?: string;
}

export interface CreateAiJobResult {
  job: AiJob;
  created: boolean;
}

export interface AiRunInput {
  jobId: string;
  attempt: number;
  provider: string;
  model: string;
  promptVersion?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  succeeded: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface AiJobRepository {
  createOrFind(input: CreateAiJobInput): Promise<CreateAiJobResult>;
  findById(id: string): Promise<AiJob | null>;
  markProcessing(id: string, progress: number): Promise<AiJob | null>;
  updateProgress(id: string, progress: number): Promise<void>;
  markQueuedForRetry(id: string, errorMessage: string): Promise<void>;
  markCompleted(id: string, result: unknown): Promise<void>;
  markFailed(id: string, errorCode: string, errorMessage: string): Promise<void>;
  recordRun(input: AiRunInput): Promise<void>;
}

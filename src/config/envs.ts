import "dotenv/config";
import path from "node:path";
import { get } from "env-var";

export interface BaseConfig {
  databaseUrl: string;
  redisUrl: string;
  internalApiKey?: string;
  documentStorageDirectory: string;
}

export interface ApiConfig extends BaseConfig {
  port: number;
  jobAttempts: number;
  jobBackoffMs: number;
  promptVersion: string;
  maxUploadBytes: number;
  structuredAiPromptVersion: string;
  compatibilityWaitTimeoutMs: number;
  compatibilityPollIntervalMs: number;
}

export interface WorkerConfig extends BaseConfig {
  openAiApiKey: string;
  openAiModel: string;
  promptVersion: string;
  jobAttempts: number;
  workerConcurrency: number;
  structuredAiPromptVersion: string;
}

function loadBaseConfig(): BaseConfig {
  const storageDirectory = get("DOCUMENT_STORAGE_DIRECTORY")
    .default("storage/uploads")
    .asString();
  return {
    databaseUrl: get("DATABASE_URL").required().asString(),
    redisUrl: get("REDIS_URL").default("redis://localhost:6379").asString(),
    internalApiKey: get("INTERNAL_API_KEY").asString() || undefined,
    documentStorageDirectory: path.resolve(process.cwd(), storageDirectory),
  };
}

export function loadApiConfig(): ApiConfig {
  return {
    ...loadBaseConfig(),
    port: get("API_PORT").default("4700").asPortNumber(),
    jobAttempts: get("JOB_ATTEMPTS").default("3").asIntPositive(),
    jobBackoffMs: get("JOB_BACKOFF_MS").default("2000").asIntPositive(),
    promptVersion: get("QUOTE_EXTRACTION_PROMPT_VERSION").default("quote-items-v1").asString(),
    maxUploadBytes: get("MAX_UPLOAD_BYTES").default("15728640").asIntPositive(),
    structuredAiPromptVersion: get("STRUCTURED_AI_PROMPT_VERSION").default("structured-ai-v1").asString(),
    compatibilityWaitTimeoutMs: get("COMPATIBILITY_WAIT_TIMEOUT_MS").default("60000").asIntPositive(),
    compatibilityPollIntervalMs: get("COMPATIBILITY_POLL_INTERVAL_MS").default("200").asIntPositive(),
  };
}

export function loadWorkerConfig(): WorkerConfig {
  return {
    ...loadBaseConfig(),
    openAiApiKey: get("OPENAI_API_KEY").required().asString(),
    openAiModel: get("OPENAI_MODEL").default("gpt-5-nano").asString(),
    promptVersion: get("QUOTE_EXTRACTION_PROMPT_VERSION").default("quote-items-v1").asString(),
    jobAttempts: get("JOB_ATTEMPTS").default("3").asIntPositive(),
    workerConcurrency: get("WORKER_CONCURRENCY").default("2").asIntPositive(),
    structuredAiPromptVersion: get("STRUCTURED_AI_PROMPT_VERSION").default("structured-ai-v1").asString(),
  };
}

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
  pineconeApiKey?: string;
  pineconeCatalogIndex: string;
  pineconeCatalogVariantsNamespace: string;
  pineconeLocalProductsNamespace: string;
  voyageApiKey?: string;
  voyageModel: string;
  voyageDimension: number;
  voyageMinRequestIntervalMs: number;
  erpProductsBaseUrl?: string;
  erpProductsTimeoutMs: number;
  erpProductsApiKey?: string;
  localProductsInternalApiKey?: string;
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
    pineconeApiKey: get("PINECONE_API_KEY").asString() || undefined,
    pineconeCatalogIndex: get("PINECONE_CATALOG_V2_INDEX").default("proscai-catalog-v2").asString(),
    pineconeCatalogVariantsNamespace: get("PINECONE_CATALOG_VARIANTS_NAMESPACE")
      .default("catalog-variants-v1")
      .asString(),
    pineconeLocalProductsNamespace: get("PINECONE_LOCAL_PRODUCTS_NAMESPACE")
      .default("local-products-v1")
      .asString(),
    voyageApiKey: get("VOYAGEAI_API_KEY").asString() || undefined,
    voyageModel: get("VOYAGE_CATALOG_V2_MODEL").default("voyage-4-large").asString(),
    voyageDimension: get("VOYAGE_CATALOG_V2_DIMENSION").default("1024").asIntPositive(),
    voyageMinRequestIntervalMs: get("VOYAGE_CATALOG_V2_MIN_REQUEST_INTERVAL_MS")
      .default("100")
      .asIntPositive(),
    erpProductsBaseUrl: get("ERP_PRODUCTS_BASE_URL")
      .default("http://localhost:3500/api/erp/products")
      .asString() || undefined,
    erpProductsTimeoutMs: get("ERP_PRODUCTS_TIMEOUT_MS").default("5000").asIntPositive(),
    erpProductsApiKey: get("ERP_PRODUCTS_API_KEY").asString() || undefined,
    localProductsInternalApiKey: get("LOCAL_PRODUCTS_INTERNAL_API_KEY").asString() || undefined,
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

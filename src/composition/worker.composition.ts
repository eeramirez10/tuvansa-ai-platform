import { Job, UnrecoverableError, Worker } from "bullmq";
import { WorkerConfig } from "../config/envs";
import { ProcessDocumentExtractionJobUseCase } from "../modules/document-extraction/application/use-cases/process-document-extraction-job.use-case";
import { ProcessTextExtractionJobUseCase } from "../modules/document-extraction/application/use-cases/process-text-extraction-job.use-case";
import { DocumentTextExtractorAdapter } from "../modules/document-extraction/infrastructure/files/document-text-extractor.adapter";
import { DocumentTypeDetector } from "../modules/document-extraction/infrastructure/files/document-type-detector";
import { LocalDocumentStorageAdapter } from "../modules/document-extraction/infrastructure/files/local-document-storage.adapter";
import { PdfDigitalReconciliationService } from "../modules/document-extraction/infrastructure/files/pdf-digital-reconciliation.service";
import { PdfDigitalTextReader } from "../modules/document-extraction/infrastructure/files/pdf-digital-text-reader";
import { XlsxTextReader } from "../modules/document-extraction/infrastructure/files/xlsx-text-reader";
import { OpenAiQuoteTextExtractorAdapter } from "../modules/document-extraction/infrastructure/openai-quote-text-extractor.adapter";
import { OpenAiQuotedExcelExtractorAdapter } from "../modules/document-extraction/infrastructure/openai-quoted-excel-extractor.adapter";
import { OpenAiSupplierQuoteExtractorAdapter } from "../modules/document-extraction/infrastructure/openai-supplier-quote-extractor.adapter";
import { AiJobType } from "../modules/job-management/domain/ai-job.entity";
import { PrismaAiJobRepository } from "../modules/job-management/infrastructure/prisma-ai-job.repository";
import { EnqueueJobInput } from "../shared/application/ports/job-queue.port";
import { AppError } from "../shared/domain/app-error";
import { createPrismaClient } from "../shared/infrastructure/database/prisma-client";
import { AI_JOBS_QUEUE } from "../shared/infrastructure/queue/queue.constants";
import { createWorkerRedisConnection } from "../shared/infrastructure/queue/redis-connection";
import { ProcessStructuredAiJobUseCase } from "../modules/ai-assistance/application/use-cases/process-structured-ai-job.use-case";
import { OpenAiCatalogCodeProcessor } from "../modules/ai-assistance/infrastructure/openai-catalog-code.processor";
import { OpenAiMissingProductsProcessor } from "../modules/ai-assistance/infrastructure/openai-missing-products.processor";
import { OpenAiTechnicalDataProcessor } from "../modules/ai-assistance/infrastructure/openai-technical-data.processor";
import { BuildProscaiCatalogVariantsUseCase } from "../modules/semantic-catalog/application/use-cases/build-proscai-catalog-variants.use-case";
import { ProcessVectorCatalogSyncJobUseCase } from "../modules/semantic-catalog/application/use-cases/process-vector-catalog-sync-job.use-case";
import { SyncProscaiCatalogVariantsUseCase } from "../modules/semantic-catalog/application/use-cases/sync-proscai-catalog-variants.use-case";
import { MysqlProscaiCatalogVariantDatasource } from "../modules/semantic-catalog/infrastructure/mysql-proscai-catalog-variant.datasource";
import { PineconeVectorIndexAdapter } from "../modules/semantic-catalog/infrastructure/pinecone-vector-index.adapter";
import { ProscaiCatalogNormalizerService } from "../modules/semantic-catalog/infrastructure/proscai-catalog-normalizer.service";
import { VoyageTextEmbeddingAdapter } from "../modules/semantic-catalog/infrastructure/voyage-text-embedding.adapter";

export interface WorkerRuntime {
  start(): void;
  close(): Promise<void>;
}

export function composeWorker(config: WorkerConfig): WorkerRuntime {
  const prisma = createPrismaClient(config.databaseUrl);
  const redis = createWorkerRedisConnection(config.redisUrl);
  const repository = new PrismaAiJobRepository(prisma);
  const quoteExtractor = new OpenAiQuoteTextExtractorAdapter(config.openAiApiKey, config.openAiModel);
  const quotedExcelExtractor = new OpenAiQuotedExcelExtractorAdapter(config.openAiApiKey, config.openAiModel);
  const supplierQuoteExtractor = new OpenAiSupplierQuoteExtractorAdapter(config.openAiApiKey, config.openAiModel);
  const technicalDataProcessor = new ProcessStructuredAiJobUseCase(
    repository,
    AiJobType.TECHNICAL_DATA_SUGGESTION,
    new OpenAiTechnicalDataProcessor(config.openAiApiKey, config.openAiModel),
    "TECHNICAL_DATA_SUGGESTION_FAILED",
  );
  const missingProductsProcessor = new ProcessStructuredAiJobUseCase(
    repository,
    AiJobType.MISSING_PRODUCT_NORMALIZATION,
    new OpenAiMissingProductsProcessor(config.openAiApiKey, config.openAiModel),
    "MISSING_PRODUCT_NORMALIZATION_FAILED",
  );
  const catalogCodeProcessor = new ProcessStructuredAiJobUseCase(
    repository,
    AiJobType.QUOTE_CATALOG_CODE_SUGGESTION,
    new OpenAiCatalogCodeProcessor(config.openAiApiKey, config.openAiModel),
    "QUOTE_CATALOG_CODE_SUGGESTION_FAILED",
  );
  const storage = new LocalDocumentStorageAdapter(config.documentStorageDirectory);
  const documentExtractor = new DocumentTextExtractorAdapter(
    new DocumentTypeDetector(),
    new XlsxTextReader(),
    new PdfDigitalTextReader(new PdfDigitalReconciliationService()),
  );
  const processTextJob = new ProcessTextExtractionJobUseCase(repository, quoteExtractor);
  const processDocumentJob = new ProcessDocumentExtractionJobUseCase(
    repository,
    storage,
    documentExtractor,
    quoteExtractor,
    quotedExcelExtractor,
    supplierQuoteExtractor,
  );
  const catalogSync = composeCatalogSyncProcessor(config, repository);
  let worker: Worker<EnqueueJobInput> | undefined;

  return {
    start: () => {
      worker = new Worker<EnqueueJobInput>(
        AI_JOBS_QUEUE,
        async (job: Job<EnqueueJobInput>) => {
          try {
            if (job.data.type === AiJobType.QUOTE_TEXT_EXTRACTION) {
              await processTextJob.execute(job.data.jobId);
              return;
            }
            if (isDocumentJob(job.data.type)) {
              await processDocumentJob.execute(job.data.jobId);
              return;
            }
            if (job.data.type === AiJobType.TECHNICAL_DATA_SUGGESTION) {
              await technicalDataProcessor.execute(job.data.jobId);
              return;
            }
            if (job.data.type === AiJobType.MISSING_PRODUCT_NORMALIZATION) {
              await missingProductsProcessor.execute(job.data.jobId);
              return;
            }
            if (job.data.type === AiJobType.QUOTE_CATALOG_CODE_SUGGESTION) {
              await catalogCodeProcessor.execute(job.data.jobId);
              return;
            }
            if (job.data.type === AiJobType.VECTOR_CATALOG_SYNC) {
              if (!catalogSync.processor) {
                throw new UnrecoverableError("Vector catalog synchronization is not configured.");
              }
              await catalogSync.processor.execute(job.data.jobId);
              return;
            }
            throw new UnrecoverableError(`Unsupported job type: ${job.data.type}`);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown worker error.";
            const allowedAttempts = Number(job.opts.attempts ?? config.jobAttempts);
            const finalAttempt = job.attemptsMade + 1 >= allowedAttempts;
            const unrecoverable = error instanceof UnrecoverableError || error instanceof AppError;
            if (finalAttempt || unrecoverable) {
              const code = error instanceof AppError ? error.code : errorCodeFor(job.data.type);
              await repository.markFailed(job.data.jobId, code, message);
              if (isDocumentJob(job.data.type)) {
                const currentJob = await repository.findById(job.data.jobId);
                const stored = currentJob ? processDocumentJob.getStoredFile(currentJob.input) : null;
                if (stored) await storage.remove(stored.filePath);
              }
            } else {
              await repository.markQueuedForRetry(job.data.jobId, message);
            }
            throw error;
          }
        },
        { connection: redis, concurrency: config.workerConcurrency },
      );

      worker.on("completed", (job) => {
        console.log(JSON.stringify({ level: "info", event: "job.completed", jobId: job.id }));
      });
      worker.on("failed", (job, error) => {
        console.error(JSON.stringify({
          level: "error",
          event: "job.failed",
          jobId: job?.id,
          attempt: job?.attemptsMade,
          message: error.message,
        }));
      });
      worker.on("error", (error) => {
        console.error(JSON.stringify({ level: "error", event: "worker.error", message: error.message }));
      });
    },
    close: async () => {
      if (worker) await worker.close();
      if (catalogSync.datasource) await catalogSync.datasource.close();
      await redis.quit();
      await prisma.$disconnect();
    },
  };
}

function isDocumentJob(type: AiJobType): boolean {
  return [
    AiJobType.QUOTE_DOCUMENT_EXTRACTION,
    AiJobType.QUOTED_EXCEL_EXTRACTION,
    AiJobType.SUPPLIER_QUOTE_EXTRACTION,
  ].includes(type);
}

function errorCodeFor(type: AiJobType): string {
  if (type === AiJobType.TECHNICAL_DATA_SUGGESTION) return "TECHNICAL_DATA_SUGGESTION_FAILED";
  if (type === AiJobType.MISSING_PRODUCT_NORMALIZATION) return "MISSING_PRODUCT_NORMALIZATION_FAILED";
  if (type === AiJobType.QUOTE_CATALOG_CODE_SUGGESTION) return "QUOTE_CATALOG_CODE_SUGGESTION_FAILED";
  if (type === AiJobType.QUOTED_EXCEL_EXTRACTION) return "QUOTED_EXCEL_EXTRACTION_FAILED";
  if (type === AiJobType.SUPPLIER_QUOTE_EXTRACTION) return "SUPPLIER_QUOTE_EXTRACTION_FAILED";
  if (type === AiJobType.QUOTE_TEXT_EXTRACTION) return "QUOTE_TEXT_EXTRACTION_FAILED";
  if (type === AiJobType.QUOTE_DOCUMENT_EXTRACTION) return "QUOTE_DOCUMENT_EXTRACTION_FAILED";
  if (type === AiJobType.VECTOR_CATALOG_SYNC) return "VECTOR_CATALOG_SYNC_FAILED";
  return "AI_JOB_PROCESSING_FAILED";
}

function composeCatalogSyncProcessor(
  config: WorkerConfig,
  repository: PrismaAiJobRepository,
): {
  processor?: ProcessVectorCatalogSyncJobUseCase;
  datasource?: MysqlProscaiCatalogVariantDatasource;
} {
  const required = [
    config.pineconeApiKey,
    config.voyageApiKey,
    config.mysqlHost,
    config.mysqlUser,
    config.mysqlPassword,
    config.mysqlDatabase,
  ];
  if (required.some((value) => !value)) return {};

  const datasource = new MysqlProscaiCatalogVariantDatasource({
    host: config.mysqlHost!,
    user: config.mysqlUser!,
    password: config.mysqlPassword!,
    database: config.mysqlDatabase!,
  });
  const embeddings = new VoyageTextEmbeddingAdapter(
    config.voyageApiKey!,
    config.voyageModel,
    config.voyageDimension,
    config.voyageMinRequestIntervalMs,
  );
  const vectorIndex = new PineconeVectorIndexAdapter(
    config.pineconeApiKey!,
    config.pineconeCatalogIndex,
    config.pineconeCatalogVariantsNamespace,
  );
  const buildVariants = new BuildProscaiCatalogVariantsUseCase(
    datasource,
    new ProscaiCatalogNormalizerService(),
  );
  const sync = new SyncProscaiCatalogVariantsUseCase(
    buildVariants,
    embeddings,
    vectorIndex,
    config.voyageModel,
    config.pineconeCatalogVariantsNamespace,
  );
  return {
    datasource,
    processor: new ProcessVectorCatalogSyncJobUseCase(repository, sync, config.voyageModel),
  };
}

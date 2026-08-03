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
import { AiJobType } from "../modules/job-management/domain/ai-job.entity";
import { PrismaAiJobRepository } from "../modules/job-management/infrastructure/prisma-ai-job.repository";
import { EnqueueJobInput } from "../shared/application/ports/job-queue.port";
import { AppError } from "../shared/domain/app-error";
import { createPrismaClient } from "../shared/infrastructure/database/prisma-client";
import { AI_JOBS_QUEUE } from "../shared/infrastructure/queue/queue.constants";
import { createWorkerRedisConnection } from "../shared/infrastructure/queue/redis-connection";

export interface WorkerRuntime {
  start(): void;
  close(): Promise<void>;
}

export function composeWorker(config: WorkerConfig): WorkerRuntime {
  const prisma = createPrismaClient(config.databaseUrl);
  const redis = createWorkerRedisConnection(config.redisUrl);
  const repository = new PrismaAiJobRepository(prisma);
  const quoteExtractor = new OpenAiQuoteTextExtractorAdapter(config.openAiApiKey, config.openAiModel);
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
  );
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
            if (job.data.type === AiJobType.QUOTE_DOCUMENT_EXTRACTION) {
              await processDocumentJob.execute(job.data.jobId);
              return;
            }
            throw new UnrecoverableError(`Unsupported job type: ${job.data.type}`);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown worker error.";
            const allowedAttempts = Number(job.opts.attempts ?? config.jobAttempts);
            const finalAttempt = job.attemptsMade + 1 >= allowedAttempts;
            const unrecoverable = error instanceof UnrecoverableError || error instanceof AppError;
            if (finalAttempt || unrecoverable) {
              const code = error instanceof AppError ? error.code : "AI_JOB_PROCESSING_FAILED";
              await repository.markFailed(job.data.jobId, code, message);
              if (job.data.type === AiJobType.QUOTE_DOCUMENT_EXTRACTION) {
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
      await redis.quit();
      await prisma.$disconnect();
    },
  };
}

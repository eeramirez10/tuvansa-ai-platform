import cors from "cors";
import express, { Express } from "express";
import { ApiConfig } from "../config/envs";
import { CreateDocumentExtractionJobUseCase } from "../modules/document-extraction/application/use-cases/create-document-extraction-job.use-case";
import { CreateTextExtractionJobUseCase } from "../modules/document-extraction/application/use-cases/create-text-extraction-job.use-case";
import { LocalDocumentStorageAdapter } from "../modules/document-extraction/infrastructure/files/local-document-storage.adapter";
import { ExtractionJobsController } from "../modules/document-extraction/presentation/extraction-jobs.controller";
import { ExtractionJobsRoutes } from "../modules/document-extraction/presentation/extraction-jobs.routes";
import { GetAiJobUseCase } from "../modules/job-management/application/use-cases/get-ai-job.use-case";
import { PrismaAiJobRepository } from "../modules/job-management/infrastructure/prisma-ai-job.repository";
import { createPrismaClient } from "../shared/infrastructure/database/prisma-client";
import { BullMqJobQueueAdapter } from "../shared/infrastructure/queue/bullmq-job-queue.adapter";
import { createProducerRedisConnection } from "../shared/infrastructure/queue/redis-connection";
import { errorHandler } from "../shared/presentation/error-handler";
import { internalApiKeyMiddleware } from "../shared/presentation/middleware/internal-api-key.middleware";

export interface ApiRuntime {
  app: Express;
  close(): Promise<void>;
}

export function composeApi(config: ApiConfig): ApiRuntime {
  const prisma = createPrismaClient(config.databaseUrl);
  const redis = createProducerRedisConnection(config.redisUrl);
  const queue = new BullMqJobQueueAdapter(redis, {
    attempts: config.jobAttempts,
    backoff: { type: "exponential", delay: config.jobBackoffMs },
    removeOnComplete: { age: 86_400, count: 5_000 },
    removeOnFail: { age: 604_800, count: 10_000 },
  });
  const repository = new PrismaAiJobRepository(prisma);
  const storage = new LocalDocumentStorageAdapter(config.documentStorageDirectory);
  const createTextJob = new CreateTextExtractionJobUseCase(repository, queue, config.promptVersion);
  const createDocumentJob = new CreateDocumentExtractionJobUseCase(
    repository,
    queue,
    storage,
    config.promptVersion,
    config.maxUploadBytes,
  );
  const getJob = new GetAiJobUseCase(repository);
  const controller = new ExtractionJobsController(createTextJob, createDocumentJob, getJob);
  const routes = new ExtractionJobsRoutes(controller, config.maxUploadBytes);

  const app = express();
  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health/live", (_req, res) => {
    res.json({ ok: true, service: "tuvansa-ai-platform", process: "api" });
  });
  app.get("/health/ready", async (_req, res) => {
    try {
      await Promise.all([prisma.$queryRaw`SELECT 1`, redis.ping()]);
      res.json({ ok: true, database: "ready", queue: "ready" });
    } catch {
      res.status(503).json({ ok: false, database: "unavailable", queue: "unavailable" });
    }
  });

  app.use("/api", internalApiKeyMiddleware(config.internalApiKey), routes.build());
  app.use(errorHandler);

  return {
    app,
    close: async () => {
      await queue.close();
      await redis.quit();
      await prisma.$disconnect();
    },
  };
}

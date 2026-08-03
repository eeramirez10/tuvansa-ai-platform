import { Prisma } from "../../../generated/prisma/client";
import { AiJob, AiJobStatus, AiJobType } from "../domain/ai-job.entity";
import {
  AiJobRepository,
  AiRunInput,
  CreateAiJobInput,
  CreateAiJobResult,
} from "../application/ports/ai-job.repository";
import { PlatformPrismaClient } from "../../../shared/infrastructure/database/prisma-client";

export class PrismaAiJobRepository implements AiJobRepository {
  constructor(private readonly prisma: PlatformPrismaClient) {}

  public async createOrFind(input: CreateAiJobInput): Promise<CreateAiJobResult> {
    const existing = await this.prisma.aiJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return { job: this.map(existing), created: false };

    try {
      const created = await this.prisma.aiJob.create({
        data: {
          type: input.type,
          idempotencyKey: input.idempotencyKey,
          inputHash: input.inputHash,
          inputJson: input.input as Prisma.InputJsonValue,
          promptVersion: input.promptVersion,
        },
      });
      return { job: this.map(created), created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const concurrent = await this.prisma.aiJob.findUniqueOrThrow({
          where: { idempotencyKey: input.idempotencyKey },
        });
        return { job: this.map(concurrent), created: false };
      }
      throw error;
    }
  }

  public async findById(id: string): Promise<AiJob | null> {
    const row = await this.prisma.aiJob.findUnique({ where: { id } });
    return row ? this.map(row) : null;
  }

  public async markProcessing(id: string, progress: number): Promise<AiJob | null> {
    const result = await this.prisma.aiJob.updateMany({
      where: { id, status: { in: [AiJobStatus.QUEUED, AiJobStatus.PROCESSING] } },
      data: {
        status: AiJobStatus.PROCESSING,
        progress: this.normalizeProgress(progress),
        startedAt: new Date(),
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        attempts: { increment: 1 },
      },
    });
    if (result.count !== 1) return null;
    return this.findById(id);
  }

  public async updateProgress(id: string, progress: number): Promise<void> {
    await this.prisma.aiJob.update({
      where: { id },
      data: { progress: this.normalizeProgress(progress) },
    });
  }

  public async markQueuedForRetry(id: string, errorMessage: string): Promise<void> {
    await this.prisma.aiJob.update({
      where: { id },
      data: {
        status: AiJobStatus.QUEUED,
        errorCode: "TRANSIENT_PROCESSING_ERROR",
        errorMessage,
      },
    });
  }

  public async markCompleted(id: string, result: unknown): Promise<void> {
    await this.prisma.aiJob.update({
      where: { id },
      data: {
        status: AiJobStatus.COMPLETED,
        progress: 100,
        resultJson: result as Prisma.InputJsonValue,
        errorCode: null,
        errorMessage: null,
        completedAt: new Date(),
      },
    });
  }

  public async markFailed(id: string, errorCode: string, errorMessage: string): Promise<void> {
    await this.prisma.aiJob.update({
      where: { id },
      data: {
        status: AiJobStatus.FAILED,
        errorCode,
        errorMessage,
        completedAt: new Date(),
      },
    });
  }

  public async recordRun(input: AiRunInput): Promise<void> {
    await this.prisma.aiJobRun.create({ data: input });
  }

  private map(row: {
    id: string;
    type: string;
    status: string;
    progress: number;
    idempotencyKey: string;
    inputHash: string;
    inputJson: unknown;
    resultJson: unknown | null;
    errorCode: string | null;
    errorMessage: string | null;
    promptVersion: string | null;
    attempts: number;
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
  }): AiJob {
    return new AiJob({
      ...row,
      type: row.type as AiJobType,
      status: row.status as AiJobStatus,
      input: row.inputJson,
      result: row.resultJson,
    });
  }

  private normalizeProgress(value: number): number {
    return Math.max(0, Math.min(100, Math.trunc(value)));
  }
}

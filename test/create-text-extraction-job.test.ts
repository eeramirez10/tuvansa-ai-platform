import assert from "node:assert/strict";
import test from "node:test";
import { JobQueuePort, EnqueueJobInput } from "../src/shared/application/ports/job-queue.port";
import { AppError } from "../src/shared/domain/app-error";
import { CreateTextExtractionJobUseCase } from "../src/modules/document-extraction/application/use-cases/create-text-extraction-job.use-case";
import { AiJob, AiJobStatus, AiJobType } from "../src/modules/job-management/domain/ai-job.entity";
import {
  AiJobRepository,
  AiRunInput,
  CreateAiJobInput,
  CreateAiJobResult,
} from "../src/modules/job-management/application/ports/ai-job.repository";

class FakeQueue implements JobQueuePort {
  public messages: EnqueueJobInput[] = [];

  public async enqueue(input: EnqueueJobInput): Promise<void> {
    this.messages.push(input);
  }
}

class FakeRepository implements AiJobRepository {
  private job?: AiJob;

  public async createOrFind(input: CreateAiJobInput): Promise<CreateAiJobResult> {
    if (this.job) return { job: this.job, created: false };
    this.job = new AiJob({
      id: "job-1",
      type: input.type,
      status: AiJobStatus.QUEUED,
      progress: 0,
      idempotencyKey: input.idempotencyKey,
      inputHash: input.inputHash,
      input: input.input,
      result: null,
      errorCode: null,
      errorMessage: null,
      promptVersion: input.promptVersion ?? null,
      attempts: 0,
      createdAt: new Date("2026-08-03T00:00:00.000Z"),
      updatedAt: new Date("2026-08-03T00:00:00.000Z"),
      startedAt: null,
      completedAt: null,
    });
    return { job: this.job, created: true };
  }

  public async findById(): Promise<AiJob | null> { return this.job ?? null; }
  public async markProcessing(): Promise<AiJob | null> { return this.job ?? null; }
  public async updateProgress(): Promise<void> {}
  public async markQueuedForRetry(): Promise<void> {}
  public async markCompleted(): Promise<void> {}
  public async markFailed(): Promise<void> {}
  public async recordRun(_input: AiRunInput): Promise<void> {}
}

test("creates and enqueues a text extraction job", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const useCase = new CreateTextExtractionJobUseCase(repository, queue, "quote-items-v1");

  const result = await useCase.execute({
    text: " 2 PZA VALVULA COMPUERTA 2 PULGADAS ",
    source: "manual",
  });

  assert.equal(result.created, true);
  assert.equal(result.job.type, AiJobType.QUOTE_TEXT_EXTRACTION);
  assert.deepEqual(queue.messages, [{ jobId: "job-1", type: AiJobType.QUOTE_TEXT_EXTRACTION }]);
});

test("deduplicates the same text and does not enqueue twice", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const useCase = new CreateTextExtractionJobUseCase(repository, queue, "quote-items-v1");

  await useCase.execute({ text: "10 M TUBO ACERO", source: "email" });
  const duplicate = await useCase.execute({ text: "10 M TUBO ACERO", source: "email" });

  assert.equal(duplicate.created, false);
  assert.equal(queue.messages.length, 1);
});

test("rejects empty text before persistence", async () => {
  const useCase = new CreateTextExtractionJobUseCase(
    new FakeRepository(),
    new FakeQueue(),
    "quote-items-v1",
  );

  await assert.rejects(
    () => useCase.execute({ text: "   " }),
    (error: unknown) => error instanceof AppError && error.code === "TEXT_REQUIRED",
  );
});

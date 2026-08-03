import assert from "node:assert/strict";
import test from "node:test";
import { CreateStructuredAiJobUseCase } from "../src/modules/ai-assistance/application/use-cases/create-structured-ai-job.use-case";
import { ProcessStructuredAiJobUseCase } from "../src/modules/ai-assistance/application/use-cases/process-structured-ai-job.use-case";
import { WaitForAiJobResultUseCase } from "../src/modules/ai-assistance/application/use-cases/wait-for-ai-job-result.use-case";
import { StructuredAiProcessorPort } from "../src/modules/ai-assistance/application/ports/structured-ai-processor.port";
import { CatalogCodeRequestDto } from "../src/modules/ai-assistance/domain/catalog-code-request.dto";
import { MissingProductsRequestDto } from "../src/modules/ai-assistance/domain/missing-products-request.dto";
import { TechnicalDataBatchRequestDto } from "../src/modules/ai-assistance/domain/technical-data-request.dto";
import { PartyDataRequestDto } from "../src/modules/ai-assistance/domain/party-data-request.dto";
import { AiJobRepository, AiRunInput, CreateAiJobInput, CreateAiJobResult } from "../src/modules/job-management/application/ports/ai-job.repository";
import { AiJob, AiJobStatus, AiJobType } from "../src/modules/job-management/domain/ai-job.entity";
import { EnqueueJobInput, JobQueuePort } from "../src/shared/application/ports/job-queue.port";
import { AppError } from "../src/shared/domain/app-error";

class FakeQueue implements JobQueuePort {
  public messages: EnqueueJobInput[] = [];
  public async enqueue(input: EnqueueJobInput): Promise<void> { this.messages.push(input); }
}

class FakeRepository implements AiJobRepository {
  private readonly jobsByKey = new Map<string, AiJob>();
  public currentJob?: AiJob;
  public completedResult: unknown;
  public runs: AiRunInput[] = [];

  public async createOrFind(input: CreateAiJobInput): Promise<CreateAiJobResult> {
    const existing = this.jobsByKey.get(input.idempotencyKey);
    if (existing) return { job: existing, created: false };
    const job = this.buildJob(input.type, AiJobStatus.QUEUED, input.input, null);
    this.jobsByKey.set(input.idempotencyKey, job);
    this.currentJob = job;
    return { job, created: true };
  }

  public async findById(): Promise<AiJob | null> { return this.currentJob ?? null; }
  public async markProcessing(): Promise<AiJob | null> { return this.currentJob ?? null; }
  public async updateProgress(): Promise<void> {}
  public async markQueuedForRetry(): Promise<void> {}
  public async markCompleted(_id: string, result: unknown): Promise<void> { this.completedResult = result; }
  public async markFailed(): Promise<void> {}
  public async recordRun(input: AiRunInput): Promise<void> { this.runs.push(input); }

  public setCompleted(type: AiJobType, result: unknown): void {
    this.currentJob = this.buildJob(type, AiJobStatus.COMPLETED, {}, result);
  }

  public setProcessing(type: AiJobType, input: unknown): void {
    this.currentJob = this.buildJob(type, AiJobStatus.PROCESSING, input, null);
  }

  private buildJob(type: AiJobType, status: AiJobStatus, input: unknown, result: unknown): AiJob {
    return new AiJob({
      id: `job-${type}`,
      type,
      status,
      progress: status === AiJobStatus.COMPLETED ? 100 : 0,
      idempotencyKey: `key-${type}`,
      inputHash: "hash",
      input,
      result,
      errorCode: null,
      errorMessage: null,
      promptVersion: "structured-ai-v1",
      attempts: 1,
      createdAt: new Date("2026-08-03T00:00:00.000Z"),
      updatedAt: new Date("2026-08-03T00:00:00.000Z"),
      startedAt: null,
      completedAt: status === AiJobStatus.COMPLETED ? new Date("2026-08-03T00:00:01.000Z") : null,
    });
  }
}

test("deduplicates semantically equal structured payloads with different key order", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const useCase = new CreateStructuredAiJobUseCase(repository, queue, "v1");

  const first = await useCase.execute(AiJobType.TECHNICAL_DATA_SUGGESTION, {
    mode: "single",
    payload: { requestedDescription: "TUBO", existingAttributes: { B: "2", A: "1" } },
  });
  const duplicate = await useCase.execute(AiJobType.TECHNICAL_DATA_SUGGESTION, {
    payload: { existingAttributes: { A: "1", B: "2" }, requestedDescription: "TUBO" },
    mode: "single",
  });

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(queue.messages.length, 1);
});

test("accepts compatibility aliases for missing product normalization", () => {
  const dto = MissingProductsRequestDto.create({
    items: [{
      item_id: "tmp-1",
      description_original: "TUBO ACERO 4 PULGADAS",
      cantidad: "10",
      unidad_original: "MTS",
    }],
  });
  assert.deepEqual(dto.toJobInput(), {
    items: [{ itemId: "tmp-1", description: "TUBO ACERO 4 PULGADAS", quantity: 10, unit: "MTS" }],
  });
});

test("rejects duplicate technical item ids before queueing", () => {
  assert.throws(
    () => TechnicalDataBatchRequestDto.create({
      items: [
        { itemId: "1", requestedDescription: "TUBO" },
        { itemId: "1", supplierDescription: "PIPE" },
      ],
    }),
    (error: unknown) => error instanceof AppError && error.code === "DUPLICATE_TECHNICAL_ITEM_ID",
  );
});

test("validates catalog types before consuming AI", () => {
  assert.throws(
    () => CatalogCodeRequestDto.create({ type: "UNKNOWN", label: "Ejemplo" }),
    (error: unknown) => error instanceof AppError && error.code === "INVALID_CATALOG_TYPE",
  );
});

test("normalizes party type and preserves pasted contact text", () => {
  const dto = PartyDataRequestDto.create({
    partyType: "supplier",
    text: "  ACME SA DE CV | ventas@acme.mx | WhatsApp +52 81 1234 5678  ",
  });
  assert.deepEqual(dto.toJobInput(), {
    partyType: "SUPPLIER",
    text: "ACME SA DE CV | ventas@acme.mx | WhatsApp +52 81 1234 5678",
  });
});

test("rejects invalid party extraction types before queueing", () => {
  assert.throws(
    () => PartyDataRequestDto.create({ partyType: "EMPLOYEE", text: "Persona" }),
    (error: unknown) => error instanceof AppError && error.code === "INVALID_PARTY_TYPE",
  );
});

test("returns a completed job result through the synchronous compatibility wait", async () => {
  const repository = new FakeRepository();
  repository.setCompleted(AiJobType.QUOTE_CATALOG_CODE_SUGGESTION, { code: "CASH_PAYMENT" });
  const wait = new WaitForAiJobResultUseCase(repository, 100, 1);
  assert.deepEqual(await wait.execute("job"), { code: "CASH_PAYMENT" });
});

test("processes a structured job and records usage", async () => {
  const repository = new FakeRepository();
  repository.setProcessing(AiJobType.TECHNICAL_DATA_SUGGESTION, { mode: "single" });
  const processor: StructuredAiProcessorPort = {
    process: async () => ({
      result: { family: "PIPE" },
      usage: { provider: "openai", model: "test", inputTokens: 20, outputTokens: 10, latencyMs: 5 },
    }),
  };
  const useCase = new ProcessStructuredAiJobUseCase(
    repository,
    AiJobType.TECHNICAL_DATA_SUGGESTION,
    processor,
    "TECHNICAL_DATA_SUGGESTION_FAILED",
  );

  await useCase.execute("job");

  assert.deepEqual(repository.completedResult, { family: "PIPE" });
  assert.equal(repository.runs[0]?.inputTokens, 20);
  assert.equal(repository.runs[0]?.succeeded, true);
});

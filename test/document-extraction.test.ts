import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { EnqueueJobInput, JobQueuePort } from "../src/shared/application/ports/job-queue.port";
import { CreateDocumentExtractionJobUseCase } from "../src/modules/document-extraction/application/use-cases/create-document-extraction-job.use-case";
import { DocumentStoragePort } from "../src/modules/document-extraction/application/ports/document-storage.port";
import { StoredDocument, UploadedDocument } from "../src/modules/document-extraction/domain/document-file";
import { XlsxTextReader } from "../src/modules/document-extraction/infrastructure/files/xlsx-text-reader";
import { AiJob, AiJobStatus, AiJobType } from "../src/modules/job-management/domain/ai-job.entity";
import { AppError } from "../src/shared/domain/app-error";
import {
  AiJobRepository,
  AiRunInput,
  CreateAiJobInput,
  CreateAiJobResult,
} from "../src/modules/job-management/application/ports/ai-job.repository";

class FakeQueue implements JobQueuePort {
  public messages: EnqueueJobInput[] = [];
  public async enqueue(input: EnqueueJobInput): Promise<void> { this.messages.push(input); }
}

class FakeStorage implements DocumentStoragePort {
  public removed: string[] = [];
  private sequence = 0;

  public async save(file: UploadedDocument): Promise<StoredDocument> {
    this.sequence += 1;
    return {
      fileName: file.originalName,
      filePath: `/tmp/file-${this.sequence}-${file.originalName}`,
      mimeType: file.mimeType,
    };
  }
  public async read(): Promise<Buffer> { return Buffer.from("content"); }
  public async remove(filePath: string): Promise<void> { this.removed.push(filePath); }
}

class FakeRepository implements AiJobRepository {
  private job?: AiJob;

  public async createOrFind(input: CreateAiJobInput): Promise<CreateAiJobResult> {
    if (this.job) return { job: this.job, created: false };
    this.job = new AiJob({
      id: "document-job-1",
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

test("reads quote rows from XLSX in source order", () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["CANTIDAD", "UNIDAD", "DESCRIPCION"],
    [2, "PZA", "VALVULA COMPUERTA 2 PULGADAS"],
    [10, "M", "TUBO ACERO AL CARBON"],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Cotizacion");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const text = new XlsxTextReader().read(buffer);

  assert.match(text, /2 \| PZA \| VALVULA COMPUERTA 2 PULGADAS/);
  assert.ok(text.indexOf("VALVULA") < text.indexOf("TUBO"));
});

test("creates one document job and removes only the duplicate upload", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const storage = new FakeStorage();
  const useCase = new CreateDocumentExtractionJobUseCase(
    repository,
    queue,
    storage,
    "quote-items-v1",
    1024,
  );
  const file = {
    buffer: Buffer.from("valid xlsx bytes"),
    originalName: "quote.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };

  const first = await useCase.execute(file);
  const duplicate = await useCase.execute(file);

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(queue.messages.length, 1);
  assert.deepEqual(storage.removed, ["/tmp/file-2-quote.xlsx"]);
});

test("rejects non-Excel files for quoted Excel jobs before storing them", async () => {
  const storage = new FakeStorage();
  const useCase = new CreateDocumentExtractionJobUseCase(
    new FakeRepository(),
    new FakeQueue(),
    storage,
    "quote-items-v1",
    1024,
  );

  await assert.rejects(
    () => useCase.execute({
      buffer: Buffer.from("pdf"),
      originalName: "quote.pdf",
      mimeType: "application/pdf",
    }, AiJobType.QUOTED_EXCEL_EXTRACTION),
    (error: unknown) => error instanceof AppError && error.code === "QUOTED_EXCEL_FILE_REQUIRED",
  );
  assert.deepEqual(storage.removed, []);
});

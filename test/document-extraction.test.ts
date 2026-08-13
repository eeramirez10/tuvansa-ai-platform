import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { EnqueueJobInput, JobQueuePort } from "../src/shared/application/ports/job-queue.port";
import { CreateDocumentExtractionJobUseCase } from "../src/modules/document-extraction/application/use-cases/create-document-extraction-job.use-case";
import { DocumentStoragePort } from "../src/modules/document-extraction/application/ports/document-storage.port";
import { StoredDocument, UploadedDocument } from "../src/modules/document-extraction/domain/document-file";
import { XlsxTextReader } from "../src/modules/document-extraction/infrastructure/files/xlsx-text-reader";
import { DocumentTextExtractorAdapter } from "../src/modules/document-extraction/infrastructure/files/document-text-extractor.adapter";
import { DocumentTypeDetector } from "../src/modules/document-extraction/infrastructure/files/document-type-detector";
import { PdfDigitalReconciliationService } from "../src/modules/document-extraction/infrastructure/files/pdf-digital-reconciliation.service";
import {
  PdfDigitalTextReader,
  PdfDigitalTextReadResult,
} from "../src/modules/document-extraction/infrastructure/files/pdf-digital-text-reader";
import { PdfOcrTextReaderPort } from "../src/modules/document-extraction/application/ports/pdf-ocr-text-reader.port";
import { AiJob, AiJobStatus, AiJobType } from "../src/modules/job-management/domain/ai-job.entity";
import { AppError } from "../src/shared/domain/app-error";
import { parseQuotedCommercialRowHints } from "../src/modules/document-extraction/infrastructure/normalization/quoted-commercial-row-hints";
import {
  AiJobRepository,
  AiRunInput,
  CreateAiJobInput,
  CreateAiJobResult,
} from "../src/modules/job-management/application/ports/ai-job.repository";

const PROMPT_VERSIONS = {
  quoteDocument: "quote-items-v1",
  quotedExcel: "quoted-excel-v5",
  supplierQuote: "supplier-quote-v4",
};

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
  public inputs: CreateAiJobInput[] = [];
  private readonly jobsByKey = new Map<string, AiJob>();
  private readonly jobsById = new Map<string, AiJob>();

  public async createOrFind(input: CreateAiJobInput): Promise<CreateAiJobResult> {
    this.inputs.push(input);
    const existing = this.jobsByKey.get(input.idempotencyKey);
    if (existing) return { job: existing, created: false };
    const job = new AiJob({
      id: `document-job-${this.jobsByKey.size + 1}`,
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
    this.jobsByKey.set(input.idempotencyKey, job);
    this.jobsById.set(job.id, job);
    return { job, created: true };
  }

  public async findById(id: string): Promise<AiJob | null> { return this.jobsById.get(id) ?? null; }
  public async markProcessing(id: string): Promise<AiJob | null> { return this.findById(id); }
  public async updateProgress(): Promise<void> {}
  public async markQueuedForRetry(): Promise<void> {}
  public async markCompleted(): Promise<void> {}
  public async markFailed(): Promise<void> {}
  public async recordRun(_input: AiRunInput): Promise<void> {}
}

class EmptyPdfTextReader extends PdfDigitalTextReader {
  constructor() {
    super(new PdfDigitalReconciliationService());
  }

  public override async read(): Promise<PdfDigitalTextReadResult> {
    return { textContent: "", extractionHints: "unused hints" };
  }
}

class FakePdfOcrTextReader extends PdfOcrTextReaderPort {
  public calls = 0;

  public async read(): Promise<string> {
    this.calls += 1;
    return "2 PZA VALVULA COMPUERTA ACERO AL CARBON DE 2 PULGADAS";
  }
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

test("builds structured PDF table hints with technical columns", () => {
  const reconciler = new PdfDigitalReconciliationService();
  const header = [
    { text: "IDENT", x: 75 },
    { text: "DESCRIPCION", x: 105 },
    { text: "DIAM1 (Pulg)", x: 358 },
    { text: "DIAM2 (Pulg)", x: 400 },
    { text: "SCH1", x: 443 },
    { text: "Unidad", x: 473 },
    { text: "Cantidad", x: 503 },
  ];
  const row = [
    { text: "2061397 Eccentric Reducer A403-WP316/316L-S -- BW -", x: 79 },
    { text: "6", x: 358 },
    { text: "4", x: 400 },
    { text: "S-10S", x: 443 },
    { text: "Pza", x: 473 },
    { text: "4", x: 524 },
  ];

  const result = reconciler.reconcilePage(
    "IDENT DESCRIPCION DIAM1 (Pulg) DIAM2 (Pulg) SCH1 Unidad Cantidad",
    [header, row],
  );

  assert.match(result, /STRUCTURED_TABLE_ROWS/);
  assert.match(result, /SOURCE_ID=2061397/);
  assert.match(result, /DESCRIPTION=Eccentric Reducer A403-WP316\/316L-S -- BW -/);
  assert.match(result, /DESCRIPTION_SUFFIX=6" X 4" CED\. 10S/);
  assert.doesNotMatch(result, /DIAMETER_1=/);
  assert.match(result, /UNIT=Pza \| QUANTITY=4/);
});

test("omits empty technical cells and accepts Metro as a structured table unit", () => {
  const reconciler = new PdfDigitalReconciliationService();
  const header = [
    { text: "IDENT", x: 75 },
    { text: "DESCRIPCION", x: 105 },
    { text: "DIAM1 (Pulg)", x: 358 },
    { text: "DIAM2 (Pulg)", x: 400 },
    { text: "SCH1", x: 443 },
    { text: "Unidad", x: 473 },
    { text: "Cantidad", x: 503 },
  ];
  const row = [
    { text: "2062604 Pipe A312-TP316/316L Smls Seamless - - - - BE", x: 79 },
    { text: "4", x: 358 },
    { text: "0", x: 400 },
    { text: "S-10S", x: 443 },
    { text: "Metro", x: 473 },
    { text: "188", x: 521 },
  ];

  const result = reconciler.reconcilePage("table", [header, row]);

  assert.match(result, /DESCRIPTION_SUFFIX=4" CED\. 10S/);
  assert.doesNotMatch(result, / X 0"/);
  assert.match(result, /UNIT=Metro \| QUANTITY=188/);
});

test("preserves mixed currencies from positioned seller quote columns", () => {
  const reconciler = new PdfDigitalReconciliationService();
  const header = [
    { text: "PART", x: 52 },
    { text: "UM", x: 104 },
    { text: "CANT", x: 130 },
    { text: "DESCRIPCIÓN", x: 223 },
    { text: "PRECIO USD", x: 323 },
    { text: "TOTAL USD", x: 368 },
    { text: "PRECIO MNX", x: 412 },
    { text: "TOTAL MNX", x: 460 },
    { text: "T.E", x: 517 },
  ];
  const usdDescription = [{ text: "BOMBA CONTRA INCENDIO", x: 180 }];
  const usdRow = [
    { text: "1", x: 69 }, { text: "PZ", x: 106 }, { text: "1.00", x: 142 },
    { text: "$", x: 325 }, { text: "18,118.07", x: 334 },
    { text: "$", x: 369 }, { text: "18,118.07", x: 378 },
    { text: "1 SEMANA", x: 510 },
  ];
  const mxnRow = [
    { text: "2", x: 69 }, { text: "TMO", x: 103 }, { text: "4.00", x: 142 },
    { text: "TUBERIA ACERO AL CARBON", x: 173 },
    { text: "$", x: 412 }, { text: "1,890.23", x: 429 },
    { text: "$", x: 460 }, { text: "7,560.92", x: 475 },
    { text: "1 SEMANA", x: 510 },
  ];
  const summary = [{ text: "SUBTOTAL", x: 308 }];

  const result = reconciler.reconcilePage("seller quote", [header, usdDescription, usdRow, mxnRow, summary]);

  assert.match(result, /QUOTED_COMMERCIAL_ROWS/);
  assert.match(result, /ROW_1: DESCRIPTION=BOMBA CONTRA INCENDIO .*UNIT_PRICE=18118\.07 .*CURRENCY=USD/);
  assert.match(result, /ROW_2: DESCRIPTION=TUBERIA ACERO AL CARBON .*UNIT_PRICE=1890\.23 .*CURRENCY=MXN/);

  assert.deepEqual(parseQuotedCommercialRowHints(result).map((row) => ({
    currency: row.currency,
    unitPrice: row.unitPrice,
    subtotal: row.subtotal,
    deliveryTime: row.deliveryTime,
  })), [
    { currency: "USD", unitPrice: 18118.07, subtotal: 18118.07, deliveryTime: "1 SEMANA" },
    { currency: "MXN", unitPrice: 1890.23, subtotal: 7560.92, deliveryTime: "1 SEMANA" },
  ]);
});

test("creates one document job and removes only the duplicate upload", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const storage = new FakeStorage();
  const useCase = new CreateDocumentExtractionJobUseCase(
    repository,
    queue,
    storage,
    PROMPT_VERSIONS,
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

test("accepts PDF files for seller quote jobs", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const storage = new FakeStorage();
  const useCase = new CreateDocumentExtractionJobUseCase(
    repository,
    queue,
    storage,
    PROMPT_VERSIONS,
    1024,
  );

  const result = await useCase.execute({
    buffer: Buffer.from("%PDF seller quote"),
    originalName: "quote.pdf",
    mimeType: "application/pdf",
  }, AiJobType.QUOTED_EXCEL_EXTRACTION);

  assert.equal(result.created, true);
  assert.equal(queue.messages.length, 1);
  assert.equal(repository.inputs[0]?.input.fileName, "quote.pdf");
  assert.equal(repository.inputs[0]?.promptVersion, "quoted-excel-v5");
  assert.deepEqual(storage.removed, []);
});

test("rejects unsupported seller quote files before storing them", async () => {
  const storage = new FakeStorage();
  const useCase = new CreateDocumentExtractionJobUseCase(
    new FakeRepository(),
    new FakeQueue(),
    storage,
    PROMPT_VERSIONS,
    1024,
  );

  await assert.rejects(
    () => useCase.execute({
      buffer: Buffer.from("document"),
      originalName: "quote.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }, AiJobType.QUOTED_EXCEL_EXTRACTION),
    (error: unknown) => error instanceof AppError && error.code === "QUOTED_EXCEL_FILE_REQUIRED",
  );
  assert.deepEqual(storage.removed, []);
});

test("reprocesses the same supplier file after its extractor version changes", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const storage = new FakeStorage();
  const file = {
    buffer: Buffer.from("same supplier quote"),
    originalName: "supplier.pdf",
    mimeType: "application/pdf",
  };
  const previous = new CreateDocumentExtractionJobUseCase(
    repository,
    queue,
    storage,
    { ...PROMPT_VERSIONS, supplierQuote: "supplier-quote-v1" },
    1024,
  );
  const current = new CreateDocumentExtractionJobUseCase(
    repository,
    queue,
    storage,
    PROMPT_VERSIONS,
    1024,
  );

  const first = await previous.execute(file, AiJobType.SUPPLIER_QUOTE_EXTRACTION);
  const reprocessed = await current.execute(file, AiJobType.SUPPLIER_QUOTE_EXTRACTION);

  assert.equal(first.created, true);
  assert.equal(reprocessed.created, true);
  assert.equal(queue.messages.length, 2);
  assert.deepEqual(repository.inputs.map((input) => input.promptVersion), [
    "supplier-quote-v1",
    "supplier-quote-v4",
  ]);
});

test("rejects scanned PDFs when OCR is disabled", async () => {
  const extractor = new DocumentTextExtractorAdapter(
    new DocumentTypeDetector(),
    new XlsxTextReader(),
    new EmptyPdfTextReader(),
  );

  await assert.rejects(
    () => extractor.extract({
      buffer: Buffer.from("%PDF scanned"),
      originalName: "scanned.pdf",
      mimeType: "application/pdf",
    }),
    (error: unknown) => error instanceof AppError && error.code === "PDF_REQUIRES_OCR",
  );
});

test("uses OCR text for scanned PDFs when OCR is enabled", async () => {
  const ocr = new FakePdfOcrTextReader();
  const extractor = new DocumentTextExtractorAdapter(
    new DocumentTypeDetector(),
    new XlsxTextReader(),
    new EmptyPdfTextReader(),
    ocr,
  );

  const result = await extractor.extract({
    buffer: Buffer.from("%PDF scanned"),
    originalName: "scanned.pdf",
    mimeType: "application/pdf",
  });

  assert.equal(ocr.calls, 1);
  assert.match(result.textContent, /VALVULA COMPUERTA/);
  assert.equal(result.extractionHints, null);
});

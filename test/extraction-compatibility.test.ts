import assert from "node:assert/strict";
import test from "node:test";
import { ProcessDocumentExtractionJobUseCase } from "../src/modules/document-extraction/application/use-cases/process-document-extraction-job.use-case";
import { DocumentStoragePort } from "../src/modules/document-extraction/application/ports/document-storage.port";
import { DocumentTextExtractorPort } from "../src/modules/document-extraction/application/ports/document-text-extractor.port";
import { QuoteTextExtractorPort } from "../src/modules/document-extraction/application/ports/quote-text-extractor.port";
import { QuotedExcelExtractorPort } from "../src/modules/document-extraction/application/ports/quoted-excel-extractor.port";
import { SupplierQuoteExtractorPort } from "../src/modules/document-extraction/application/ports/supplier-quote-extractor.port";
import { QuotedExcelItem } from "../src/modules/document-extraction/domain/quoted-excel-item.entity";
import { UnitNormalizerService } from "../src/modules/document-extraction/infrastructure/normalization/unit-normalizer.service";
import { AiJobRepository, AiRunInput, CreateAiJobInput, CreateAiJobResult } from "../src/modules/job-management/application/ports/ai-job.repository";
import { AiJob, AiJobStatus, AiJobType } from "../src/modules/job-management/domain/ai-job.entity";

const usage = { provider: "test", model: "test-model", latencyMs: 1 };

class CapturingRepository implements AiJobRepository {
  public completedResult: unknown;
  public runs: AiRunInput[] = [];

  constructor(private readonly job: AiJob) {}

  public async createOrFind(_input: CreateAiJobInput): Promise<CreateAiJobResult> {
    return { job: this.job, created: false };
  }
  public async findById(): Promise<AiJob | null> { return this.job; }
  public async markProcessing(): Promise<AiJob | null> { return this.job; }
  public async updateProgress(): Promise<void> {}
  public async markQueuedForRetry(): Promise<void> {}
  public async markCompleted(_id: string, result: unknown): Promise<void> { this.completedResult = result; }
  public async markFailed(): Promise<void> {}
  public async recordRun(input: AiRunInput): Promise<void> { this.runs.push(input); }
}

class MemoryStorage implements DocumentStoragePort {
  public removed: string[] = [];
  public async save(): Promise<never> { throw new Error("Not used."); }
  public async read(): Promise<Buffer> { return Buffer.from("document"); }
  public async remove(filePath: string): Promise<void> { this.removed.push(filePath); }
}

const documentExtractor: DocumentTextExtractorPort = {
  extract: async () => ({ textContent: "CANTIDAD | UNIDAD | DESCRIPCION", fileType: "xlsx", extractionHints: null }),
};
const unusedQuoteExtractor: QuoteTextExtractorPort = {
  extract: async () => { throw new Error("Unexpected quote extractor call."); },
};
const unusedQuotedExcelExtractor: QuotedExcelExtractorPort = {
  extract: async () => { throw new Error("Unexpected quoted Excel extractor call."); },
};
const unusedSupplierExtractor: SupplierQuoteExtractorPort = {
  extract: async () => { throw new Error("Unexpected supplier extractor call."); },
};

function job(type: AiJobType): AiJob {
  return new AiJob({
    id: `job-${type}`,
    type,
    status: AiJobStatus.PROCESSING,
    progress: 10,
    idempotencyKey: type,
    inputHash: "hash",
    input: { fileName: "quote.xlsx", filePath: "/tmp/quote.xlsx", mimeType: "application/xlsx" },
    result: null,
    errorCode: null,
    errorMessage: null,
    promptVersion: "v1",
    attempts: 1,
    createdAt: new Date("2026-08-03T00:00:00.000Z"),
    updatedAt: new Date("2026-08-03T00:00:00.000Z"),
    startedAt: new Date("2026-08-03T00:00:00.000Z"),
    completedAt: null,
  });
}

test("normalizes legacy unit abbreviations used by sales files", () => {
  const normalizer = new UnitNormalizerService();
  assert.equal(normalizer.normalize("PZAS"), "pza");
  assert.equal(normalizer.normalize("MTS"), "m");
  assert.equal(normalizer.normalize("TR"), "tramo");
  assert.equal(normalizer.detectFromDescription("10 pcs VALVE"), "pza");
});

test("processes quoted Excel with the current frontend response contract", async () => {
  const repository = new CapturingRepository(job(AiJobType.QUOTED_EXCEL_EXTRACTION));
  const storage = new MemoryStorage();
  const quotedExcelExtractor: QuotedExcelExtractorPort = {
    extract: async () => ({
      usage,
      items: [new QuotedExcelItem({
        descriptionOriginal: "Valvula compuerta 2 pulgadas",
        descriptionNormalized: "Valvula compuerta 2 pulgadas",
        quantity: 2,
        unit: "PZA",
        unitPrice: 100,
        subtotal: 200,
        currency: "MXN",
        deliveryTime: "Inmediato",
        requiresReview: false,
      })],
    }),
  };
  const useCase = new ProcessDocumentExtractionJobUseCase(
    repository,
    storage,
    documentExtractor,
    unusedQuoteExtractor,
    quotedExcelExtractor,
    unusedSupplierExtractor,
  );

  await useCase.execute("job-quoted");

  assert.deepEqual(repository.completedResult, {
    file_name: "quote.xlsx",
    file_type: "xlsx",
    import_type: "quoted_excel",
    items_count: 1,
    items: [{
      description_original: "Valvula compuerta 2 pulgadas",
      description_normalizada: "VALVULA COMPUERTA 2 PULGADAS",
      cantidad: 2,
      unidad: "PZA",
      precio_vendedor: 100,
      subtotal: 200,
      moneda: "MXN",
      tiempo_entrega: "Inmediato",
      requiere_revision: false,
    }],
  });
  assert.deepEqual(storage.removed, ["/tmp/quote.xlsx"]);
  assert.equal(repository.runs[0]?.succeeded, true);
});

test("processes supplier quote and preserves commercial validation output", async () => {
  const repository = new CapturingRepository(job(AiJobType.SUPPLIER_QUOTE_EXTRACTION));
  const storage = new MemoryStorage();
  const supplierExtractor: SupplierQuoteExtractorPort = {
    extract: async (_text, fileName) => ({
      usage,
      result: {
        fileName,
        supplier: { name: "Proveedor SA", taxId: null, state: null, country: null, contactName: null, email: null, phone: null, contacts: [], confidence: 0.9, evidence: null },
        header: { reference: "COT-1", quoteDate: null, validUntil: null, currency: "USD", exchangeRate: null, paymentTerms: null, deliveryTerms: null },
        totals: { subtotal: 100, discount: null, freight: null, otherCharges: null, taxIncluded: false, taxRate: 16, tax: 16, total: 116 },
        items: [],
        warnings: ["No se identificaron partidas de proveedor."],
        requiresReview: true,
      },
    }),
  };
  const useCase = new ProcessDocumentExtractionJobUseCase(
    repository,
    storage,
    documentExtractor,
    unusedQuoteExtractor,
    unusedQuotedExcelExtractor,
    supplierExtractor,
  );

  await useCase.execute("job-supplier");

  assert.equal((repository.completedResult as { fileName: string }).fileName, "quote.xlsx");
  assert.equal((repository.completedResult as { requiresReview: boolean }).requiresReview, true);
  assert.deepEqual(storage.removed, ["/tmp/quote.xlsx"]);
});

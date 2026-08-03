import { AppError } from "../../../../shared/domain/app-error";
import { AiJobRepository } from "../../../job-management/application/ports/ai-job.repository";
import { AiJobType } from "../../../job-management/domain/ai-job.entity";
import { StoredDocument } from "../../domain/document-file";
import { DocumentStoragePort } from "../ports/document-storage.port";
import { DocumentTextExtractorPort } from "../ports/document-text-extractor.port";
import { AiUsage, QuoteTextExtractorPort } from "../ports/quote-text-extractor.port";
import { QuotedExcelExtractorPort } from "../ports/quoted-excel-extractor.port";
import { SupplierQuoteExtractorPort } from "../ports/supplier-quote-extractor.port";

interface ProcessedDocument {
  result: unknown;
  usage: AiUsage;
}

export class ProcessDocumentExtractionJobUseCase {
  constructor(
    private readonly repository: AiJobRepository,
    private readonly storage: DocumentStoragePort,
    private readonly documentExtractor: DocumentTextExtractorPort,
    private readonly quoteExtractor: QuoteTextExtractorPort,
    private readonly quotedExcelExtractor: QuotedExcelExtractorPort,
    private readonly supplierQuoteExtractor: SupplierQuoteExtractorPort,
  ) {}

  public async execute(jobId: string): Promise<void> {
    const job = await this.repository.markProcessing(jobId, 10);
    if (!job) return;
    if (!this.isDocumentJob(job.type)) {
      throw new AppError(`Unsupported job type: ${job.type}`, 400, "UNSUPPORTED_JOB_TYPE");
    }

    const input = this.parseInput(job.input);
    const startedAt = Date.now();

    try {
      const buffer = await this.storage.read(input.filePath);
      await this.repository.updateProgress(jobId, 30);
      const documentText = await this.documentExtractor.extract({
        buffer,
        originalName: input.fileName,
        mimeType: input.mimeType,
      });
      await this.repository.updateProgress(jobId, 55);

      const promptText = documentText.extractionHints
        ? `${documentText.textContent}\n\nEXTRACTION_HINTS\n${documentText.extractionHints}`
        : documentText.textContent;
      const extraction = await this.extractByType(job.type, promptText, input, documentText.fileType);
      await this.repository.updateProgress(jobId, 90);

      await this.repository.recordRun({
        jobId,
        attempt: job.attempts,
        provider: extraction.usage.provider,
        model: extraction.usage.model,
        promptVersion: job.promptVersion ?? undefined,
        inputTokens: extraction.usage.inputTokens,
        outputTokens: extraction.usage.outputTokens,
        latencyMs: extraction.usage.latencyMs,
        succeeded: true,
      });
      await this.repository.markCompleted(jobId, extraction.result);
      await this.storage.remove(input.filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown document extraction error.";
      await this.repository.recordRun({
        jobId,
        attempt: job.attempts,
        provider: "openai",
        model: "unknown",
        promptVersion: job.promptVersion ?? undefined,
        latencyMs: Date.now() - startedAt,
        succeeded: false,
        errorCode: error instanceof AppError ? error.code : this.errorCode(job.type),
        errorMessage: message,
      });
      throw error;
    }
  }

  private async extractByType(
    type: AiJobType,
    text: string,
    input: StoredDocument,
    fileType: string,
  ): Promise<ProcessedDocument> {
    if (type === AiJobType.QUOTED_EXCEL_EXTRACTION) {
      const extraction = await this.quotedExcelExtractor.extract(text);
      return {
        result: {
          file_name: input.fileName,
          file_type: "xlsx",
          import_type: "quoted_excel",
          items_count: extraction.items.length,
          items: extraction.items.map((item) => item.toPrimitives()),
        },
        usage: extraction.usage,
      };
    }

    if (type === AiJobType.SUPPLIER_QUOTE_EXTRACTION) {
      const extraction = await this.supplierQuoteExtractor.extract(text, input.fileName);
      return { result: extraction.result, usage: extraction.usage };
    }

    const extraction = await this.quoteExtractor.extract(text);
    return {
      result: {
        file_name: input.fileName,
        file_type: fileType,
        items_count: extraction.items.length,
        items: extraction.items.map((item) => item.toPrimitives()),
      },
      usage: extraction.usage,
    };
  }

  private isDocumentJob(type: AiJobType): boolean {
    return [
      AiJobType.QUOTE_DOCUMENT_EXTRACTION,
      AiJobType.QUOTED_EXCEL_EXTRACTION,
      AiJobType.SUPPLIER_QUOTE_EXTRACTION,
    ].includes(type);
  }

  private errorCode(type: AiJobType): string {
    if (type === AiJobType.QUOTED_EXCEL_EXTRACTION) return "QUOTED_EXCEL_EXTRACTION_FAILED";
    if (type === AiJobType.SUPPLIER_QUOTE_EXTRACTION) return "SUPPLIER_QUOTE_EXTRACTION_FAILED";
    return "QUOTE_DOCUMENT_EXTRACTION_FAILED";
  }

  public getStoredFile(input: unknown): StoredDocument | null {
    try {
      return this.parseInput(input);
    } catch {
      return null;
    }
  }

  private parseInput(input: unknown): StoredDocument {
    if (!input || typeof input !== "object") throw new Error("Invalid document job input.");
    const raw = input as Record<string, unknown>;
    if (
      typeof raw.fileName !== "string" ||
      typeof raw.filePath !== "string" ||
      typeof raw.mimeType !== "string"
    ) {
      throw new Error("Document job input is incomplete.");
    }
    return { fileName: raw.fileName, filePath: raw.filePath, mimeType: raw.mimeType };
  }
}

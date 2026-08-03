import { AppError } from "../../../../shared/domain/app-error";
import { AiJobRepository } from "../../../job-management/application/ports/ai-job.repository";
import { AiJobType } from "../../../job-management/domain/ai-job.entity";
import { StoredDocument } from "../../domain/document-file";
import { DocumentStoragePort } from "../ports/document-storage.port";
import { DocumentTextExtractorPort } from "../ports/document-text-extractor.port";
import { QuoteTextExtractorPort } from "../ports/quote-text-extractor.port";

export class ProcessDocumentExtractionJobUseCase {
  constructor(
    private readonly repository: AiJobRepository,
    private readonly storage: DocumentStoragePort,
    private readonly documentExtractor: DocumentTextExtractorPort,
    private readonly quoteExtractor: QuoteTextExtractorPort,
  ) {}

  public async execute(jobId: string): Promise<void> {
    const job = await this.repository.markProcessing(jobId, 10);
    if (!job) return;
    if (job.type !== AiJobType.QUOTE_DOCUMENT_EXTRACTION) {
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
      const extraction = await this.quoteExtractor.extract(promptText);
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
      await this.repository.markCompleted(jobId, {
        file_name: input.fileName,
        file_type: documentText.fileType,
        items: extraction.items.map((item) => item.toPrimitives()),
      });
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
        errorCode: error instanceof AppError ? error.code : "QUOTE_DOCUMENT_EXTRACTION_FAILED",
        errorMessage: message,
      });
      throw error;
    }
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

import { createHash } from "node:crypto";
import path from "node:path";
import { JobQueuePort } from "../../../../shared/application/ports/job-queue.port";
import { AppError } from "../../../../shared/domain/app-error";
import { AiJobRepository } from "../../../job-management/application/ports/ai-job.repository";
import { AiJobType } from "../../../job-management/domain/ai-job.entity";
import { UploadedDocument } from "../../domain/document-file";
import { DocumentStoragePort } from "../ports/document-storage.port";

export interface DocumentExtractionPromptVersions {
  quoteDocument: string;
  quotedExcel: string;
  supplierQuote: string;
}

export class CreateDocumentExtractionJobUseCase {
  constructor(
    private readonly repository: AiJobRepository,
    private readonly queue: JobQueuePort,
    private readonly storage: DocumentStoragePort,
    private readonly promptVersions: DocumentExtractionPromptVersions,
    private readonly maxFileSizeBytes: number,
  ) {}

  public async execute(
    file: UploadedDocument,
    jobType: AiJobType = AiJobType.QUOTE_DOCUMENT_EXTRACTION,
  ) {
    this.validate(file, jobType);
    const promptVersion = this.promptVersionFor(jobType);
    const inputHash = createHash("sha256").update(file.buffer).digest("hex");
    const idempotencyKey = [jobType, promptVersion, inputHash].join(":");
    const stored = await this.storage.save(file);

    try {
      const creation = await this.repository.createOrFind({
        type: jobType,
        idempotencyKey,
        inputHash,
        input: stored,
        promptVersion,
      });

      if (!creation.created) {
        await this.storage.remove(stored.filePath);
        return creation;
      }

      try {
        await this.queue.enqueue({ jobId: creation.job.id, type: creation.job.type });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Queue unavailable.";
        await this.repository.markFailed(creation.job.id, "QUEUE_UNAVAILABLE", message);
        await this.storage.remove(stored.filePath);
        throw new AppError("The job could not be queued.", 503, "QUEUE_UNAVAILABLE");
      }

      return creation;
    } catch (error) {
      await this.storage.remove(stored.filePath).catch(() => undefined);
      throw error;
    }
  }

  private promptVersionFor(jobType: AiJobType): string {
    if (jobType === AiJobType.QUOTED_EXCEL_EXTRACTION) return this.promptVersions.quotedExcel;
    if (jobType === AiJobType.SUPPLIER_QUOTE_EXTRACTION) return this.promptVersions.supplierQuote;
    return this.promptVersions.quoteDocument;
  }

  private validate(file: UploadedDocument, jobType: AiJobType): void {
    if (!file.buffer.length) throw new AppError("File is required.", 400, "FILE_REQUIRED");
    if (file.buffer.length > this.maxFileSizeBytes) {
      throw new AppError("File exceeds the configured size limit.", 413, "FILE_TOO_LARGE");
    }
    const extension = path.extname(file.originalName).toLowerCase();
    if (jobType === AiJobType.QUOTED_EXCEL_EXTRACTION && ![".xlsx", ".xls"].includes(extension)) {
      throw new AppError(
        "La cotizacion importada debe ser un archivo XLSX o XLS.",
        400,
        "QUOTED_EXCEL_FILE_REQUIRED",
      );
    }
    if (![".pdf", ".xlsx", ".xls"].includes(extension)) {
      throw new AppError("Unsupported file. Use PDF, XLSX or XLS.", 400, "UNSUPPORTED_DOCUMENT_TYPE");
    }
  }
}

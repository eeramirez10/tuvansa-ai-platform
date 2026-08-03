import path from "node:path";
import { AppError } from "../../../../shared/domain/app-error";
import { SupportedDocumentType } from "../../domain/document-file";

export class DocumentTypeDetector {
  public detect(originalName: string, mimeType: string): SupportedDocumentType {
    const extension = path.extname(originalName).toLowerCase();
    const normalizedMimeType = mimeType.toLowerCase();

    if (
      extension === ".xlsx" ||
      extension === ".xls" ||
      normalizedMimeType.includes("spreadsheetml") ||
      normalizedMimeType.includes("excel")
    ) {
      return SupportedDocumentType.XLSX;
    }

    if (extension === ".pdf" || normalizedMimeType.includes("pdf")) {
      return SupportedDocumentType.PDF_DIGITAL;
    }

    throw new AppError(
      "Unsupported file. Use XLSX, XLS or a digital PDF.",
      400,
      "UNSUPPORTED_DOCUMENT_TYPE",
    );
  }
}

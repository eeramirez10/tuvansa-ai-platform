export enum SupportedDocumentType {
  XLSX = "xlsx",
  PDF_DIGITAL = "pdf_digital",
}

export interface UploadedDocument {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

export interface StoredDocument {
  fileName: string;
  filePath: string;
  mimeType: string;
}

export interface ExtractedDocumentText {
  textContent: string;
  fileType: SupportedDocumentType;
  extractionHints: string | null;
}

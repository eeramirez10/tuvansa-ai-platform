import { ExtractedDocumentText, UploadedDocument } from "../../domain/document-file";

export interface DocumentTextExtractorPort {
  extract(file: UploadedDocument): Promise<ExtractedDocumentText>;
}

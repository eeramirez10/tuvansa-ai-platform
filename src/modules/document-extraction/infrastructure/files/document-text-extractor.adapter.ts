import { AppError } from "../../../../shared/domain/app-error";
import { DocumentTextExtractorPort } from "../../application/ports/document-text-extractor.port";
import {
  ExtractedDocumentText,
  SupportedDocumentType,
  UploadedDocument,
} from "../../domain/document-file";
import { DocumentTypeDetector } from "./document-type-detector";
import { PdfDigitalTextReader } from "./pdf-digital-text-reader";
import { XlsxTextReader } from "./xlsx-text-reader";

export class DocumentTextExtractorAdapter implements DocumentTextExtractorPort {
  constructor(
    private readonly detector: DocumentTypeDetector,
    private readonly xlsxReader: XlsxTextReader,
    private readonly pdfReader: PdfDigitalTextReader,
  ) {}

  public async extract(file: UploadedDocument): Promise<ExtractedDocumentText> {
    const fileType = this.detector.detect(file.originalName, file.mimeType);
    let textContent = "";
    let extractionHints: string | null = null;

    if (fileType === SupportedDocumentType.XLSX) {
      textContent = this.xlsxReader.read(file.buffer);
    } else {
      const pdf = await this.pdfReader.read(file.buffer);
      textContent = pdf.textContent;
      extractionHints = pdf.extractionHints;
      if (this.isMissingSearchableText(textContent)) {
        throw new AppError(
          "Este PDF no contiene texto legible. Aplica OCR con Acrobat Pro y vuelve a subirlo.",
          422,
          "PDF_REQUIRES_OCR",
        );
      }
    }

    if (textContent.trim().length < 8) {
      throw new AppError(
        "No se pudo extraer texto util del archivo. Verifica que tenga contenido legible.",
        422,
        "DOCUMENT_TEXT_NOT_FOUND",
      );
    }

    return { textContent: textContent.trim(), fileType, extractionHints };
  }

  private isMissingSearchableText(textContent: string): boolean {
    const compact = textContent.replace(/\s+/g, " ").trim();
    if (compact.length < 24) return true;
    const readableCharacters = compact.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
    const readableRatio = readableCharacters / compact.length;
    return readableRatio < 0.35 || compact.split(" ").filter(Boolean).length < 5;
  }
}

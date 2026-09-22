import { AppError } from "../../../../shared/domain/app-error";
import type { DocumentTextExtractorPort } from "../../../document-extraction/application/ports/document-text-extractor.port";
import type { UploadedDocument } from "../../../document-extraction/domain/document-file";
import type { StructuredAiProcessorPort } from "../ports/structured-ai-processor.port";

export class ExtractCustomerTaxDocumentUseCase {
  constructor(
    private readonly documentExtractor: DocumentTextExtractorPort,
    private readonly partyDataProcessor: StructuredAiProcessorPort,
  ) {}

  async execute(file: UploadedDocument): Promise<unknown> {
    if (file.mimeType !== "application/pdf" && !file.originalName.toLowerCase().endsWith(".pdf")) {
      throw new AppError("La Constancia de Situación Fiscal debe enviarse en PDF.", 400, "TAX_DOCUMENT_MUST_BE_PDF");
    }
    const document = await this.documentExtractor.extract(file);
    const context = [
      "Documento: Constancia de Situación Fiscal emitida por el SAT.",
      "Prioriza la denominación o razón social exacta, RFC, régimen fiscal, código postal y domicilio fiscal.",
      "No confundas la fecha de emisión, identificadores de la constancia o actividades económicas con datos del cliente.",
      document.textContent,
    ].join("\n\n");
    const extraction = await this.partyDataProcessor.process({ partyType: "CUSTOMER", text: context });
    return extraction.result;
  }
}

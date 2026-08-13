import OpenAI from "openai";
import { PdfOcrTextReaderPort } from "../application/ports/pdf-ocr-text-reader.port";

export class OpenAiPdfOcrTextReaderAdapter extends PdfOcrTextReaderPort {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    client?: OpenAI,
  ) {
    super();
    this.client = client ?? new OpenAI({ apiKey });
  }

  public async read(buffer: Buffer): Promise<string> {
    const response = await this.client.responses.create({
      model: this.model,
      max_output_tokens: 12_000,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: this.prompt() },
            {
              type: "input_file",
              filename: "quote.pdf",
              file_data: this.toPdfDataUrl(buffer),
            },
          ],
        },
      ],
    });

    return response.output_text?.trim() ?? "";
  }

  private toPdfDataUrl(buffer: Buffer): string {
    if (buffer.length === 0) throw new Error("No se puede procesar un PDF vacio mediante OCR.");
    return `data:application/pdf;base64,${buffer.toString("base64")}`;
  }

  private prompt(): string {
    return `Extrae todo el texto legible del PDF adjunto mediante OCR y devuelvelo como texto plano.
Reglas:
- No resumas.
- No traduzcas.
- No inventes contenido.
- Mantener el orden de lectura del documento.
- Responde solo con el texto extraido.`;
  }
}

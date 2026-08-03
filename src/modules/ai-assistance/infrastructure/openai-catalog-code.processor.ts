import OpenAI from "openai";
import { StructuredAiProcessorPort } from "../application/ports/structured-ai-processor.port";
import { CatalogCodeRequestDto } from "../domain/catalog-code-request.dto";

export class OpenAiCatalogCodeProcessor implements StructuredAiProcessorPort {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new OpenAI({ apiKey });
  }

  public async process(value: unknown) {
    const input = CatalogCodeRequestDto.create(value).toJobInput();
    const startedAt = Date.now();
    const completion = await this.client.chat.completions.create({
      model: this.model,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "quote_catalog_code",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["code"],
            properties: { code: { type: "string" } },
          },
        },
      },
      messages: [
        {
          role: "system",
          content: [
            "Generate one stable internal code for a quotation catalog option.",
            "Translate the business meaning to concise English and use UPPER_SNAKE_CASE.",
            "Use only A-Z, 0-9 and underscores, with at most 80 characters.",
            "Follow the vocabulary and style of the existing codes, but never repeat one.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            catalogType: input.type,
            visibleLabelInSpanish: input.label,
            existingCodes: input.existingCodes,
          }),
        },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("La IA no devolvio un codigo interno.");
    const parsed = JSON.parse(content) as { code?: unknown };
    const rawCode = typeof parsed.code === "string" ? parsed.code : "";
    const normalized = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "").slice(0, 80);
    if (!normalized) throw new Error("La IA no pudo generar un codigo valido.");
    const existing = new Set(input.existingCodes.map((code) => code.toUpperCase()));
    const code = this.uniqueCode(normalized, existing);
    return {
      result: { code },
      usage: {
        provider: "openai",
        model: this.model,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  private uniqueCode(normalized: string, existing: Set<string>): string {
    if (!existing.has(normalized)) return normalized;
    for (let suffix = 2; suffix <= 999; suffix += 1) {
      const suffixText = `_${suffix}`;
      const candidate = `${normalized.slice(0, 80 - suffixText.length)}${suffixText}`;
      if (!existing.has(candidate)) return candidate;
    }
    throw new Error("No se pudo generar un codigo interno unico.");
  }
}

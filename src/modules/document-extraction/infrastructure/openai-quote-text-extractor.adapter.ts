import OpenAI from "openai";
import {
  QuoteTextExtraction,
  QuoteTextExtractorPort,
} from "../application/ports/quote-text-extractor.port";
import {
  CanonicalUnit,
  DetectedLanguage,
  QuoteItem,
} from "../domain/quote-item.entity";
import { LanguageDetectorService } from "./normalization/language-detector.service";
import { QuantityNormalizerService } from "./normalization/quantity-normalizer.service";
import { UnitNormalizerService } from "./normalization/unit-normalizer.service";

const ALLOWED_UNITS = new Set<CanonicalUnit>(["kg", "m", "ft", "pza", "tramo", "se"]);
const ALLOWED_LANGUAGES = new Set<DetectedLanguage>(["es", "en", "mixed"]);

export class OpenAiQuoteTextExtractorAdapter implements QuoteTextExtractorPort {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly unitNormalizer = new UnitNormalizerService(),
    private readonly quantityNormalizer = new QuantityNormalizerService(),
    private readonly languageDetector = new LanguageDetectorService(),
  ) {
    this.client = new OpenAI({ apiKey });
  }

  public async extract(text: string): Promise<QuoteTextExtraction> {
    const startedAt = Date.now();
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: this.systemPrompt() },
        { role: "user", content: `Extract quote items from this content:\n\n${text}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "quote_items",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["items"],
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "description_original",
                    "description_normalizada",
                    "cantidad",
                    "unidad_original",
                    "unidad_normalizada",
                    "idioma",
                    "requiere_revision"
                  ],
                  properties: {
                    description_original: { type: "string" },
                    description_normalizada: { type: "string" },
                    cantidad: { type: ["number", "null"] },
                    unidad_original: { type: ["string", "null"] },
                    unidad_normalizada: {
                      type: ["string", "null"],
                      enum: ["kg", "m", "ft", "pza", "tramo", "se", null]
                    },
                    idioma: { type: "string", enum: ["es", "en", "mixed"] },
                    requiere_revision: { type: "boolean" }
                  }
                }
              }
            }
          }
        }
      }
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("The model returned no content.");
    const parsed = JSON.parse(content) as unknown;

    return {
      items: this.parseItems(parsed),
      usage: {
        provider: "openai",
        model: this.model,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  private parseItems(value: unknown): QuoteItem[] {
    if (!value || typeof value !== "object") throw new Error("Invalid model response.");
    const items = (value as Record<string, unknown>).items;
    if (!Array.isArray(items)) throw new Error("Model response does not contain items.");

    return items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const raw = item as Record<string, unknown>;
      const descriptionOriginal = this.text(raw.description_original);
      if (!descriptionOriginal) return [];
      const descriptionNormalized = this.text(raw.description_normalizada) || descriptionOriginal;
      const quantity = this.quantityNormalizer.normalize(raw.cantidad);
      const originalUnit = this.text(raw.unidad_original) || null;
      const modelUnit = ALLOWED_UNITS.has(raw.unidad_normalizada as CanonicalUnit)
        ? raw.unidad_normalizada as CanonicalUnit
        : null;
      const normalizedUnit = modelUnit ??
        this.unitNormalizer.normalize(originalUnit) ??
        this.unitNormalizer.detectFromDescription(descriptionOriginal);
      const language = ALLOWED_LANGUAGES.has(raw.idioma as DetectedLanguage)
        ? raw.idioma as DetectedLanguage
        : this.languageDetector.detect(`${descriptionOriginal} ${descriptionNormalized}`);

      return [new QuoteItem({
        descriptionOriginal,
        descriptionNormalized,
        quantity,
        originalUnit,
        normalizedUnit,
        language,
        requiresReview: quantity === null || normalizedUnit === null,
      })];
    });
  }

  private text(value: unknown): string {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  private systemPrompt(): string {
    return [
      "You extract industrial quotation line items.",
      "Return only data matching the requested JSON schema.",
      "Preserve description_original and create a clean description_normalizada.",
      "Ignore headers, commercial conditions, prices, taxes, totals, signatures and non-product text.",
      "Do not invent quantity or unit.",
      "Keep the source order.",
      "When EXTRACTION_HINTS are present, use them only to reconcile long descriptions with quantity and unit lines.",
      "Use requiere_revision=true when quantity or normalized unit is missing."
    ].join("\n");
  }
}

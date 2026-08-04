import OpenAI from "openai";
import { QuantityNormalizerService } from "../../document-extraction/infrastructure/normalization/quantity-normalizer.service";
import { UnitNormalizerService } from "../../document-extraction/infrastructure/normalization/unit-normalizer.service";
import { CanonicalUnit, ERP_MEASUREMENT_UNITS } from "../../document-extraction/domain/quote-item.entity";
import { StructuredAiProcessorPort } from "../application/ports/structured-ai-processor.port";
import {
  MissingProductNormalizationInput,
  MissingProductsRequestDto,
} from "../domain/missing-products-request.dto";

type OutputUnit = CanonicalUnit | null;

interface NormalizedMissingProduct {
  item_id: string;
  description_original: string;
  description_normalized: string;
  quantity: number | null;
  unit_original: string | null;
  unit_normalized: OutputUnit;
  ean_suggested: string | null;
  confidence: number;
  requires_review: boolean;
}

interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

const MAX_BATCH_SIZE = 20;

export class OpenAiMissingProductsProcessor implements StructuredAiProcessorPort {
  private readonly client: OpenAI;
  private readonly unitNormalizer = new UnitNormalizerService();
  private readonly quantityNormalizer = new QuantityNormalizerService();

  constructor(apiKey: string, private readonly model: string) {
    this.client = new OpenAI({ apiKey });
  }

  public async process(value: unknown) {
    const items = MissingProductsRequestDto.create(value).toJobInput().items;
    const normalized: NormalizedMissingProduct[] = [];
    const usage: UsageTotals = { inputTokens: 0, outputTokens: 0, latencyMs: 0 };

    for (let index = 0; index < items.length; index += MAX_BATCH_SIZE) {
      const result = await this.normalizeChunk(items.slice(index, index + MAX_BATCH_SIZE));
      normalized.push(...result.items);
      usage.inputTokens += result.inputTokens;
      usage.outputTokens += result.outputTokens;
      usage.latencyMs += result.latencyMs;
    }

    return {
      result: { items_count: normalized.length, items: normalized },
      usage: {
        provider: "openai",
        model: this.model,
        inputTokens: usage.inputTokens || undefined,
        outputTokens: usage.outputTokens || undefined,
        latencyMs: usage.latencyMs,
      },
    };
  }

  private async normalizeChunk(input: MissingProductNormalizationInput[]) {
    const startedAt = Date.now();
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: this.systemPrompt() },
        { role: "user", content: this.userPrompt(input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "normalized_missing_products",
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
                    "item_id", "description_original", "description_normalized", "quantity",
                    "unit_original", "unit_normalized", "ean_suggested", "confidence", "requires_review",
                  ],
                  properties: {
                    item_id: { type: "string" },
                    description_original: { type: "string" },
                    description_normalized: { type: "string" },
                    quantity: { type: ["number", "null"] },
                    unit_original: { type: ["string", "null"] },
                    unit_normalized: {
                      type: ["string", "null"],
                      enum: [...ERP_MEASUREMENT_UNITS, null],
                    },
                    ean_suggested: { type: ["string", "null"] },
                    confidence: { type: "number" },
                    requires_review: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return {
        items: input.map((item) => this.fallback(item)),
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        latencyMs: Date.now() - startedAt,
      };
    }
    const parsed = JSON.parse(content) as { items?: unknown };
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const byId = new Map<string, Record<string, unknown>>();
    rawItems.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const raw = item as Record<string, unknown>;
      if (typeof raw.item_id === "string" && raw.item_id.trim()) byId.set(raw.item_id.trim(), raw);
    });
    return {
      items: input.map((item, index) => {
        const positional = rawItems[index];
        const raw = byId.get(item.itemId) ??
          (positional && typeof positional === "object" ? positional as Record<string, unknown> : null);
        return raw ? this.normalizeItem(item, raw) : this.fallback(item);
      }),
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - startedAt,
    };
  }

  private normalizeItem(
    input: MissingProductNormalizationInput,
    raw: Record<string, unknown>,
  ): NormalizedMissingProduct {
    const descriptionOriginal = this.compact(raw.description_original) || this.compact(input.description);
    const descriptionNormalized = (this.compact(raw.description_normalized) || descriptionOriginal).toLowerCase();
    const quantity = this.quantityNormalizer.normalize(raw.quantity ?? input.quantity);
    const originalUnit = this.compact(raw.unit_original) || this.compact(input.unit) || null;
    const normalizedUnit =
      this.unitNormalizer.normalize(raw.unit_normalized) ??
      this.unitNormalizer.normalize(originalUnit) ??
      this.unitNormalizer.detectFromDescription(descriptionNormalized);
    const confidence = this.confidence(raw.confidence, quantity, normalizedUnit);
    const eanSuggested = this.ean(raw.ean_suggested);
    return {
      item_id: input.itemId,
      description_original: descriptionOriginal,
      description_normalized: descriptionNormalized,
      quantity,
      unit_original: originalUnit,
      unit_normalized: normalizedUnit,
      ean_suggested: eanSuggested,
      confidence,
      requires_review: raw.requires_review === true || quantity === null || normalizedUnit === null || confidence < 0.6,
    };
  }

  private fallback(input: MissingProductNormalizationInput): NormalizedMissingProduct {
    const descriptionOriginal = this.compact(input.description);
    const descriptionNormalized = descriptionOriginal.toLowerCase();
    const quantity = this.quantityNormalizer.normalize(input.quantity);
    const normalizedUnit = this.unitNormalizer.normalize(input.unit) ??
      this.unitNormalizer.detectFromDescription(descriptionNormalized);
    const requiresReview = quantity === null || normalizedUnit === null;
    return {
      item_id: input.itemId,
      description_original: descriptionOriginal,
      description_normalized: descriptionNormalized,
      quantity,
      unit_original: this.compact(input.unit) || null,
      unit_normalized: normalizedUnit,
      ean_suggested: null,
      confidence: requiresReview ? 0.45 : 0.8,
      requires_review: requiresReview,
    };
  }

  private compact(value: unknown): string {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  private confidence(value: unknown, quantity: number | null, unit: OutputUnit): number {
    const parsed = typeof value === "number" && Number.isFinite(value)
      ? value
      : quantity !== null && unit !== null ? 0.82 : 0.55;
    return Number(Math.min(1, Math.max(0, parsed)).toFixed(3));
  }

  private ean(value: unknown): string | null {
    const normalized = this.compact(value).toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9-]/g, "");
    return normalized.length >= 3 ? normalized : null;
  }

  private systemPrompt(): string {
    return [
      "Eres un normalizador de productos industriales para cotizaciones.",
      "Estandariza partidas faltantes del ERP para productos temporales locales.",
      "No inventes marca, modelo, medidas ni EAN.",
      "Mantener item_id exactamente igual y conservar el orden.",
      "Unidades permitidas: PZ, K, M, L, TR, SE, ACT, FT, XRO, UNO, M2, LOT, CON o null.",
      "description_normalized debe ser limpia y apta para busqueda semantica.",
      "Si quantity o unit no son confiables usa null y requires_review=true.",
      "confidence debe estar entre 0 y 1.",
    ].join("\n");
  }

  private userPrompt(items: MissingProductNormalizationInput[]): string {
    return `Normaliza este lote para alta LOCAL_TEMP:\n${JSON.stringify(items)}`;
  }
}

import OpenAI from "openai";
import { QuotedExcelExtractorPort } from "../application/ports/quoted-excel-extractor.port";
import {
  QuoteCurrency,
  getQuotedExcelReviewReasons,
  QuotedExcelItem,
} from "../domain/quoted-excel-item.entity";
import { UnitNormalizerService } from "./normalization/unit-normalizer.service";

export class OpenAiQuotedExcelExtractorAdapter implements QuotedExcelExtractorPort {
  private readonly client: OpenAI;
  private readonly unitNormalizer = new UnitNormalizerService();

  constructor(apiKey: string, private readonly model: string) {
    this.client = new OpenAI({ apiKey });
  }

  public async extract(text: string) {
    const startedAt = Date.now();
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: this.systemPrompt() },
        { role: "user", content: `Extrae unicamente las partidas ya cotizadas de este Excel:\n\n${text}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "quoted_excel_items",
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
                    "unidad",
                    "precio_vendedor",
                    "subtotal",
                    "moneda",
                    "tiempo_entrega",
                    "requiere_revision",
                  ],
                  properties: {
                    description_original: { type: "string" },
                    description_normalizada: { type: "string" },
                    cantidad: { type: ["number", "null"] },
                    unidad: { type: ["string", "null"] },
                    precio_vendedor: { type: ["number", "null"] },
                    subtotal: { type: ["number", "null"] },
                    moneda: { type: ["string", "null"], enum: ["MXN", "USD", null] },
                    tiempo_entrega: { type: ["string", "null"] },
                    requiere_revision: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("El modelo no devolvio partidas del Excel.");
    const parsed = JSON.parse(content) as unknown;
    const items = this.parseItems(parsed);
    if (items.length === 0) throw new Error("No se encontraron partidas cotizadas en el Excel.");

    return {
      items,
      usage: {
        provider: "openai",
        model: this.model,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  private parseItems(value: unknown): QuotedExcelItem[] {
    if (!value || typeof value !== "object") throw new Error("Respuesta invalida del modelo.");
    const rawItems = (value as Record<string, unknown>).items;
    if (!Array.isArray(rawItems)) throw new Error("La respuesta no contiene partidas.");

    return rawItems.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const raw = value as Record<string, unknown>;
      const descriptionOriginal = this.text(raw.description_original);
      if (!descriptionOriginal) return [];

      const descriptionNormalized = this.text(raw.description_normalizada) || descriptionOriginal;
      const quantity = this.number(raw.cantidad);
      const unitPrice = this.number(raw.precio_vendedor);
      const sourceSubtotal = this.number(raw.subtotal);
      const calculatedSubtotal = quantity !== null && unitPrice !== null
        ? this.round4(quantity * unitPrice)
        : null;
      const subtotal = sourceSubtotal ?? calculatedSubtotal;
      const originalUnit = this.text(raw.unidad) || null;
      const normalizedUnit = this.unitNormalizer.normalize(originalUnit);
      const unit = normalizedUnit ?? originalUnit;
      const currency = this.currency(raw.moneda);
      const deliveryTime = this.text(raw.tiempo_entrega) || null;
      const reviewReasons = getQuotedExcelReviewReasons({
        description: descriptionNormalized,
        quantity,
        originalUnit,
        normalizedUnit,
        unitPrice,
        subtotal,
        currency,
        deliveryTime,
      });

      return [new QuotedExcelItem({
        descriptionOriginal,
        descriptionNormalized,
        quantity,
        unit,
        unitPrice,
        subtotal,
        currency,
        deliveryTime,
        requiresReview: reviewReasons.length > 0,
        reviewReasons,
      })];
    });
  }

  private text(value: unknown): string {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  private number(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return this.round4(value);
  }

  private currency(value: unknown): QuoteCurrency | null {
    return value === "MXN" || value === "USD" ? value : null;
  }

  private round4(value: number): number {
    return Number(value.toFixed(4));
  }

  private systemPrompt(): string {
    return [
      "Eres un extractor de partidas de cotizaciones industriales ya terminadas en Excel.",
      "Extrae exclusivamente filas de productos y conserva su orden.",
      "Ignora numero de partida, encabezados, cliente, folio, impuestos, totales, notas y firmas.",
      "description_normalizada debe estar limpia y en mayusculas.",
      "precio_vendedor es el precio unitario y subtotal es el total de la fila.",
      "moneda corresponde a cada partida: dolares es USD y pesos/MXN/M.N. es MXN.",
      "Normaliza la unidad cuando sea evidente usando PZ, K, M, ML, L, TR, SE, ACT, FT, XRO, UNO, M2, LOT o CON; ML significa metro lineal.",
      "No inventes valores y marca requiere_revision si falta cualquier dato comercial o el subtotal no corresponde.",
    ].join("\n");
  }
}

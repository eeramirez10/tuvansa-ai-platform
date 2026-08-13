import OpenAI from "openai";
import { QuotedExcelExtractorPort } from "../application/ports/quoted-excel-extractor.port";
import {
  QuoteCurrency,
  getQuotedExcelReviewReasons,
  QuotedExcelItem,
} from "../domain/quoted-excel-item.entity";
import { UnitNormalizerService } from "./normalization/unit-normalizer.service";
import { parseQuotedCommercialRowHints } from "./normalization/quoted-commercial-row-hints";

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
        { role: "user", content: `Extrae unicamente las partidas ya cotizadas de este documento:\n\n${text}` },
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
    if (!content) throw new Error("El modelo no devolvio partidas del documento.");
    const parsed = JSON.parse(content) as unknown;
    const items = this.parseItems(parsed, text);
    if (items.length === 0) throw new Error("No se encontraron partidas cotizadas en el documento.");

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

  private parseItems(value: unknown, sourceText: string): QuotedExcelItem[] {
    if (!value || typeof value !== "object") throw new Error("Respuesta invalida del modelo.");
    const rawItems = (value as Record<string, unknown>).items;
    if (!Array.isArray(rawItems)) throw new Error("La respuesta no contiene partidas.");
    const commercialHints = parseQuotedCommercialRowHints(sourceText);
    const useCommercialHints = commercialHints.length === rawItems.length;

    return rawItems.flatMap((value, index) => {
      if (!value || typeof value !== "object") return [];
      const raw = value as Record<string, unknown>;
      const commercialHint = useCommercialHints ? commercialHints[index] : null;
      const descriptionOriginal = this.text(raw.description_original);
      if (!descriptionOriginal) return [];

      const descriptionNormalized = this.text(raw.description_normalizada) || descriptionOriginal;
      const quantity = commercialHint?.quantity ?? this.number(raw.cantidad);
      const unitPrice = commercialHint?.unitPrice ?? this.number(raw.precio_vendedor);
      const sourceSubtotal = commercialHint?.subtotal ?? this.number(raw.subtotal);
      const calculatedSubtotal = quantity !== null && unitPrice !== null
        ? this.round4(quantity * unitPrice)
        : null;
      const subtotal = sourceSubtotal ?? calculatedSubtotal;
      const originalUnit = commercialHint?.unit ?? (this.text(raw.unidad) || null);
      const normalizedUnit = this.unitNormalizer.normalize(originalUnit);
      const unit = normalizedUnit ?? originalUnit;
      const currency = commercialHint?.currency ?? this.currency(raw.moneda);
      const deliveryTime = commercialHint?.deliveryTime ?? (this.text(raw.tiempo_entrega) || null);
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
      "Eres un extractor de partidas de cotizaciones industriales ya terminadas en Excel o PDF.",
      "Extrae exclusivamente filas de productos y conserva su orden.",
      "Ignora numero de partida, encabezados, cliente, folio, impuestos, totales, notas y firmas.",
      "description_normalizada debe estar limpia y en mayusculas.",
      "precio_vendedor es el precio unitario y subtotal es el total de la fila.",
      "Determina moneda de forma independiente para cada partida; el documento puede mezclar MXN y USD.",
      "USD, US$, DLLS, DLS, DOLARES o DOLAR significan USD; MXN, M.N., MN, PESOS o PESO significan MXN.",
      "Busca la moneda en la misma fila, en su columna MONEDA y en el encabezado o seccion mas cercana que aplique a esa partida.",
      "Si una seccion declara una moneda, aplicala a sus partidas hasta que aparezca otra seccion o moneda explicita.",
      "Cuando exista EXTRACTION_HINTS con QUOTED_COMMERCIAL_ROWS, usa CURRENCY, UNIT_PRICE y SUBTOTAL como fuente de verdad posicional para cada fila.",
      "Una condicion general como COTIZACION: USD define la moneda final del documento, pero no reemplaza la moneda individual indicada por las columnas de cada partida.",
      "El simbolo $ por si solo no demuestra la moneda; usa una leyenda global solo cuando sea inequivoca y, si sigue ambigua, devuelve null.",
      "No conviertas precios ni subtotales y no asumas que todas las partidas tienen la moneda final de la cotizacion.",
      "Normaliza la unidad cuando sea evidente usando PZ, K, M, ML, L, TR, SE, ACT, FT, XRO, UNO, M2, LOT o CON; ML significa metro lineal.",
      "No inventes valores y marca requiere_revision si falta cualquier dato comercial o el subtotal no corresponde.",
    ].join("\n");
  }
}

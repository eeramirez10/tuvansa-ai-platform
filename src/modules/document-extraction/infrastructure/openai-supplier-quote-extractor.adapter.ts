import OpenAI from "openai";
import type { ChatCompletionCreateParams } from "openai/resources/chat/completions";
import {
  SupplierQuoteExtractedItem,
  SupplierQuoteExtractedContact,
  SupplierQuoteExtractorPort,
  SupplierQuoteResult,
} from "../application/ports/supplier-quote-extractor.port";

type JsonRecord = Record<string, unknown>;

export class OpenAiSupplierQuoteExtractorAdapter implements SupplierQuoteExtractorPort {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    client?: OpenAI,
  ) {
    this.client = client ?? new OpenAI({ apiKey });
  }

  public async extract(text: string, fileName: string) {
    const startedAt = Date.now();
    const primary = await this.complete(
      this.systemPrompt(),
      `ARCHIVO: ${fileName}\nDOCUMENT_TEXT\n${text}`,
      this.fullResponseFormat(),
    );
    let rawResult = primary.value;
    let inputTokens = primary.inputTokens;
    let outputTokens = primary.outputTokens;
    let normalized = this.normalize(rawResult, fileName);

    if (normalized.items.length === 0 && this.hasLikelyItemTable(text)) {
      const itemRetry = await this.complete(
        this.itemRetryPrompt(),
        `ARCHIVO: ${fileName}\nDOCUMENT_TEXT\n${text}`,
        this.itemsResponseFormat(),
      );
      rawResult = this.mergeRetryItems(rawResult, itemRetry.value);
      normalized = this.normalize(rawResult, fileName);
      inputTokens = this.sumUsage(inputTokens, itemRetry.inputTokens);
      outputTokens = this.sumUsage(outputTokens, itemRetry.outputTokens);
    }

    return {
      result: normalized,
      usage: {
        provider: "openai",
        model: this.model,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  private async complete(
    systemPrompt: string,
    userPrompt: string,
    responseFormat: NonNullable<ChatCompletionCreateParams["response_format"]>,
  ): Promise<{ value: unknown; inputTokens?: number; outputTokens?: number }> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      response_format: responseFormat,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("El modelo no devolvio la cotizacion del proveedor.");
    return {
      value: JSON.parse(content) as unknown,
      inputTokens: completion.usage?.prompt_tokens,
      outputTokens: completion.usage?.completion_tokens,
    };
  }

  private mergeRetryItems(primaryValue: unknown, retryValue: unknown): JsonRecord {
    const primary = { ...this.record(primaryValue) };
    const retry = this.record(retryValue);
    primary.items = Array.isArray(retry.items) ? retry.items : [];
    const primaryWarnings = Array.isArray(primary.warnings)
      ? primary.warnings.filter((warning) => !/no se identificaron partidas/i.test(String(warning)))
      : [];
    const retryWarnings = Array.isArray(retry.warnings) ? retry.warnings : [];
    primary.warnings = [...primaryWarnings, ...retryWarnings];
    return primary;
  }

  private hasLikelyItemTable(text: string): boolean {
    const hasCommercialColumns = /(cantidad|cant\.?|qty|quantity)/i.test(text) &&
      /(importe|subtotal|precio|p\.?\s*u\.?|unit\s*price)/i.test(text);
    const hasPricedLine = /^\s*\d+\s+\d+(?:[.,]\d+)?\s+\S+.*(?:\$|USD|MXN)/im.test(text);
    return hasCommercialColumns || hasPricedLine;
  }

  private sumUsage(first?: number, second?: number): number | undefined {
    if (first === undefined && second === undefined) return undefined;
    return (first ?? 0) + (second ?? 0);
  }

  private normalize(value: unknown, fileName: string): SupplierQuoteResult {
    const root = this.record(value);
    const supplierRaw = this.record(root.supplier);
    const headerRaw = this.record(root.header);
    const totalsRaw = this.record(root.totals);
    const warnings = Array.isArray(root.warnings)
      ? root.warnings.map((item) => this.text(item)).filter((item): item is string => Boolean(item))
      : [];
    const currencyText = this.text(headerRaw.currency)?.toUpperCase();
    const currency = currencyText === "MXN" || currencyText === "USD" ? currencyText : null;
    const items = (Array.isArray(root.items) ? root.items : [])
      .map((item) => this.normalizeItem(item, warnings))
      .filter((item): item is SupplierQuoteExtractedItem => Boolean(item));
    const contacts = this.normalizeContacts(supplierRaw);
    const primaryEmail = contacts.find((contact) => contact.channel === "EMAIL")?.value
      ?? this.text(supplierRaw.email);
    const primaryPhone = contacts.find((contact) => contact.channel === "PHONE")?.value
      ?? this.text(supplierRaw.phone);

    const subtotal = this.number(totalsRaw.subtotal);
    const discount = this.number(totalsRaw.discount);
    const freight = this.number(totalsRaw.freight);
    const otherCharges = this.number(totalsRaw.otherCharges);
    const tax = this.number(totalsRaw.tax);
    const total = this.number(totalsRaw.total);
    const calculatedSubtotal = this.round(items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0));
    if (subtotal !== null && calculatedSubtotal > 0 && !this.close(calculatedSubtotal, subtotal)) {
      warnings.push(`La suma de partidas (${calculatedSubtotal}) no coincide con el subtotal del documento (${subtotal}).`);
    }
    if (subtotal !== null && total !== null && tax !== null) {
      const calculatedTotal = this.round(subtotal - (discount ?? 0) + (freight ?? 0) + (otherCharges ?? 0) + tax);
      if (!this.close(calculatedTotal, total)) {
        warnings.push("Los componentes comerciales no coinciden con el total impreso.");
      }
    }
    if (!currency) warnings.push("No se identifico con certeza la moneda del documento.");
    if (items.length === 0) warnings.push("No se identificaron partidas de proveedor.");

    const uniqueWarnings = [...new Set(warnings)];
    return {
      fileName,
      supplier: {
        name: this.text(supplierRaw.name),
        taxId: this.text(supplierRaw.taxId),
        state: this.text(supplierRaw.state),
        contactName: this.text(supplierRaw.contactName),
        email: primaryEmail,
        phone: primaryPhone,
        contacts,
        confidence: this.confidence(supplierRaw.confidence),
        evidence: this.text(supplierRaw.evidence),
      },
      header: {
        reference: this.text(headerRaw.reference),
        quoteDate: this.date(headerRaw.quoteDate),
        validUntil: this.date(headerRaw.validUntil),
        currency,
        exchangeRate: this.number(headerRaw.exchangeRate),
        paymentTerms: this.text(headerRaw.paymentTerms),
        deliveryTerms: this.text(headerRaw.deliveryTerms),
      },
      totals: {
        subtotal,
        discount,
        freight,
        otherCharges,
        taxIncluded: typeof totalsRaw.taxIncluded === "boolean" ? totalsRaw.taxIncluded : null,
        taxRate: this.number(totalsRaw.taxRate),
        tax,
        total,
      },
      items,
      warnings: uniqueWarnings,
      requiresReview: uniqueWarnings.length > 0 || items.some((item) => item.requiresReview),
    };
  }

  private normalizeContacts(supplierRaw: JsonRecord): SupplierQuoteExtractedContact[] {
    const rawContacts = Array.isArray(supplierRaw.contacts) ? supplierRaw.contacts : [];
    const legacyContacts: unknown[] = [];
    if (rawContacts.length === 0 && this.text(supplierRaw.email)) {
      legacyContacts.push({ channel: "EMAIL", value: supplierRaw.email });
    }
    if (rawContacts.length === 0 && this.text(supplierRaw.phone)) {
      legacyContacts.push({ channel: "PHONE", value: supplierRaw.phone });
    }
    const seen = new Set<string>();
    return [...rawContacts, ...legacyContacts].flatMap((value) => {
      const raw = this.record(value);
      const channel = raw.channel === "EMAIL" || raw.channel === "PHONE" ? raw.channel : null;
      const contactValue = this.text(raw.value);
      if (!channel || !contactValue) return [];
      const normalized = channel === "EMAIL"
        ? contactValue.toLowerCase()
        : contactValue.replace(/\D/g, "");
      const key = `${channel}:${normalized}`;
      if (!normalized || seen.has(key)) return [];
      seen.add(key);
      const phoneKind = channel === "PHONE" && ["LANDLINE", "MOBILE", "UNKNOWN"].includes(String(raw.phoneKind))
        ? raw.phoneKind as SupplierQuoteExtractedContact["phoneKind"]
        : channel === "PHONE" ? "UNKNOWN" : null;
      return [{
        channel,
        value: contactValue,
        phoneKind,
        isWhatsApp: channel === "PHONE" && raw.isWhatsApp === true,
        contactName: this.text(raw.contactName),
        label: this.text(raw.label),
        confidence: this.confidence(raw.confidence ?? 0.5),
        evidence: this.text(raw.evidence),
      }];
    });
  }

  private normalizeItem(value: unknown, warnings: string[]): SupplierQuoteExtractedItem | null {
    const raw = this.record(value);
    const description = this.text(raw.description);
    if (!description) return null;
    const quantity = this.number(raw.quantity);
    const listUnitPrice = this.number(raw.listUnitPrice);
    const discountPct = this.number(raw.discountPct);
    let netUnitPrice = this.number(raw.netUnitPrice);
    if (netUnitPrice === null && listUnitPrice !== null && discountPct !== null) {
      netUnitPrice = this.round(listUnitPrice * (1 - discountPct / 100));
    }
    let subtotal = this.number(raw.subtotal);
    if (subtotal === null && quantity !== null && netUnitPrice !== null) {
      subtotal = this.round(quantity * netUnitPrice);
    }
    if (quantity !== null && netUnitPrice !== null && subtotal !== null &&
      !this.close(this.round(quantity * netUnitPrice), subtotal)) {
      warnings.push(`La partida "${description.slice(0, 80)}" tiene un subtotal inconsistente.`);
    }
    const itemConfidence = this.confidence(raw.confidence);
    return {
      lineNumber: this.text(raw.lineNumber),
      supplierProductCode: this.text(raw.supplierProductCode),
      alternateCodes: Array.isArray(raw.alternateCodes)
        ? raw.alternateCodes.map((item) => this.text(item)).filter((item): item is string => Boolean(item))
        : [],
      description,
      quantity,
      unit: this.text(raw.unit),
      listUnitPrice,
      discountPct,
      netUnitPrice,
      subtotal,
      brand: this.text(raw.brand),
      origin: this.text(raw.origin),
      deliveryTime: this.text(raw.deliveryTime),
      availableDate: this.date(raw.availableDate),
      minimumQuantity: this.number(raw.minimumQuantity),
      confidence: itemConfidence,
      requiresReview: raw.requiresReview === true || quantity === null || netUnitPrice === null || itemConfidence < 0.8,
      evidence: this.text(raw.evidence),
    };
  }

  private record(value: unknown): JsonRecord {
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
  }

  private text(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim() : null;
  }

  private number(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(String(value).replace(/[$,%\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private date(value: unknown): string | null {
    const candidate = this.text(value);
    return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
  }

  private confidence(value: unknown): number {
    return Math.min(1, Math.max(0, this.number(value) ?? 0));
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
  }

  private close(left: number, right: number): boolean {
    return Math.abs(left - right) <= Math.max(0.05, Math.abs(right) * 0.005);
  }

  private fullResponseFormat() {
    return {
      type: "json_schema" as const,
      json_schema: {
        name: "supplier_quote",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["supplier", "header", "totals", "items", "warnings"],
          properties: {
            supplier: {
              type: "object",
              additionalProperties: false,
              required: ["name", "taxId", "state", "contactName", "email", "phone", "contacts", "confidence", "evidence"],
              properties: {
                name: { type: ["string", "null"] },
                taxId: { type: ["string", "null"] },
                state: { type: ["string", "null"] },
                contactName: { type: ["string", "null"] },
                email: { type: ["string", "null"] },
                phone: { type: ["string", "null"] },
                contacts: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["channel", "value", "phoneKind", "isWhatsApp", "contactName", "label", "confidence", "evidence"],
                    properties: {
                      channel: { type: "string", enum: ["EMAIL", "PHONE"] },
                      value: { type: "string" },
                      phoneKind: { type: ["string", "null"], enum: ["LANDLINE", "MOBILE", "UNKNOWN", null] },
                      isWhatsApp: { type: "boolean" },
                      contactName: { type: ["string", "null"] },
                      label: { type: ["string", "null"] },
                      confidence: { type: "number" },
                      evidence: { type: ["string", "null"] },
                    },
                  },
                },
                confidence: { type: "number" },
                evidence: { type: ["string", "null"] },
              },
            },
            header: {
              type: "object",
              additionalProperties: false,
              required: ["reference", "quoteDate", "validUntil", "currency", "exchangeRate", "paymentTerms", "deliveryTerms"],
              properties: {
                reference: { type: ["string", "null"] },
                quoteDate: { type: ["string", "null"] },
                validUntil: { type: ["string", "null"] },
                currency: { type: ["string", "null"], enum: ["MXN", "USD", null] },
                exchangeRate: { type: ["number", "null"] },
                paymentTerms: { type: ["string", "null"] },
                deliveryTerms: { type: ["string", "null"] },
              },
            },
            totals: {
              type: "object",
              additionalProperties: false,
              required: ["subtotal", "discount", "freight", "otherCharges", "taxIncluded", "taxRate", "tax", "total"],
              properties: {
                subtotal: { type: ["number", "null"] },
                discount: { type: ["number", "null"] },
                freight: { type: ["number", "null"] },
                otherCharges: { type: ["number", "null"] },
                taxIncluded: { type: ["boolean", "null"] },
                taxRate: { type: ["number", "null"] },
                tax: { type: ["number", "null"] },
                total: { type: ["number", "null"] },
              },
            },
            items: { type: "array", items: this.itemSchema() },
            warnings: { type: "array", items: { type: "string" } },
          },
        },
      },
    };
  }

  private itemsResponseFormat() {
    return {
      type: "json_schema" as const,
      json_schema: {
        name: "supplier_quote_items_retry",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["items", "warnings"],
          properties: {
            items: { type: "array", items: this.itemSchema() },
            warnings: { type: "array", items: { type: "string" } },
          },
        },
      },
    };
  }

  private itemSchema() {
    return {
      type: "object",
      additionalProperties: false,
      required: [
        "lineNumber", "supplierProductCode", "alternateCodes", "description", "quantity",
        "unit", "listUnitPrice", "discountPct", "netUnitPrice", "subtotal", "brand",
        "origin", "deliveryTime", "availableDate", "minimumQuantity", "confidence",
        "requiresReview", "evidence",
      ],
      properties: {
        lineNumber: { type: ["string", "null"] },
        supplierProductCode: { type: ["string", "null"] },
        alternateCodes: { type: "array", items: { type: "string" } },
        description: { type: "string" },
        quantity: { type: ["number", "null"] },
        unit: { type: ["string", "null"] },
        listUnitPrice: { type: ["number", "null"] },
        discountPct: { type: ["number", "null"] },
        netUnitPrice: { type: ["number", "null"] },
        subtotal: { type: ["number", "null"] },
        brand: { type: ["string", "null"] },
        origin: { type: ["string", "null"] },
        deliveryTime: { type: ["string", "null"] },
        availableDate: { type: ["string", "null"] },
        minimumQuantity: { type: ["number", "null"] },
        confidence: { type: "number" },
        requiresReview: { type: "boolean" },
        evidence: { type: ["string", "null"] },
      },
    };
  }

  private itemRetryPrompt(): string {
    return [
      "Extrae exclusivamente todas las partidas reales de la cotizacion de proveedor.",
      "Una fila con cantidad, unidad, descripcion y precio es una partida aunque sea la unica del documento.",
      "No confundas encabezados, totales, impuestos ni numeros consecutivos vacios con partidas.",
      "Conserva el orden y los valores impresos. No inventes datos ni conviertas moneda.",
      "Devuelve la lista completa de items conforme al esquema solicitado.",
    ].join("\n");
  }

  private systemPrompt(): string {
    return [
      "Eres un extractor de cotizaciones de proveedores industriales.",
      "No inventes datos. Usa null cuando el documento no muestre un valor.",
      "En supplier extrae exclusivamente la empresa que emite la cotizacion, nunca TUVANSA como cliente.",
      "En supplier.contacts devuelve por separado cada correo y cada telefono visible; nunca juntes varios valores en una cadena.",
      "Para telefonos usa phoneKind LANDLINE, MOBILE o UNKNOWN. Marca isWhatsApp=true solo si el documento dice WhatsApp/WA o lo identifica explicitamente; un celular por si solo no prueba que tenga WhatsApp.",
      "Deduplica contactos repetidos y conserva nombre de contacto o etiqueta cuando el documento los asocie.",
      "Extrae todas las partidas reales de material y conserva la descripcion comercial del proveedor.",
      "Nunca devuelvas items vacio si existe al menos una fila con cantidad, descripcion y precio.",
      "Una fila de material sigue siendo partida aunque sea la unica del documento.",
      "Ignora renglones vacios, encabezados, numeros consecutivos sin datos, impuestos, totales y firmas.",
      "Distingue precio de lista de precio neto. Aplica descuentos solo cuando sean explicitos.",
      "No conviertas monedas. Las fechas deben ser YYYY-MM-DD.",
      "taxRate y discountPct son porcentajes numericos; confidence va de 0 a 1.",
      "Marca requiresReview cuando falten cantidad o precio neto, la moneda sea ambigua o el renglon sea dudoso.",
      "La evidencia debe ser un fragmento corto del renglon fuente.",
    ].join("\n");
  }
}

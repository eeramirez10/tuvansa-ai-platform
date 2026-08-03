import OpenAI from "openai";
import {
  SupplierQuoteExtractedItem,
  SupplierQuoteExtractorPort,
  SupplierQuoteResult,
} from "../application/ports/supplier-quote-extractor.port";

type JsonRecord = Record<string, unknown>;

export class OpenAiSupplierQuoteExtractorAdapter implements SupplierQuoteExtractorPort {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new OpenAI({ apiKey });
  }

  public async extract(text: string, fileName: string) {
    const startedAt = Date.now();
    const completion = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: this.systemPrompt() },
        { role: "user", content: `DOCUMENT_TEXT\n${text}` },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("El modelo no devolvio la cotizacion del proveedor.");

    return {
      result: this.normalize(JSON.parse(content), fileName),
      usage: {
        provider: "openai",
        model: this.model,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        latencyMs: Date.now() - startedAt,
      },
    };
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
        email: this.text(supplierRaw.email),
        phone: this.text(supplierRaw.phone),
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

  private systemPrompt(): string {
    return `Eres un extractor de cotizaciones de proveedores industriales. Devuelve exclusivamente JSON valido.
No inventes datos. Usa null cuando el documento no muestre un valor. Conserva la descripcion comercial del proveedor.
En supplier extrae a la empresa que emite la cotizacion, nunca a TUVANSA como cliente.
Distingue precio de lista de precio neto. Aplica descuentos solo cuando sean explicitos. No conviertas monedas.
Ignora renglones vacios y separa flete u otros cargos de las partidas. Las fechas deben ser YYYY-MM-DD.
taxRate y discountPct son porcentajes numericos; confidence va de 0 a 1.
Marca requiresReview cuando falten cantidad o precio neto, la moneda sea ambigua o el renglon sea dudoso.
La evidencia debe ser un fragmento corto del documento.
Esquema exacto:
{"supplier":{"name":null,"taxId":null,"state":null,"contactName":null,"email":null,"phone":null,"confidence":0,"evidence":null},"header":{"reference":null,"quoteDate":null,"validUntil":null,"currency":"MXN|USD|null","exchangeRate":null,"paymentTerms":null,"deliveryTerms":null},"totals":{"subtotal":null,"discount":null,"freight":null,"otherCharges":null,"taxIncluded":null,"taxRate":null,"tax":null,"total":null},"items":[{"lineNumber":null,"supplierProductCode":null,"alternateCodes":[],"description":"","quantity":null,"unit":null,"listUnitPrice":null,"discountPct":null,"netUnitPrice":null,"subtotal":null,"brand":null,"origin":null,"deliveryTime":null,"availableDate":null,"minimumQuantity":null,"confidence":0,"requiresReview":true,"evidence":null}],"warnings":[]}`;
  }
}

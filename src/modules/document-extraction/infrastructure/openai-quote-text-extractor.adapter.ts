import OpenAI from "openai";
import {
  QuoteTextExtraction,
  QuoteTextExtractorPort,
} from "../application/ports/quote-text-extractor.port";
import {
  DetectedLanguage,
  ERP_MEASUREMENT_UNITS,
  QuoteItem,
} from "../domain/quote-item.entity";
import { LanguageDetectorService } from "./normalization/language-detector.service";
import { QuantityNormalizerService } from "./normalization/quantity-normalizer.service";
import { UnitNormalizerService } from "./normalization/unit-normalizer.service";
import { ExtractedPartyData } from "../../ai-assistance/domain/party-data.types";

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
            required: ["items", "customer"],
            properties: {
              customer: this.customerSchema(),
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
                      enum: [...ERP_MEASUREMENT_UNITS, null]
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
      customer: this.parseCustomer(parsed),
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
      const normalizedUnit = this.unitNormalizer.normalize(raw.unidad_normalizada) ??
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

  private parseCustomer(value: unknown): ExtractedPartyData | null {
    if (!value || typeof value !== "object") return null;
    const customer = (value as Record<string, unknown>).customer;
    if (!customer || typeof customer !== "object" || Array.isArray(customer)) return null;
    const raw = customer as Record<string, unknown>;
    const businessName = this.nullableText(raw.businessName);
    const firstName = this.nullableText(raw.firstName);
    const lastName = this.nullableText(raw.lastName);
    const taxId = this.nullableText(raw.taxId)?.toUpperCase() || null;
    const contacts = (Array.isArray(raw.contacts) ? raw.contacts : []).flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const contact = entry as Record<string, unknown>;
      const name = this.nullableText(contact.name);
      const email = this.validEmail(contact.email);
      const landlinePhone = this.validPhone(contact.landlinePhone);
      const whatsappPhone = this.validPhone(contact.whatsappPhone);
      if (!name && !email && !landlinePhone && !whatsappPhone) return [];
      return [{
        name,
        position: this.nullableText(contact.position),
        label: this.nullableText(contact.label),
        email,
        landlinePhone,
        extension: this.nullableText(contact.extension)?.replace(/\D/g, "") || null,
        whatsappPhone,
        confidence: this.confidence(contact.confidence),
        evidence: this.nullableText(contact.evidence),
      }];
    });
    if (!businessName && !firstName && !lastName && !taxId && contacts.length === 0) return null;
    const addressRaw = raw.address && typeof raw.address === "object" && !Array.isArray(raw.address)
      ? raw.address as Record<string, unknown>
      : {};
    return {
      partyType: "CUSTOMER",
      businessName,
      firstName,
      lastName,
      taxId,
      taxRegime: this.nullableText(raw.taxRegime),
      scope: null,
      currency: null,
      creditTerms: null,
      address: {
        street: this.nullableText(addressRaw.street),
        exteriorNumber: this.nullableText(addressRaw.exteriorNumber),
        interiorNumber: this.nullableText(addressRaw.interiorNumber),
        neighborhood: this.nullableText(addressRaw.neighborhood),
        city: this.nullableText(addressRaw.city),
        state: this.nullableText(addressRaw.state),
        postalCode: this.nullableText(addressRaw.postalCode),
        country: this.nullableText(addressRaw.country),
      },
      contacts,
      notes: null,
      confidence: this.confidence(raw.confidence),
      evidence: this.nullableText(raw.evidence),
    };
  }

  private customerSchema() {
    const nullableString = { type: ["string", "null"] };
    return {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["businessName", "firstName", "lastName", "taxId", "taxRegime", "address", "contacts", "confidence", "evidence"],
      properties: {
        businessName: nullableString,
        firstName: nullableString,
        lastName: nullableString,
        taxId: nullableString,
        taxRegime: nullableString,
        address: {
          type: "object",
          additionalProperties: false,
          required: ["street", "exteriorNumber", "interiorNumber", "neighborhood", "city", "state", "postalCode", "country"],
          properties: {
            street: nullableString,
            exteriorNumber: nullableString,
            interiorNumber: nullableString,
            neighborhood: nullableString,
            city: nullableString,
            state: nullableString,
            postalCode: nullableString,
            country: nullableString,
          },
        },
        contacts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "position", "label", "email", "landlinePhone", "extension", "whatsappPhone", "confidence", "evidence"],
            properties: {
              name: nullableString,
              position: nullableString,
              label: nullableString,
              email: nullableString,
              landlinePhone: nullableString,
              extension: nullableString,
              whatsappPhone: nullableString,
              confidence: { type: "number" },
              evidence: nullableString,
            },
          },
        },
        confidence: { type: "number" },
        evidence: nullableString,
      },
    };
  }

  private nullableText(value: unknown): string | null {
    const normalized = this.text(value);
    return normalized || null;
  }

  private validEmail(value: unknown): string | null {
    const email = this.nullableText(value)?.toLowerCase() || null;
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }

  private validPhone(value: unknown): string | null {
    const phone = this.nullableText(value);
    if (!phone) return null;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return null;
    return phone.startsWith("+") ? `+${digits}` : digits;
  }

  private confidence(value: unknown): number {
    return Math.min(1, Math.max(0, Number(value) || 0));
  }

  private systemPrompt(): string {
    return [
      "You extract industrial quotation line items.",
      "Return only data matching the requested JSON schema.",
      "Preserve description_original and create a clean description_normalizada.",
      "When a product table separates technical attributes into columns, integrate every non-empty value into one continuous industrial product description.",
      "Never format descriptions as labeled fields or lists. Do not write DIAMETRO:, PULGADA:, CEDULA:, DESCRIPTION_SUFFIX=, pipes or other separators.",
      "Use compact commercial notation such as 6\" X 4\" CED. 10S. Example: ECCENTRIC REDUCER A403-WP316/316L-S BW 6\" X 4\" CED. 10S.",
      "Treat zero, dashes and blank technical cells as absent. Do not append item identifiers, quantity or sales unit to the product description.",
      "For STRUCTURED_TABLE_ROWS, join DESCRIPTION and DESCRIPTION_SUFFIX naturally in both description_original and description_normalizada, removing duplicated words or specifications. Keep UNIT and QUANTITY only in their dedicated fields.",
      "Ignore headers, commercial conditions, prices, taxes, totals, signatures and non-product text.",
      "In customer, extract the company or person requesting the quotation only when explicitly identifiable; never return TUVANSA or the seller as customer.",
      "Separate customer contacts and address fields. Use null for customer when identity is not supported by the content.",
      "Do not invent quantity or unit.",
      "unidad_normalizada must use only the ERP codes PZ, K, M, ML, L, TR, SE, ACT, FT, XRO, UNO, M2, LOT or CON.",
      "Keep the source order.",
      "When EXTRACTION_HINTS are present, use them to reconcile each structured row with its description, technical attributes, quantity and unit.",
      "Use requiere_revision=true when quantity or normalized unit is missing."
    ].join("\n");
  }
}

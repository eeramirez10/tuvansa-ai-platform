import OpenAI from "openai";
import { StructuredAiProcessorPort } from "../application/ports/structured-ai-processor.port";
import { PartyDataJobInput, PartyDataRequestDto } from "../domain/party-data-request.dto";
import { ExtractedPartyData } from "../domain/party-data.types";

type JsonRecord = Record<string, unknown>;

export class OpenAiPartyDataProcessor implements StructuredAiProcessorPort {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new OpenAI({ apiKey });
  }

  public async process(value: unknown) {
    const input = PartyDataRequestDto.create(value).toJobInput();
    const startedAt = Date.now();
    const completion = await this.client.chat.completions.create({
      model: this.model,
      response_format: this.responseFormat(),
      messages: [
        { role: "system", content: this.systemPrompt(input) },
        { role: "user", content: input.text },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("La IA no devolvio datos del tercero.");
    const result = this.normalize(JSON.parse(content) as unknown, input.partyType);
    return {
      result,
      usage: {
        provider: "openai",
        model: this.model,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  private normalize(value: unknown, partyType: PartyDataJobInput["partyType"]): ExtractedPartyData {
    const root = this.record(value);
    const address = this.record(root.address);
    const contacts = (Array.isArray(root.contacts) ? root.contacts : [])
      .flatMap((entry) => {
        const raw = this.record(entry);
        const email = this.email(raw.email);
        const landlinePhone = this.phone(raw.landlinePhone);
        const whatsappPhone = this.phone(raw.whatsappPhone);
        const name = this.text(raw.name);
        if (!email && !landlinePhone && !whatsappPhone && !name) return [];
        return [{
          name,
          position: this.text(raw.position),
          label: this.text(raw.label),
          email,
          landlinePhone,
          extension: this.text(raw.extension)?.replace(/\D/g, "") || null,
          whatsappPhone,
          confidence: this.confidence(raw.confidence),
          evidence: this.text(raw.evidence),
        }];
      });
    return {
      partyType,
      businessName: this.text(root.businessName),
      firstName: this.text(root.firstName),
      lastName: this.text(root.lastName),
      taxId: this.text(root.taxId)?.toUpperCase() || null,
      taxRegime: this.text(root.taxRegime),
      scope: root.scope === "NATIONAL" || root.scope === "INTERNATIONAL" ? root.scope : null,
      currency: root.currency === "MXN" || root.currency === "USD" ? root.currency : null,
      creditTerms: this.text(root.creditTerms),
      address: {
        street: this.text(address.street),
        exteriorNumber: this.text(address.exteriorNumber),
        interiorNumber: this.text(address.interiorNumber),
        neighborhood: this.text(address.neighborhood),
        city: this.text(address.city),
        state: this.text(address.state),
        postalCode: this.text(address.postalCode),
        country: this.text(address.country),
      },
      contacts,
      notes: this.text(root.notes),
      confidence: this.confidence(root.confidence),
      evidence: this.text(root.evidence),
    };
  }

  private responseFormat() {
    const nullableString = { type: ["string", "null"] };
    return {
      type: "json_schema" as const,
      json_schema: {
        name: "party_data",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["businessName", "firstName", "lastName", "taxId", "taxRegime", "scope", "currency", "creditTerms", "address", "contacts", "notes", "confidence", "evidence"],
          properties: {
            businessName: nullableString,
            firstName: nullableString,
            lastName: nullableString,
            taxId: nullableString,
            taxRegime: nullableString,
            scope: { type: ["string", "null"], enum: ["NATIONAL", "INTERNATIONAL", null] },
            currency: { type: ["string", "null"], enum: ["MXN", "USD", null] },
            creditTerms: nullableString,
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
            notes: nullableString,
            confidence: { type: "number" },
            evidence: nullableString,
          },
        },
      },
    };
  }

  private systemPrompt(input: PartyDataJobInput): string {
    return [
      `Extrae exclusivamente datos de un ${input.partyType === "CUSTOMER" ? "cliente" : "proveedor"} desde texto comercial pegado por un usuario.`,
      "El texto puede ser una firma de correo, mensaje de WhatsApp, tarjeta de contacto o bloque de datos fiscales.",
      "No inventes datos; usa null cuando no aparezcan.",
      "Separa nombre de persona, apellidos y razon social. businessName es la empresa, no el contacto.",
      "Separa la direccion en sus componentes. Conserva el pais solo cuando sea explicito.",
      "Devuelve un objeto por persona en contacts y no juntes varios correos o telefonos en un mismo campo.",
      "landlinePhone es telefono fijo; whatsappPhone solo se llena cuando el texto indique WhatsApp, WA o un numero movil presentado explicitamente como WhatsApp.",
      "Normaliza correos a minusculas. Conserva prefijo internacional de telefonos cuando exista y separa la extension.",
      "scope solo aplica a proveedores: NATIONAL si el texto demuestra que opera en Mexico e INTERNATIONAL si demuestra otro pais; de lo contrario null.",
      "confidence debe estar entre 0 y 1 y evidence debe ser un fragmento corto que respalde la identidad.",
    ].join("\n");
  }

  private record(value: unknown): JsonRecord {
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
  }

  private text(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim() : null;
  }

  private email(value: unknown): string | null {
    const email = this.text(value)?.toLowerCase() || null;
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }

  private phone(value: unknown): string | null {
    const raw = this.text(value);
    if (!raw) return null;
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return null;
    return raw.startsWith("+") ? `+${digits}` : digits;
  }

  private confidence(value: unknown): number {
    return Math.min(1, Math.max(0, Number(value) || 0));
  }
}

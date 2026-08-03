import OpenAI from "openai";
import { StructuredAiProcessorPort } from "../application/ports/structured-ai-processor.port";
import {
  TechnicalDataBatchRequestDto,
  TechnicalDataBatchSuggestionInput,
  TechnicalDataJobInput,
  TechnicalDataRequestDto,
  TechnicalDataSuggestionInput,
} from "../domain/technical-data-request.dto";

interface TechnicalAttributeSuggestion {
  key: string;
  label: string;
  value: string;
  confidence: number;
  evidence: string;
}

interface TechnicalDataSuggestion {
  family: string;
  familyLabel: string;
  confidence: number;
  attributes: TechnicalAttributeSuggestion[];
}

const FAMILY_LABELS: Record<string, string> = {
  PIPE: "Tuberia",
  VALVE: "Valvula",
  FITTING: "Conexion",
  FLANGE: "Brida",
  GASKET: "Empaque",
  FASTENER: "Tornilleria",
  OTHER: "Otro",
};

export class OpenAiTechnicalDataProcessor implements StructuredAiProcessorPort {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new OpenAI({ apiKey });
  }

  public async process(value: unknown) {
    const input = this.parseInput(value);
    const startedAt = Date.now();
    const batch = input.mode === "batch";
    const completion = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: this.systemPrompt(batch) },
        { role: "user", content: JSON.stringify(input.payload) },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error(batch
      ? "La IA no devolvio datos tecnicos por lote."
      : "La IA no devolvio datos tecnicos.");
    const parsed = JSON.parse(content) as unknown;
    const result = batch
      ? this.normalizeBatch(parsed, input.payload.items)
      : this.normalizeSuggestion(parsed);

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

  private parseInput(value: unknown): TechnicalDataJobInput {
    if (!value || typeof value !== "object") throw new Error("Invalid technical data job input.");
    const raw = value as Record<string, unknown>;
    if (raw.mode === "single") return TechnicalDataRequestDto.create(raw.payload).toJobInput();
    if (raw.mode === "batch") return TechnicalDataBatchRequestDto.create(raw.payload).toJobInput();
    throw new Error("Invalid technical data job mode.");
  }

  private normalizeBatch(value: unknown, inputs: TechnicalDataBatchSuggestionInput[]) {
    if (!value || typeof value !== "object") throw new Error("La IA devolvio un lote tecnico invalido.");
    const rawItems = (value as Record<string, unknown>).items;
    if (!Array.isArray(rawItems)) throw new Error("La IA devolvio un lote tecnico invalido.");
    const requestedIds = new Set(inputs.map((input) => input.itemId));
    const returnedIds = new Set<string>();
    const items = rawItems.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const raw = entry as Record<string, unknown>;
      const itemId = typeof raw.itemId === "string" ? raw.itemId.trim() : "";
      if (!requestedIds.has(itemId) || returnedIds.has(itemId)) return [];
      returnedIds.add(itemId);
      return [{ itemId, ...this.normalizeSuggestion(raw) }];
    });
    if (items.length === 0) {
      throw new Error("La IA no pudo relacionar los datos tecnicos con las partidas.");
    }
    return { items };
  }

  private normalizeSuggestion(value: unknown): TechnicalDataSuggestion {
    const parsed = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const rawFamily = typeof parsed.family === "string" ? parsed.family.toUpperCase() : "";
    const family = FAMILY_LABELS[rawFamily] ? rawFamily : "OTHER";
    const attributes = Array.isArray(parsed.attributes)
      ? parsed.attributes.flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const raw = entry as Record<string, unknown>;
          const key = typeof raw.key === "string"
            ? raw.key.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
            : "";
          const itemValue = typeof raw.value === "string" ? raw.value.trim() : "";
          if (!key || !itemValue) return [];
          return [{
            key,
            label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : key,
            value: itemValue,
            confidence: this.confidence(raw.confidence),
            evidence: typeof raw.evidence === "string" ? raw.evidence.trim() : "",
          }];
        })
      : [];
    return {
      family,
      familyLabel: FAMILY_LABELS[family] ?? FAMILY_LABELS.OTHER,
      confidence: this.confidence(parsed.confidence),
      attributes,
    };
  }

  private confidence(value: unknown): number {
    return Math.min(1, Math.max(0, Number(value) || 0));
  }

  private systemPrompt(batch: boolean): string {
    const base = [
      `You extract technical data for ${batch ? "multiple " : ""}industrial piping products.`,
      "Choose exactly one family: PIPE, VALVE, FITTING, FLANGE, GASKET, FASTENER, OTHER.",
      "Return only facts explicitly supported by the descriptions; never invent values.",
      "Use stable English UPPER_SNAKE_CASE attribute keys and concise Spanish labels.",
      "Useful keys include MATERIAL, STANDARD, GRADE, NOMINAL_DIAMETER, SCHEDULE, THICKNESS, PRESSURE_CLASS, FIGURE, CONNECTION, BODY_MATERIAL, TRIM, OPERATION, MANUFACTURING, LENGTH and FACE.",
      "Confidence values must be between 0 and 1.",
    ];
    if (batch) {
      base.push(
        "Return exactly one result for every input itemId and preserve each itemId verbatim.",
        "Return JSON: {items:[{itemId,family,familyLabel,confidence,attributes:[{key,label,value,confidence,evidence}]}]}",
      );
    } else {
      base.push("Return JSON: {family,familyLabel,confidence,attributes:[{key,label,value,confidence,evidence}]}");
    }
    return base.join(" ");
  }
}

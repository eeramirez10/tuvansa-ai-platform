import { QuoteItem } from "../../domain/quote-item.entity";

export interface AiUsage {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}

export interface QuoteTextExtraction {
  items: QuoteItem[];
  usage: AiUsage;
}

export interface QuoteTextExtractorPort {
  extract(text: string): Promise<QuoteTextExtraction>;
}

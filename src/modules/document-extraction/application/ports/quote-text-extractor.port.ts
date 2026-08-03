import { QuoteItem } from "../../domain/quote-item.entity";
import { ExtractedPartyData } from "../../../ai-assistance/domain/party-data.types";

export interface AiUsage {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}

export interface QuoteTextExtraction {
  items: QuoteItem[];
  customer: ExtractedPartyData | null;
  usage: AiUsage;
}

export interface QuoteTextExtractorPort {
  extract(text: string): Promise<QuoteTextExtraction>;
}

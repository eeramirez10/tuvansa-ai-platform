import { AiUsage } from "../../../document-extraction/application/ports/quote-text-extractor.port";

export interface StructuredAiProcessingResult {
  result: unknown;
  usage: AiUsage;
}

export interface StructuredAiProcessorPort {
  process(input: unknown): Promise<StructuredAiProcessingResult>;
}

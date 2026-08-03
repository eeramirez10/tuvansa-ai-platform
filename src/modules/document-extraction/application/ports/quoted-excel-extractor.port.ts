import { AiUsage } from "./quote-text-extractor.port";
import { QuotedExcelItem } from "../../domain/quoted-excel-item.entity";

export interface QuotedExcelExtraction {
  items: QuotedExcelItem[];
  usage: AiUsage;
}

export interface QuotedExcelExtractorPort {
  extract(text: string): Promise<QuotedExcelExtraction>;
}

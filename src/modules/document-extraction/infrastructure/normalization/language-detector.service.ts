import { DetectedLanguage } from "../../domain/quote-item.entity";

export class LanguageDetectorService {
  private readonly englishHints = [
    "qty", "inch", "inches", "carbon steel", "valve", "pipe", "schedule", "gate", "check valve", "flange",
  ];
  private readonly spanishHints = [
    "cantidad", "acero", "valvula", "válvula", "cedula", "cédula", "tramo", "pieza", "metros", "tuberia", "tubería",
  ];

  public detect(input: string): DetectedLanguage {
    const text = input.toLowerCase();
    const english = this.englishHints.some((term) => text.includes(term));
    const spanish = this.spanishHints.some((term) => text.includes(term));
    if (english && spanish) return "mixed";
    return english ? "en" : "es";
  }
}

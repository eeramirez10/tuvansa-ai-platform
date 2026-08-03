import { CanonicalUnit } from "../../domain/quote-item.entity";

export class UnitNormalizerService {
  private readonly unitMap = new Map<string, CanonicalUnit>([
    ["kilo", "kg"], ["k", "kg"], ["kg", "kg"], ["kgs", "kg"],
    ["kilogramo", "kg"], ["kilogram", "kg"],
    ["metro", "m"], ["metros", "m"], ["m", "m"], ["mt", "m"], ["mts", "m"], ["mtr", "m"],
    ["pie", "ft"], ["pies", "ft"], ["ft", "ft"],
    ["pieza", "pza"], ["piezas", "pza"], ["pza", "pza"], ["pzas", "pza"],
    ["pz", "pza"], ["mpz", "pza"], ["pc", "pza"], ["pcs", "pza"],
    ["tramo", "tramo"], ["tramos", "tramo"], ["tr", "tramo"],
    ["se", "se"],
  ]);

  public normalize(input: unknown): CanonicalUnit | null {
    if (typeof input !== "string") return null;
    const cleaned = this.clean(input);
    if (!cleaned) return null;
    return this.unitMap.get(cleaned) ?? this.unitMap.get(cleaned.replace(/\s+/g, "")) ?? null;
  }

  public detectFromDescription(description: string): CanonicalUnit | null {
    for (const token of this.clean(description).split(/\s+/)) {
      const normalized = this.normalize(token);
      if (normalized) return normalized;
    }
    return null;
  }

  private clean(value: string): string {
    return value.toLowerCase().trim().replace(/[.,;:()"'`]/g, "").replace(/\s+/g, " ");
  }
}

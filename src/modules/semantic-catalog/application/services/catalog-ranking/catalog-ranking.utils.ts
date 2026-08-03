import { RecordMetadata } from "@pinecone-database/pinecone";

export class CatalogRankingUtils {
  public static read(metadata: RecordMetadata, field: string): string | undefined {
    const value = metadata[field];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  public static equals(first?: string, second?: string): boolean {
    return Boolean(first && second && this.normalize(first) === this.normalize(second));
  }

  public static includes(first?: string, second?: string): boolean {
    if (!first || !second) return false;
    const normalizedFirst = this.normalize(first);
    const normalizedSecond = this.normalize(second);
    return normalizedFirst.includes(normalizedSecond) || normalizedSecond.includes(normalizedFirst);
  }

  public static dimensionsEqual(first?: string, second?: string): boolean {
    return this.normalizeDimension(first) === this.normalizeDimension(second);
  }

  public static descriptionOverlap(query: string, metadata: RecordMetadata): number {
    const description = [
      this.read(metadata, "normalizedDescription"),
      this.read(metadata, "originalDescription"),
    ].filter((value): value is string => Boolean(value)).join(" ");
    if (!description) return 0;

    const queryTokens = this.tokenize(query);
    const descriptionTokens = this.tokenize(description);
    if (queryTokens.size === 0 || descriptionTokens.size === 0) return 0;

    let overlaps = 0;
    for (const token of queryTokens) {
      if (descriptionTokens.has(token)) overlaps += 1;
    }

    return overlaps / queryTokens.size;
  }

  public static normalize(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .toUpperCase()
      .trim();
  }

  private static normalizeDimension(value?: string): string {
    return this.normalize(value ?? "")
      .replace(/\bPULGADAS?\b|\bINCH(?:ES)?\b|["¨]/g, "")
      .replace(/\s*\/\s*/g, "/")
      .trim();
  }

  private static tokenize(value: string): Set<string> {
    const stopWords = new Set(["DE", "DEL", "LA", "EL", "Y", "PARA", "CON", "SIN", "EN", "MM", "CM"]);

    return new Set(
      this.normalize(value)
        .split(/[^A-Z0-9/.-]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !stopWords.has(token)),
    );
  }
}

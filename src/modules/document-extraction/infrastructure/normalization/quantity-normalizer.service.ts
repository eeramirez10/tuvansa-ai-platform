export class QuantityNormalizerService {
  public normalize(input: unknown): number | null {
    if (typeof input === "number" && Number.isFinite(input)) return input;
    if (typeof input !== "string") return null;
    const raw = input.trim().replace(/\s+/g, "");
    if (!raw) return null;
    let normalized = raw;
    if (raw.includes(",") && raw.includes(".")) {
      normalized = raw.replace(/,/g, "");
    } else if (raw.includes(",")) {
      normalized = /,\d{1,3}$/.test(raw) ? raw.replace(",", ".") : raw.replace(/,/g, "");
    }
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
}

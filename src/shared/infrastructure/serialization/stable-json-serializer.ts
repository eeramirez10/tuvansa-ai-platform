export class StableJsonSerializer {
  public stringify(value: unknown): string {
    return JSON.stringify(this.sort(value));
  }

  private sort(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sort(item));
    if (!value || typeof value !== "object") return value;

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, this.sort(item)]),
    );
  }
}

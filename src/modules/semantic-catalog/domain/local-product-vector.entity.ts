import { LocalProductVectorMetadata } from "./semantic-catalog.types";

export class LocalProductVectorEntity {
  public static vectorId(productId: string): string {
    return `local:${productId.trim()}`;
  }

  public static embeddingText(description: string, unit: string): string {
    return [
      "Producto local pendiente de alta en ERP",
      `Descripcion: ${this.canonicalize(description)}`,
      `Unidad: ${this.canonicalize(unit)}`,
    ].join(". ");
  }

  public static metadata(input: {
    productId: string;
    description: string;
    unit: string;
    branchId?: string | null;
  }): LocalProductVectorMetadata {
    const branchId = input.branchId?.trim();
    return {
      source: "LOCAL_TEMP",
      productId: input.productId.trim(),
      description: this.normalizeDisplay(input.description),
      unit: this.normalizeDisplay(input.unit),
      ...(branchId ? { branchId } : {}),
    };
  }

  public static canonicalize(value: string): string {
    return this.normalizeDisplay(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  private static normalizeDisplay(value: string): string {
    return value.trim().replace(/\s+/g, " ").toUpperCase();
  }
}

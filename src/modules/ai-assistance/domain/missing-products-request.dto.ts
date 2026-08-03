import { AppError } from "../../../shared/domain/app-error";

export interface MissingProductNormalizationInput {
  itemId: string;
  description: string;
  quantity: number | null;
  unit: string | null;
}

export class MissingProductsRequestDto {
  private constructor(private readonly items: MissingProductNormalizationInput[]) {}

  public static create(value: unknown): MissingProductsRequestDto {
    if (!value || typeof value !== "object") {
      throw new AppError("Body invalido.", 400, "INVALID_MISSING_PRODUCTS_REQUEST");
    }
    const rawItems = (value as Record<string, unknown>).items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new AppError("Debes enviar un arreglo no vacio en 'items'.", 400, "MISSING_PRODUCTS_REQUIRED");
    }
    if (rawItems.length > 100) {
      throw new AppError("Se permiten hasta 100 productos por solicitud.", 400, "TOO_MANY_MISSING_PRODUCTS");
    }

    const ids = new Set<string>();
    const items = rawItems.map((raw, index) => {
      if (!raw || typeof raw !== "object") {
        throw new AppError(`items[${index}] invalido.`, 400, "INVALID_MISSING_PRODUCT");
      }
      const row = raw as Record<string, unknown>;
      const itemId = this.firstText(row.itemId, row.item_id);
      const description = this.firstText(
        row.description,
        row.description_original,
        row.descriptionOriginal,
      );
      const quantity = this.number(row.quantity ?? row.cantidad ?? row.qty);
      const unit = this.firstText(
        row.unit,
        row.unidad,
        row.unidad_original,
        row.unit_original,
        row.unitOriginal,
      ) || null;
      if (!itemId) throw new AppError(`items[${index}].itemId es obligatorio.`, 400, "ITEM_ID_REQUIRED");
      if (ids.has(itemId)) throw new AppError(`itemId duplicado: ${itemId}.`, 400, "DUPLICATE_ITEM_ID");
      if (!description) {
        throw new AppError(`items[${index}].description es obligatorio.`, 400, "ITEM_DESCRIPTION_REQUIRED");
      }
      if (quantity !== null && quantity <= 0) {
        throw new AppError(`items[${index}].quantity es invalido.`, 400, "INVALID_ITEM_QUANTITY");
      }
      ids.add(itemId);
      return { itemId, description, quantity, unit };
    });
    return new MissingProductsRequestDto(items);
  }

  public toJobInput(): { items: MissingProductNormalizationInput[] } {
    return { items: this.items.map((item) => ({ ...item })) };
  }

  private static firstText(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  private static number(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      throw new AppError("quantity es invalido.", 400, "INVALID_ITEM_QUANTITY");
    }
    return parsed;
  }
}

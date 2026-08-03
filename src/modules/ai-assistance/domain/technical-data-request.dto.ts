import { AppError } from "../../../shared/domain/app-error";

export interface TechnicalDataSuggestionInput {
  requestedDescription: string;
  supplierDescription?: string;
  existingAttributes: Record<string, string>;
}

export interface TechnicalDataBatchSuggestionInput extends TechnicalDataSuggestionInput {
  itemId: string;
}

export type TechnicalDataJobInput =
  | { mode: "single"; payload: TechnicalDataSuggestionInput }
  | { mode: "batch"; payload: { items: TechnicalDataBatchSuggestionInput[] } };

export class TechnicalDataRequestDto {
  private constructor(private readonly input: TechnicalDataSuggestionInput) {}

  public static create(value: unknown): TechnicalDataRequestDto {
    return new TechnicalDataRequestDto(this.parseItem(value));
  }

  public static parseItem(value: unknown): TechnicalDataSuggestionInput {
    if (!value || typeof value !== "object") {
      throw new AppError("Invalid request body.", 400, "INVALID_TECHNICAL_DATA_REQUEST");
    }
    const body = value as Record<string, unknown>;
    const requestedDescription = this.text(body.requestedDescription).slice(0, 2000);
    const supplierDescription = this.text(body.supplierDescription).slice(0, 2000) || undefined;
    if (!requestedDescription && !supplierDescription) {
      throw new AppError(
        "At least one product description is required.",
        400,
        "PRODUCT_DESCRIPTION_REQUIRED",
      );
    }
    const existingAttributes = body.existingAttributes &&
      typeof body.existingAttributes === "object" &&
      !Array.isArray(body.existingAttributes)
      ? Object.fromEntries(
          Object.entries(body.existingAttributes as Record<string, unknown>)
            .filter((entry): entry is [string, string] => typeof entry[1] === "string")
            .map(([key, item]) => [key.trim(), item.trim()])
            .filter(([key, item]) => Boolean(key && item))
            .slice(0, 50),
        )
      : {};
    return { requestedDescription, supplierDescription, existingAttributes };
  }

  public toJobInput(): TechnicalDataJobInput {
    return { mode: "single", payload: this.input };
  }

  private static text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }
}

export class TechnicalDataBatchRequestDto {
  private constructor(private readonly items: TechnicalDataBatchSuggestionInput[]) {}

  public static create(value: unknown): TechnicalDataBatchRequestDto {
    if (!value || typeof value !== "object") {
      throw new AppError("Invalid request body.", 400, "INVALID_TECHNICAL_DATA_REQUEST");
    }
    const rawItems = (value as Record<string, unknown>).items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new AppError("At least one item is required.", 400, "TECHNICAL_ITEMS_REQUIRED");
    }
    if (rawItems.length > 50) {
      throw new AppError("A maximum of 50 items is allowed per request.", 400, "TOO_MANY_TECHNICAL_ITEMS");
    }
    const ids = new Set<string>();
    const items = rawItems.map((raw, index) => {
      if (!raw || typeof raw !== "object") {
        throw new AppError(`Item ${index} must be an object.`, 400, "INVALID_TECHNICAL_ITEM");
      }
      const itemId = typeof (raw as Record<string, unknown>).itemId === "string"
        ? String((raw as Record<string, unknown>).itemId).trim()
        : "";
      if (!itemId) throw new AppError("Every item requires itemId.", 400, "TECHNICAL_ITEM_ID_REQUIRED");
      if (ids.has(itemId)) {
        throw new AppError(`Duplicate itemId: ${itemId}.`, 400, "DUPLICATE_TECHNICAL_ITEM_ID");
      }
      ids.add(itemId);
      return { itemId, ...TechnicalDataRequestDto.parseItem(raw) };
    });
    return new TechnicalDataBatchRequestDto(items);
  }

  public toJobInput(): TechnicalDataJobInput {
    return { mode: "batch", payload: { items: this.items } };
  }
}

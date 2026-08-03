import { AppError } from "../../../shared/domain/app-error";

const CATALOG_TYPES = new Set([
  "VALIDITY_DAYS",
  "PAYMENT_TERMS",
  "COMMERCIAL_CONDITIONS",
  "DELIVERY_TIME",
  "REVISION_REASON",
  "REJECTION_REASON",
  "CANCELLATION_REASON",
  "APPROVAL_RETURN_REASON",
  "PURCHASE_BRAND",
  "ORIGIN_RESTRICTION",
  "DELIVERY_STATE",
]);

export interface CatalogCodeSuggestionInput {
  type: string;
  label: string;
  existingCodes: string[];
}

export class CatalogCodeRequestDto {
  private constructor(private readonly input: CatalogCodeSuggestionInput) {}

  public static create(value: unknown): CatalogCodeRequestDto {
    if (!value || typeof value !== "object") {
      throw new AppError("Body invalido.", 400, "INVALID_CATALOG_CODE_REQUEST");
    }
    const body = value as Record<string, unknown>;
    const type = typeof body.type === "string" ? body.type.trim().toUpperCase() : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!CATALOG_TYPES.has(type)) throw new AppError("type es invalido.", 400, "INVALID_CATALOG_TYPE");
    if (!label || label.length > 260) {
      throw new AppError(
        "label debe contener entre 1 y 260 caracteres.",
        400,
        "INVALID_CATALOG_LABEL",
      );
    }
    const existingCodes = Array.isArray(body.existingCodes)
      ? [...new Set(body.existingCodes
          .filter((code): code is string => typeof code === "string")
          .map((code) => code.trim().toUpperCase())
          .filter(Boolean))].slice(0, 200)
      : [];
    return new CatalogCodeRequestDto({ type, label, existingCodes });
  }

  public toJobInput(): CatalogCodeSuggestionInput {
    return { ...this.input, existingCodes: [...this.input.existingCodes] };
  }
}

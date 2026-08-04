import { AppError } from "../../../shared/domain/app-error";

export interface SemanticSearchRequestProps {
  query: string;
  branchCode: string | null;
  warehouseCodes: string[];
  authorizedWarehouseCodes: string[];
  candidateTopK: number;
  limit: number;
  filters: Record<string, string>;
}

export class SemanticSearchRequestDto {
  private static readonly filterFields = new Set([
    "category",
    "subcategory",
    "product",
    "tipo",
    "subtipo",
    "material",
    "diameter",
    "ced",
    "costura",
    "termino",
    "acabado",
    "figura",
    "radio",
    "angulo",
    "grado",
    "presion",
    "unit",
  ]);

  private constructor(public readonly props: SemanticSearchRequestProps) {}

  public static fromVectorSearch(input: unknown): SemanticSearchRequestDto {
    const body = this.body(input);
    const query = this.query(body.query);
    const limit = this.integer(body.topK, 10, 1, 25, "topK");
    const candidateTopK = this.integer(
      body.candidateTopK,
      Math.min(Math.max(limit * 10, 100), 200),
      limit,
      200,
      "candidateTopK",
    );
    const branchCode = this.branchCode(body.branchCode, false);
    return new SemanticSearchRequestDto({
      query,
      branchCode,
      warehouseCodes: branchCode ? [branchCode] : [],
      authorizedWarehouseCodes: branchCode ? [branchCode] : [],
      candidateTopK,
      limit,
      filters: this.filters(body.filters),
    });
  }

  public static fromQuoteSearch(input: unknown): SemanticSearchRequestDto {
    const body = this.body(input);
    const branchInput = body.branchCode ?? body.branch_code;
    const warehouseCodes = this.warehouseCodes(body.warehouseCodes ?? body.warehouse_codes);
    const requestedAuthorizedCodes = this.warehouseCodes(
      body.authorizedWarehouseCodes ?? body.authorized_warehouse_codes,
    );
    const branchCode = warehouseCodes[0] ?? this.branchCode(branchInput, true)!;
    const resolvedWarehouseCodes = warehouseCodes.length > 0 ? warehouseCodes : [branchCode];
    const authorizedWarehouseCodes = requestedAuthorizedCodes.length > 0
      ? requestedAuthorizedCodes
      : resolvedWarehouseCodes;
    if (authorizedWarehouseCodes.some((code) => !resolvedWarehouseCodes.includes(code))) {
      throw new AppError(
        "Every authorized warehouse must be included in warehouseCodes.",
        400,
        "INVALID_AUTHORIZED_WAREHOUSES",
      );
    }
    const candidateInput = body.topK ?? body.top_k;
    return new SemanticSearchRequestDto({
      query: this.query(body.query),
      branchCode,
      warehouseCodes: resolvedWarehouseCodes,
      authorizedWarehouseCodes,
      candidateTopK: this.integer(candidateInput, 30, 5, 50, "topK"),
      limit: this.integer(body.limit, 10, 1, 20, "limit"),
      filters: this.filters(body.filters),
    });
  }

  private static body(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new AppError("Invalid request body.", 400, "INVALID_SEMANTIC_SEARCH_BODY");
    }
    return input as Record<string, unknown>;
  }

  private static query(value: unknown): string {
    const query = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
    if (query.length < 2) {
      throw new AppError("'query' is required and must contain at least 2 characters.", 400, "QUERY_REQUIRED");
    }
    return query;
  }

  private static branchCode(value: unknown, required: boolean): string | null {
    const branchCode = typeof value === "string" ? value.trim() : "";
    if (!branchCode && !required) return null;
    if (!/^\d{2}$/.test(branchCode)) {
      throw new AppError(
        "'branchCode' is required and must contain 2 digits (for example, 01).",
        400,
        "INVALID_BRANCH_CODE",
      );
    }
    return branchCode;
  }

  private static warehouseCodes(value: unknown): string[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.length === 0 || value.length > 25) {
      throw new AppError(
        "'warehouseCodes' must be a non-empty array with a maximum of 25 values.",
        400,
        "INVALID_WAREHOUSE_CODES",
      );
    }
    const codes = value.map((item) => {
      const code = typeof item === "string" ? item.trim() : "";
      if (!/^\d{1,4}$/.test(code)) {
        throw new AppError(
          "Every warehouse code must contain between 1 and 4 digits.",
          400,
          "INVALID_WAREHOUSE_CODE",
        );
      }
      return code.padStart(2, "0");
    });
    return Array.from(new Set(codes));
  }

  private static integer(
    value: unknown,
    defaultValue: number,
    minimum: number,
    maximum: number,
    field: string,
  ): number {
    if (value === undefined || value === null || value === "") return defaultValue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || Math.trunc(parsed) < minimum || Math.trunc(parsed) > maximum) {
      throw new AppError(
        `'${field}' must be an integer between ${minimum} and ${maximum}.`,
        400,
        "INVALID_SEARCH_LIMIT",
      );
    }
    return Math.trunc(parsed);
  }

  private static filters(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const filters: Record<string, string> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (!this.filterFields.has(key) || typeof raw !== "string") continue;
      const normalized = raw
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase();
      if (normalized) filters[key] = normalized;
    }
    return filters;
  }
}

import { AppError } from "../../../shared/domain/app-error";
import { CATALOG_SEARCH_EVALUATION_CASES } from "../application/services/catalog-search-evaluation-cases";
import { CatalogSearchEvaluationJobInput } from "../application/use-cases/create-catalog-search-evaluation-job.use-case";

export class CatalogSearchEvaluationRequestDto {
  private constructor(private readonly input: CatalogSearchEvaluationJobInput) {}

  public static create(value: unknown): CatalogSearchEvaluationRequestDto {
    const body = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    if (body.caseIds === undefined || body.caseIds === null) {
      return new CatalogSearchEvaluationRequestDto({});
    }
    if (!Array.isArray(body.caseIds) || body.caseIds.some((id) => typeof id !== "string")) {
      throw new AppError("'caseIds' must be an array of strings.", 400, "INVALID_EVALUATION_CASES");
    }
    const caseIds = Array.from(new Set(body.caseIds.map((id) => id.trim()).filter(Boolean)));
    const known = new Set(CATALOG_SEARCH_EVALUATION_CASES.map((item) => item.id));
    const unknown = caseIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new AppError(
        `Unknown evaluation cases: ${unknown.join(", ")}.`,
        400,
        "INVALID_EVALUATION_CASES",
      );
    }
    return new CatalogSearchEvaluationRequestDto({ caseIds });
  }

  public toJobInput(): CatalogSearchEvaluationJobInput { return this.input; }
}

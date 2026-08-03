import { AppError } from "../../../shared/domain/app-error";
import { VectorCatalogSyncJobInput } from "../application/use-cases/create-vector-catalog-sync-job.use-case";

export class VectorCatalogSyncRequestDto {
  private constructor(private readonly value: VectorCatalogSyncJobInput) {}

  public static create(input: unknown): VectorCatalogSyncRequestDto {
    const body = input && typeof input === "object" && !Array.isArray(input)
      ? input as Record<string, unknown>
      : {};
    const rawMax = body.maxVariants;
    let maxVariants: number | undefined;
    if (rawMax !== undefined && rawMax !== null && rawMax !== "") {
      const parsed = Number(rawMax);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50_000) {
        throw new AppError(
          "'maxVariants' must be an integer between 1 and 50000.",
          400,
          "INVALID_MAX_VARIANTS",
        );
      }
      maxVariants = parsed;
    }
    return new VectorCatalogSyncRequestDto({
      ...(maxVariants ? { maxVariants } : {}),
      dryRun: body.dryRun === true,
      deleteStale: body.deleteStale !== false,
    });
  }

  public toJobInput(): VectorCatalogSyncJobInput {
    return this.value;
  }
}

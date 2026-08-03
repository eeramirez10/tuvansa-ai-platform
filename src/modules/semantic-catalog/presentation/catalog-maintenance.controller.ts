import { Request, Response } from "express";
import { CreateVectorCatalogSyncJobUseCase } from "../application/use-cases/create-vector-catalog-sync-job.use-case";
import { VectorCatalogSyncRequestDto } from "./vector-catalog-sync-request.dto";
import { AppError } from "../../../shared/domain/app-error";

export class CatalogMaintenanceController {
  constructor(
    private readonly createSyncJob: CreateVectorCatalogSyncJobUseCase,
    private readonly configured: boolean,
  ) {}

  public createSync = async (req: Request, res: Response): Promise<void> => {
    if (!this.configured) {
      throw new AppError("Catalog synchronization is not configured.", 503, "CATALOG_SYNC_UNAVAILABLE");
    }
    const input = VectorCatalogSyncRequestDto.create(req.body).toJobInput();
    const idempotencyKey = req.header("idempotency-key") ?? req.header("x-idempotency-key") ?? undefined;
    const creation = await this.createSyncJob.execute(input, idempotencyKey);
    res.status(creation.created ? 202 : 200).json({
      message: input.dryRun
        ? "Catalog synchronization dry run queued."
        : "Catalog synchronization queued.",
      job_id: creation.job.id,
      status: creation.job.status,
      created_at: creation.job.createdAt,
      deduplicated: !creation.created,
    });
  };
}

import { Request, Response } from "express";
import { CATALOG_SEARCH_EVALUATION_CASES } from "../application/services/catalog-search-evaluation-cases";
import { CreateCatalogSearchEvaluationJobUseCase } from "../application/use-cases/create-catalog-search-evaluation-job.use-case";
import { CatalogSearchEvaluationRequestDto } from "./catalog-search-evaluation-request.dto";

export class CatalogSearchEvaluationController {
  constructor(private readonly createJob: CreateCatalogSearchEvaluationJobUseCase) {}

  public listCases = (_req: Request, res: Response): void => {
    res.status(200).json({
      count: CATALOG_SEARCH_EVALUATION_CASES.length,
      items: CATALOG_SEARCH_EVALUATION_CASES.map((item) => ({ ...item })),
    });
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const input = CatalogSearchEvaluationRequestDto.create(req.body).toJobInput();
    const idempotencyKey = req.header("idempotency-key") ?? req.header("x-idempotency-key") ?? undefined;
    const creation = await this.createJob.execute(input, idempotencyKey);
    const job = {
      id: creation.job.id,
      status: creation.job.status,
      progress: creation.job.progress,
      createdAt: creation.job.createdAt,
    };
    res.status(creation.created ? 202 : 200).json({
      message: "Catalog search evaluation queued.",
      job_id: creation.job.id,
      status: creation.job.status,
      created_at: creation.job.createdAt,
      deduplicated: !creation.created,
      job,
    });
  };
}

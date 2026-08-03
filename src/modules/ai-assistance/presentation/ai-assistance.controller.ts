import { Request, Response } from "express";
import { CreateStructuredAiJobUseCase } from "../application/use-cases/create-structured-ai-job.use-case";
import { WaitForAiJobResultUseCase } from "../application/use-cases/wait-for-ai-job-result.use-case";
import { CatalogCodeRequestDto } from "../domain/catalog-code-request.dto";
import { MissingProductsRequestDto } from "../domain/missing-products-request.dto";
import {
  TechnicalDataBatchRequestDto,
  TechnicalDataRequestDto,
} from "../domain/technical-data-request.dto";
import { AiJobType } from "../../job-management/domain/ai-job.entity";

export class AiAssistanceController {
  constructor(
    private readonly createJob: CreateStructuredAiJobUseCase,
    private readonly waitForResult: WaitForAiJobResultUseCase,
  ) {}

  public createMissingProductsJob = async (req: Request, res: Response): Promise<void> => {
    const input = MissingProductsRequestDto.create(req.body).toJobInput();
    this.respondCreated(res, await this.createJob.execute(AiJobType.MISSING_PRODUCT_NORMALIZATION, input));
  };

  public normalizeMissingProducts = async (req: Request, res: Response): Promise<void> => {
    const input = MissingProductsRequestDto.create(req.body).toJobInput();
    await this.respondWithResult(res, AiJobType.MISSING_PRODUCT_NORMALIZATION, input);
  };

  public createTechnicalDataJob = async (req: Request, res: Response): Promise<void> => {
    const input = TechnicalDataRequestDto.create(req.body).toJobInput();
    this.respondCreated(res, await this.createJob.execute(AiJobType.TECHNICAL_DATA_SUGGESTION, input));
  };

  public suggestTechnicalData = async (req: Request, res: Response): Promise<void> => {
    const input = TechnicalDataRequestDto.create(req.body).toJobInput();
    await this.respondWithResult(res, AiJobType.TECHNICAL_DATA_SUGGESTION, input);
  };

  public createTechnicalDataBatchJob = async (req: Request, res: Response): Promise<void> => {
    const input = TechnicalDataBatchRequestDto.create(req.body).toJobInput();
    this.respondCreated(res, await this.createJob.execute(AiJobType.TECHNICAL_DATA_SUGGESTION, input));
  };

  public suggestTechnicalDataBatch = async (req: Request, res: Response): Promise<void> => {
    const input = TechnicalDataBatchRequestDto.create(req.body).toJobInput();
    await this.respondWithResult(res, AiJobType.TECHNICAL_DATA_SUGGESTION, input);
  };

  public createCatalogCodeJob = async (req: Request, res: Response): Promise<void> => {
    const input = CatalogCodeRequestDto.create(req.body).toJobInput();
    this.respondCreated(res, await this.createJob.execute(AiJobType.QUOTE_CATALOG_CODE_SUGGESTION, input));
  };

  public suggestCatalogCode = async (req: Request, res: Response): Promise<void> => {
    const input = CatalogCodeRequestDto.create(req.body).toJobInput();
    await this.respondWithResult(res, AiJobType.QUOTE_CATALOG_CODE_SUGGESTION, input);
  };

  private async respondWithResult(res: Response, type: AiJobType, input: unknown): Promise<void> {
    const creation = await this.createJob.execute(type, input);
    const result = await this.waitForResult.execute(creation.job.id);
    res.status(200).json(result);
  }

  private respondCreated(
    res: Response,
    creation: Awaited<ReturnType<CreateStructuredAiJobUseCase["execute"]>>,
  ): void {
    res.status(creation.created ? 202 : 200).json({
      job_id: creation.job.id,
      status: creation.job.status,
      created_at: creation.job.createdAt,
      deduplicated: !creation.created,
    });
  }
}

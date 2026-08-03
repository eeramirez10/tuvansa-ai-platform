import { Request, Response } from "express";
import { CreateDocumentExtractionJobUseCase } from "../application/use-cases/create-document-extraction-job.use-case";
import { CreateTextExtractionJobUseCase, TextExtractionSource } from "../application/use-cases/create-text-extraction-job.use-case";
import { GetAiJobUseCase } from "../../job-management/application/use-cases/get-ai-job.use-case";
import { AiJobStatus } from "../../job-management/domain/ai-job.entity";
import { AiJobType } from "../../job-management/domain/ai-job.entity";

const SOURCES = new Set<TextExtractionSource>(["email", "whatsapp", "manual", "ai_assistant"]);

export class ExtractionJobsController {
  constructor(
    private readonly createTextJob: CreateTextExtractionJobUseCase,
    private readonly createDocumentJob: CreateDocumentExtractionJobUseCase,
    private readonly getJob: GetAiJobUseCase,
  ) {}

  public createFromText = async (req: Request, res: Response): Promise<void> => {
    const rawSource = typeof req.body?.source === "string" ? req.body.source.toLowerCase() : "manual";
    const source = SOURCES.has(rawSource as TextExtractionSource)
      ? rawSource as TextExtractionSource
      : "manual";
    const creation = await this.createTextJob.execute({
      text: typeof req.body?.text === "string" ? req.body.text : "",
      source,
    });
    this.respondCreated(res, creation);
  };

  public createFromDocument = async (req: Request, res: Response): Promise<void> => {
    await this.createFileJob(req, res, AiJobType.QUOTE_DOCUMENT_EXTRACTION);
  };

  public createFromQuotedExcel = async (req: Request, res: Response): Promise<void> => {
    await this.createFileJob(req, res, AiJobType.QUOTED_EXCEL_EXTRACTION);
  };

  public createFromSupplierQuote = async (req: Request, res: Response): Promise<void> => {
    await this.createFileJob(req, res, AiJobType.SUPPLIER_QUOTE_EXTRACTION);
  };

  private createFileJob = async (
    req: Request,
    res: Response,
    type: AiJobType,
  ): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "File is required in the 'file' field.", code: "FILE_REQUIRED" });
      return;
    }
    const creation = await this.createDocumentJob.execute({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    }, type);
    this.respondCreated(res, creation);
  };

  public status = async (req: Request, res: Response): Promise<void> => {
    const job = await this.getJob.execute(String(req.params.id));
    res.json({
      job_id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      error_code: job.errorCode,
      error: job.errorMessage,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    });
  };

  public result = async (req: Request, res: Response): Promise<void> => {
    const job = await this.getJob.execute(String(req.params.id));
    if (job.status !== AiJobStatus.COMPLETED) {
      res.status(202).json({
        job_id: job.id,
        status: job.status,
        error_code: job.errorCode,
        error: job.errorMessage,
        message: "Processing is not complete.",
      });
      return;
    }
    res.json({ job_id: job.id, status: job.status, result: job.result });
  };

  private respondCreated(res: Response, creation: Awaited<ReturnType<CreateTextExtractionJobUseCase["execute"]>>): void {
    res.status(creation.created ? 202 : 200).json({
      job_id: creation.job.id,
      status: creation.job.status,
      created_at: creation.job.createdAt,
      deduplicated: !creation.created,
    });
  }
}

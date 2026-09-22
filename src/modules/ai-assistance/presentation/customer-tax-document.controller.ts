import type { Request, Response } from "express";
import type { ExtractCustomerTaxDocumentUseCase } from "../application/use-cases/extract-customer-tax-document.use-case";

export class CustomerTaxDocumentController {
  constructor(private readonly useCase: ExtractCustomerTaxDocumentUseCase) {}

  extract = async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "El archivo PDF es obligatorio.", code: "FILE_REQUIRED" });
      return;
    }
    const result = await this.useCase.execute({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    });
    res.status(200).json(result);
  };
}

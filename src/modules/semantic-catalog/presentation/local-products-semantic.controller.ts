import { Request, Response } from "express";
import {
  LocalProductInput,
  LocalProductSemanticUseCase,
} from "../application/use-cases/local-product-semantic.use-case";
import { AppError } from "../../../shared/domain/app-error";

export class LocalProductsSemanticController {
  constructor(private readonly localProducts: LocalProductSemanticUseCase) {}

  public search = async (req: Request, res: Response): Promise<void> => {
    const description = this.required(req.body?.description, "description");
    const unit = this.required(req.body?.unit, "unit");
    const topK = this.topK(req.body?.topK);
    const items = await this.localProducts.search(description, unit, topK);
    res.status(200).json({ description, unit, items });
  };

  public upsert = async (req: Request, res: Response): Promise<void> => {
    const productId = this.required(req.params.productId, "productId");
    await this.localProducts.upsert({
      productId,
      description: this.required(req.body?.description, "description"),
      unit: this.required(req.body?.unit, "unit"),
      branchId: this.optional(req.body?.branchId),
    });
    res.status(200).json({ indexed: true, productId });
  };

  public sync = async (req: Request, res: Response): Promise<void> => {
    const rawProducts: unknown[] = Array.isArray(req.body?.products) ? req.body.products : [];
    if (rawProducts.length < 1 || rawProducts.length > 200) {
      throw new AppError(
        "'products' must contain between 1 and 200 items.",
        400,
        "INVALID_LOCAL_PRODUCT_BATCH",
      );
    }
    const products = rawProducts.map((raw, index) => this.product(raw, index));
    await this.localProducts.upsertMany(products);
    res.status(200).json({ indexed: products.length });
  };

  public remove = async (req: Request, res: Response): Promise<void> => {
    await this.localProducts.delete(this.required(req.params.productId, "productId"));
    res.status(204).send();
  };

  private product(input: unknown, index: number): LocalProductInput {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new AppError(
        `Invalid local product at index ${index}.`,
        400,
        "INVALID_LOCAL_PRODUCT",
      );
    }
    const row = input as Record<string, unknown>;
    return {
      productId: this.required(row.productId, `products[${index}].productId`),
      description: this.required(row.description, `products[${index}].description`),
      unit: this.required(row.unit, `products[${index}].unit`),
      branchId: this.optional(row.branchId),
    };
  }

  private required(value: unknown, field: string): string {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      throw new AppError(`'${field}' is required.`, 400, "LOCAL_PRODUCT_FIELD_REQUIRED");
    }
    return text;
  }

  private optional(value: unknown): string | null {
    const text = typeof value === "string" ? value.trim() : "";
    return text || null;
  }

  private topK(value: unknown): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : 8;
  }
}

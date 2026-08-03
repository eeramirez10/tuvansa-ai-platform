import { Router } from "express";
import { AiAssistanceController } from "./ai-assistance.controller";

export class AiAssistanceRoutes {
  constructor(private readonly controller: AiAssistanceController) {}

  public build(): Router {
    const router = Router();

    router.post("/v1/assistance/missing-products/normalize", this.controller.createMissingProductsJob);
    router.post("/v1/assistance/technical-data/suggest", this.controller.createTechnicalDataJob);
    router.post("/v1/assistance/technical-data/suggest-batch", this.controller.createTechnicalDataBatchJob);
    router.post("/v1/assistance/quote-catalogs/suggest-code", this.controller.createCatalogCodeJob);

    // Compatibility routes keep the current frontend synchronous while the worker owns OpenAI calls.
    router.post("/products/normalize-missing", this.controller.normalizeMissingProducts);
    router.post("/procurement/technical-data/suggest", this.controller.suggestTechnicalData);
    router.post("/procurement/technical-data/suggest-batch", this.controller.suggestTechnicalDataBatch);
    router.post("/quote-catalogs/suggest-code", this.controller.suggestCatalogCode);

    return router;
  }
}

import { Router } from "express";
import { LocalProductsSemanticController } from "./local-products-semantic.controller";
import { SemanticCatalogController } from "./semantic-catalog.controller";

export class SemanticCatalogRoutes {
  constructor(
    private readonly catalogController: SemanticCatalogController,
    private readonly localProductsController: LocalProductsSemanticController,
  ) {}

  public buildPublic(): Router {
    const router = Router();
    router.post("/v1/catalog/search/hybrid", this.catalogController.hybridVectorSearch);
    router.post("/v1/catalog/search/semantic", this.catalogController.vectorSearch);
    router.post("/vector-catalog/search", this.catalogController.hybridVectorSearch);
    router.post("/vector-catalog/search/semantic", this.catalogController.vectorSearch);
    router.post("/ai/products/similar-v2", this.catalogController.hybridQuoteSearch);
    router.post("/ai/products/similar-v2/semantic", this.catalogController.quoteSearch);
    return router;
  }

  public buildLocalProducts(): Router {
    const router = Router();
    router.post("/search", this.localProductsController.search);
    router.post("/sync", this.localProductsController.sync);
    router.put("/:productId", this.localProductsController.upsert);
    router.delete("/:productId", this.localProductsController.remove);
    return router;
  }
}

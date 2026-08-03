import { Request, Response, Router } from "express";
import { ApiConfig } from "../config/envs";
import { LocalProductSemanticUseCase } from "../modules/semantic-catalog/application/use-cases/local-product-semantic.use-case";
import { SearchSemanticCatalogUseCase } from "../modules/semantic-catalog/application/use-cases/search-semantic-catalog.use-case";
import { ErpProductAvailabilityHttpAdapter } from "../modules/semantic-catalog/infrastructure/erp-product-availability-http.adapter";
import { PineconeVectorIndexAdapter } from "../modules/semantic-catalog/infrastructure/pinecone-vector-index.adapter";
import { VoyageTextEmbeddingAdapter } from "../modules/semantic-catalog/infrastructure/voyage-text-embedding.adapter";
import { LocalProductsSemanticController } from "../modules/semantic-catalog/presentation/local-products-semantic.controller";
import { SemanticCatalogController } from "../modules/semantic-catalog/presentation/semantic-catalog.controller";
import { SemanticCatalogRoutes } from "../modules/semantic-catalog/presentation/semantic-catalog.routes";

export interface SemanticCatalogRuntime {
  enabled: boolean;
  publicRoutes: Router;
  localProductRoutes: Router;
}

export function composeSemanticCatalog(config: ApiConfig): SemanticCatalogRuntime {
  if (!config.pineconeApiKey || !config.voyageApiKey) {
    return {
      enabled: false,
      publicRoutes: unavailablePublicRoutes(),
      localProductRoutes: unavailableLocalProductRoutes(),
    };
  }

  const embeddings = new VoyageTextEmbeddingAdapter(
    config.voyageApiKey,
    config.voyageModel,
    config.voyageDimension,
    config.voyageMinRequestIntervalMs,
  );
  const catalogIndex = new PineconeVectorIndexAdapter(
    config.pineconeApiKey,
    config.pineconeCatalogIndex,
    config.pineconeCatalogVariantsNamespace,
  );
  const localProductsIndex = new PineconeVectorIndexAdapter(
    config.pineconeApiKey,
    config.pineconeCatalogIndex,
    config.pineconeLocalProductsNamespace,
  );
  const availability = new ErpProductAvailabilityHttpAdapter(
    config.erpProductsBaseUrl,
    config.erpProductsTimeoutMs,
    config.erpProductsApiKey,
  );
  const catalogController = new SemanticCatalogController(
    new SearchSemanticCatalogUseCase(embeddings, catalogIndex, availability),
    config.pineconeCatalogIndex,
  );
  const localProductsController = new LocalProductsSemanticController(
    new LocalProductSemanticUseCase(embeddings, localProductsIndex),
  );
  const routes = new SemanticCatalogRoutes(catalogController, localProductsController);

  return {
    enabled: true,
    publicRoutes: routes.buildPublic(),
    localProductRoutes: routes.buildLocalProducts(),
  };
}

function unavailable(_req: Request, res: Response): void {
  res.status(503).json({
    error: "Semantic catalog is not configured.",
    code: "SEMANTIC_CATALOG_UNAVAILABLE",
  });
}

function unavailablePublicRoutes(): Router {
  const router = Router();
  router.post("/v1/catalog/search/hybrid", unavailable);
  router.post("/v1/catalog/search/semantic", unavailable);
  router.post("/vector-catalog/search", unavailable);
  router.post("/vector-catalog/search/semantic", unavailable);
  router.post("/ai/products/similar-v2", unavailable);
  router.post("/ai/products/similar-v2/semantic", unavailable);
  return router;
}

function unavailableLocalProductRoutes(): Router {
  const router = Router();
  router.use(unavailable);
  return router;
}

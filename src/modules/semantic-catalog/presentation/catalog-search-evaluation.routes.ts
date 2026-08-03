import { Router } from "express";
import { CatalogSearchEvaluationController } from "./catalog-search-evaluation.controller";

export class CatalogSearchEvaluationRoutes {
  constructor(private readonly controller: CatalogSearchEvaluationController) {}

  public build(): Router {
    const router = Router();
    router.get("/v1/catalog/evaluation/cases", this.controller.listCases);
    router.post("/v1/catalog/evaluation-jobs", this.controller.create);
    router.get("/vector-catalog/evaluation/cases", this.controller.listCases);
    router.post("/vector-catalog/evaluation/run", this.controller.create);
    return router;
  }
}

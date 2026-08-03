import { Router } from "express";
import { CatalogMaintenanceController } from "./catalog-maintenance.controller";

export class CatalogMaintenanceRoutes {
  constructor(private readonly controller: CatalogMaintenanceController) {}

  public build(): Router {
    const router = Router();
    router.post("/v1/catalog/index-jobs", this.controller.createSync);
    router.post("/catalog-variants/sync", this.controller.createSync);
    return router;
  }
}

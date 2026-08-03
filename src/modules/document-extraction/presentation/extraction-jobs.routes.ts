import { Router } from "express";
import multer from "multer";
import { ExtractionJobsController } from "./extraction-jobs.controller";

export class ExtractionJobsRoutes {
  constructor(
    private readonly controller: ExtractionJobsController,
    private readonly maxFileSizeBytes: number,
  ) {}

  public buildV1(): Router {
    const router = Router();
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: this.maxFileSizeBytes, files: 1 },
    });

    router.post("/v1/extractions/text", this.controller.createFromText);
    router.post("/v1/extractions/documents", upload.single("file"), this.controller.createFromDocument);
    router.post("/v1/extractions/quoted-excel", upload.single("file"), this.controller.createFromQuotedExcel);
    router.post("/v1/extractions/supplier-quotes", upload.single("file"), this.controller.createFromSupplierQuote);
    router.get("/v1/jobs/:id", this.controller.status);
    router.get("/v1/jobs/:id/result", this.controller.result);

    return router;
  }

  public buildCompatibility(): Router {
    const router = Router();
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: this.maxFileSizeBytes, files: 1 },
    });

    // Compatibility aliases used by the current frontend.
    router.post("/extract/jobs/text", this.controller.createFromText);
    router.post("/extract", upload.single("file"), this.controller.extractDocument);
    router.post("/extract/jobs", upload.single("file"), this.controller.createFromDocument);
    router.post("/extract/jobs/quoted-excel", upload.single("file"), this.controller.createFromQuotedExcel);
    router.post("/extract/jobs/supplier-quote", upload.single("file"), this.controller.createFromSupplierQuote);
    router.get("/extract/jobs/:id/status", this.controller.status);
    router.get("/extract/jobs/:id/result", this.controller.result);

    return router;
  }
}

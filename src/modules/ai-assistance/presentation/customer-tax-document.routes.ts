import { Router } from "express";
import multer from "multer";
import type { CustomerTaxDocumentController } from "./customer-tax-document.controller";

export class CustomerTaxDocumentRoutes {
  constructor(private readonly controller: CustomerTaxDocumentController, private readonly maxFileSizeBytes: number) {}

  build(): Router {
    const router = Router();
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: this.maxFileSizeBytes, files: 1 } });
    router.post("/v1/assistance/customer-tax-document/extract", upload.single("file"), this.controller.extract);
    return router;
  }
}

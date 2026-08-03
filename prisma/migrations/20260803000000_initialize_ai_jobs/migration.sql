CREATE TYPE "AiJobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed', 'cancelled', 'needs_review');
CREATE TYPE "AiJobType" AS ENUM ('quote_text_extraction', 'quote_document_extraction', 'quoted_excel_extraction', 'supplier_quote_extraction', 'semantic_search', 'vector_catalog_sync', 'technical_data_suggestion');

CREATE TABLE "ai_jobs" (
  "id" TEXT NOT NULL,
  "type" "AiJobType" NOT NULL,
  "status" "AiJobStatus" NOT NULL DEFAULT 'queued',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "idempotency_key" TEXT NOT NULL,
  "input_hash" TEXT NOT NULL,
  "input_json" JSONB NOT NULL,
  "result_json" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "prompt_version" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_job_runs" (
  "id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "prompt_version" TEXT,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "latency_ms" INTEGER,
  "succeeded" BOOLEAN NOT NULL,
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_job_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_jobs_idempotency_key_key" ON "ai_jobs"("idempotency_key");
CREATE INDEX "ai_jobs_status_created_at_idx" ON "ai_jobs"("status", "created_at");
CREATE INDEX "ai_jobs_type_created_at_idx" ON "ai_jobs"("type", "created_at");
CREATE INDEX "ai_job_runs_job_id_attempt_idx" ON "ai_job_runs"("job_id", "attempt");
ALTER TABLE "ai_job_runs" ADD CONSTRAINT "ai_job_runs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "ai_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

import { AiJobRepository } from "../../../job-management/application/ports/ai-job.repository";
import { AiJobType } from "../../../job-management/domain/ai-job.entity";
import { QuoteTextExtractorPort } from "../ports/quote-text-extractor.port";

interface TextJobInput {
  text: string;
  source: string;
}

export class ProcessTextExtractionJobUseCase {
  constructor(
    private readonly repository: AiJobRepository,
    private readonly extractor: QuoteTextExtractorPort,
  ) {}

  public async execute(jobId: string): Promise<void> {
    const job = await this.repository.markProcessing(jobId, 10);
    if (!job) return;
    if (job.type !== AiJobType.QUOTE_TEXT_EXTRACTION) {
      throw new Error(`Unsupported job type: ${job.type}`);
    }

    const input = this.parseInput(job.input);
    await this.repository.updateProgress(jobId, 35);
    const startedAt = Date.now();

    try {
      const extraction = await this.extractor.extract(input.text);
      await this.repository.updateProgress(jobId, 90);
      const result = {
        file_name: `TEXT_${input.source}`,
        file_type: "text",
        source: input.source,
        items_count: extraction.items.length,
        items: extraction.items.map((item) => item.toPrimitives()),
      };

      await this.repository.recordRun({
        jobId,
        attempt: job.attempts,
        provider: extraction.usage.provider,
        model: extraction.usage.model,
        promptVersion: job.promptVersion ?? undefined,
        inputTokens: extraction.usage.inputTokens,
        outputTokens: extraction.usage.outputTokens,
        latencyMs: extraction.usage.latencyMs,
        succeeded: true,
      });
      await this.repository.markCompleted(jobId, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown extraction error.";
      await this.repository.recordRun({
        jobId,
        attempt: job.attempts,
        provider: "openai",
        model: "unknown",
        promptVersion: job.promptVersion ?? undefined,
        latencyMs: Date.now() - startedAt,
        succeeded: false,
        errorCode: "QUOTE_TEXT_EXTRACTION_FAILED",
        errorMessage: message,
      });
      throw error;
    }
  }

  private parseInput(input: unknown): TextJobInput {
    if (!input || typeof input !== "object") throw new Error("Invalid job input.");
    const candidate = input as Record<string, unknown>;
    const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
    const source = typeof candidate.source === "string" ? candidate.source : "manual";
    if (!text) throw new Error("Job text is empty.");
    return { text, source };
  }
}

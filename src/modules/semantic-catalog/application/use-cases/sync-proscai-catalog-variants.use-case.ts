import { CatalogVariantVectorDocumentMapper } from "../mappers/catalog-variant-vector-document.mapper";
import { ManageableVectorIndexPort } from "../ports/vector-index.port";
import { TextEmbeddingPort } from "../ports/text-embedding.port";
import { VectorMetadata } from "../../domain/semantic-catalog.types";
import { BuildProscaiCatalogVariantsUseCase } from "./build-proscai-catalog-variants.use-case";

export interface SyncCatalogVariantsInput {
  maxVariants?: number;
  dryRun?: boolean;
  deleteStale?: boolean;
  onProgress?: (result: SyncCatalogVariantsResult) => void | Promise<void>;
}

export interface SyncCatalogVariantsResult {
  namespace: string;
  sourceUpdatedAt?: string;
  totalVariants: number;
  eligible: number;
  reviewVariants: number;
  excludedInactive: number;
  unchanged: number;
  changed: number;
  embedded: number;
  upserted: number;
  stale: number;
  deleted: number;
  dryRun: boolean;
  fullReconciliation: boolean;
}

export class SyncProscaiCatalogVariantsUseCase {
  private static readonly DOCUMENT_BATCH_SIZE = 500;
  private static readonly METADATA_FETCH_BATCH_SIZE = 50;
  private static readonly VECTOR_BATCH_SIZE = 32;
  private static readonly DELETE_BATCH_SIZE = 500;
  private static readonly MAX_OPERATION_ATTEMPTS = 3;

  constructor(
    private readonly buildVariants: BuildProscaiCatalogVariantsUseCase,
    private readonly embeddings: TextEmbeddingPort,
    private readonly vectorIndex: ManageableVectorIndexPort,
    private readonly embeddingModel: string,
    private readonly namespace: string,
  ) {}

  public async execute(input: SyncCatalogVariantsInput = {}): Promise<SyncCatalogVariantsResult> {
    const projection = await this.buildVariants.execute(true);
    const activeVariants = projection.variants.filter((variant) => {
      const canonical = variant.sourceRecords.find((record) => record.icod === variant.canonicalIcod);
      return canonical?.isActive ?? false;
    });
    const maxVariants = input.maxVariants ?? Number.POSITIVE_INFINITY;
    const selectedVariants = activeVariants.slice(0, maxVariants);
    const fullReconciliation = !Number.isFinite(maxVariants) && input.deleteStale !== false;
    const documents = selectedVariants.map((variant) => (
      CatalogVariantVectorDocumentMapper.toDocument(variant, this.embeddingModel)
    ));
    const result: SyncCatalogVariantsResult = {
      namespace: this.namespace,
      sourceUpdatedAt: projection.sourceUpdatedAt,
      totalVariants: projection.variants.length,
      eligible: activeVariants.length,
      reviewVariants: activeVariants.filter((variant) => variant.status === "REVIEW").length,
      excludedInactive: projection.variants.length - activeVariants.length,
      unchanged: 0,
      changed: 0,
      embedded: 0,
      upserted: 0,
      stale: 0,
      deleted: 0,
      dryRun: input.dryRun === true,
      fullReconciliation,
    };
    const indexedIds = await this.withRetry(() => this.vectorIndex.listIds("proscai-"));
    const indexedIdSet = new Set(indexedIds);
    let processedDocuments = 0;

    for (const documentBatch of this.chunk(documents, SyncProscaiCatalogVariantsUseCase.DOCUMENT_BATCH_SIZE)) {
      const existingMetadata = new Map<string, VectorMetadata>();
      const idsToFetch = documentBatch
        .map((document) => document.id)
        .filter((id) => indexedIdSet.has(id));

      for (const ids of this.chunk(idsToFetch, SyncProscaiCatalogVariantsUseCase.METADATA_FETCH_BATCH_SIZE)) {
        const metadata = await this.withRetry(() => this.vectorIndex.findMetadata(ids));
        for (const [id, value] of metadata) existingMetadata.set(id, value);
      }

      const changedDocuments = documentBatch.filter((document) => {
        const existing = existingMetadata.get(document.id);
        const unchanged = existing?.contentHash === document.metadata.contentHash
          && existing.embeddingModel === document.metadata.embeddingModel;
        if (unchanged) result.unchanged += 1;
        return !unchanged;
      });
      result.changed += changedDocuments.length;

      if (!result.dryRun) {
        await this.embedAndUpsert(changedDocuments, result, input.onProgress);
      }
      processedDocuments += documentBatch.length;
      await input.onProgress?.({ ...result });
    }

    if (fullReconciliation) {
      const currentIds = new Set(activeVariants.map((variant) => variant.variantId));
      const staleIds = indexedIds.filter((id) => !currentIds.has(id));
      result.stale = staleIds.length;
      if (!result.dryRun) {
        for (const batch of this.chunk(staleIds, SyncProscaiCatalogVariantsUseCase.DELETE_BATCH_SIZE)) {
          await this.withRetry(() => this.vectorIndex.delete(batch));
          result.deleted += batch.length;
          await input.onProgress?.({ ...result });
        }
      }
    }

    if (processedDocuments === 0) await input.onProgress?.({ ...result });
    return result;
  }

  private async embedAndUpsert(
    documents: ReturnType<typeof CatalogVariantVectorDocumentMapper.toDocument>[],
    result: SyncCatalogVariantsResult,
    onProgress?: SyncCatalogVariantsInput["onProgress"],
  ): Promise<void> {
    for (const batch of this.chunk(documents, SyncProscaiCatalogVariantsUseCase.VECTOR_BATCH_SIZE)) {
      const values = await this.withRetry(() => this.embeddings.embedDocuments(
        batch.map((document) => document.text),
      ));
      await this.withRetry(() => this.vectorIndex.upsert(batch.map((document, index) => ({
        id: document.id,
        values: values[index],
        metadata: document.metadata as unknown as VectorMetadata,
      }))));
      result.embedded += batch.length;
      result.upserted += batch.length;
      await onProgress?.({ ...result });
    }
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let offset = 0; offset < items.length; offset += size) {
      batches.push(items.slice(offset, offset + size));
    }
    return batches;
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= SyncProscaiCatalogVariantsUseCase.MAX_OPERATION_ATTEMPTS; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt < SyncProscaiCatalogVariantsUseCase.MAX_OPERATION_ATTEMPTS) {
          const message = error instanceof Error ? error.message.toLowerCase() : "";
          const delay = message.includes("429") || message.includes("rate limit")
            ? 30_000
            : attempt * 1_000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }
}

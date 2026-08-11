import assert from "node:assert/strict";
import test from "node:test";
import { ProductAvailabilityPort } from "../src/modules/semantic-catalog/application/ports/product-availability.port";
import { TextEmbeddingPort } from "../src/modules/semantic-catalog/application/ports/text-embedding.port";
import {
  ManageableVectorIndexPort,
  VectorIndexPort,
  VectorRecord,
} from "../src/modules/semantic-catalog/application/ports/vector-index.port";
import { SemanticCatalogRankingService } from "../src/modules/semantic-catalog/application/services/semantic-catalog-ranking.service";
import { TechnicalCatalogQueryParserService } from "../src/modules/semantic-catalog/application/services/technical-catalog-query-parser.service";
import { CatalogVariantVectorDocumentMapper } from "../src/modules/semantic-catalog/application/mappers/catalog-variant-vector-document.mapper";
import { BuildProscaiCatalogVariantsUseCase } from "../src/modules/semantic-catalog/application/use-cases/build-proscai-catalog-variants.use-case";
import { LocalProductSemanticUseCase } from "../src/modules/semantic-catalog/application/use-cases/local-product-semantic.use-case";
import { SearchSemanticCatalogUseCase } from "../src/modules/semantic-catalog/application/use-cases/search-semantic-catalog.use-case";
import { SyncProscaiCatalogVariantsUseCase } from "../src/modules/semantic-catalog/application/use-cases/sync-proscai-catalog-variants.use-case";
import { EvaluateProscaiCatalogSearchUseCase } from "../src/modules/semantic-catalog/application/use-cases/evaluate-proscai-catalog-search.use-case";
import { ProscaiCatalogVariantDatasource } from "../src/modules/semantic-catalog/domain/datasources/proscai-catalog-variant.datasource";
import { ProscaiCatalogVariantSourceRecord } from "../src/modules/semantic-catalog/domain/entities/proscai-catalog-variant.entity";
import { ProductAvailability, VectorMatch, VectorMetadata } from "../src/modules/semantic-catalog/domain/semantic-catalog.types";
import { ProscaiCatalogNormalizerService } from "../src/modules/semantic-catalog/infrastructure/proscai-catalog-normalizer.service";
import { SemanticCatalogPresenter } from "../src/modules/semantic-catalog/presentation/semantic-catalog.presenter";

class FakeEmbeddings implements TextEmbeddingPort {
  public queryCalls: string[] = [];
  public documentCalls: string[] = [];

  public async embedQuery(text: string): Promise<number[]> {
    this.queryCalls.push(text);
    return [0.1, 0.2];
  }

  public async embedDocument(text: string): Promise<number[]> {
    this.documentCalls.push(text);
    return [0.3, 0.4];
  }

  public async embedDocuments(texts: string[]): Promise<number[][]> {
    this.documentCalls.push(...texts);
    return texts.map((_text, index) => [index, index + 1]);
  }
}

class FakeVectorIndex implements VectorIndexPort {
  public matches: VectorMatch[] = [];
  public queries: Array<{ topK: number; filter?: Record<string, string> }> = [];
  public upserted: VectorRecord[][] = [];
  public deleted: string[][] = [];

  public async query(
    _vector: number[],
    topK: number,
    filter?: Record<string, string>,
  ): Promise<VectorMatch[]> {
    this.queries.push({ topK, filter });
    return this.matches;
  }

  public async upsert(records: VectorRecord[]): Promise<void> {
    this.upserted.push(records);
  }

  public async delete(ids: string[]): Promise<void> {
    this.deleted.push(ids);
  }
}

class FakeManageableVectorIndex extends FakeVectorIndex implements ManageableVectorIndexPort {
  public ids: string[] = [];
  public metadata = new Map<string, VectorMetadata>();

  public async findMetadata(ids: string[]): Promise<Map<string, VectorMetadata>> {
    return new Map(ids.flatMap((id) => {
      const value = this.metadata.get(id);
      return value ? [[id, value] as const] : [];
    }));
  }

  public async listIds(prefix = ""): Promise<string[]> {
    return this.ids.filter((id) => id.startsWith(prefix));
  }
}

class FakeVariantDatasource extends ProscaiCatalogVariantDatasource {
  constructor(private readonly rows: ProscaiCatalogVariantSourceRecord[]) {
    super();
  }

  public async findAllSourceRecords(): Promise<ProscaiCatalogVariantSourceRecord[]> {
    return this.rows;
  }

  public async close(): Promise<void> {}
}

const catalogSourceRecord: ProscaiCatalogVariantSourceRecord = {
  iseq: 1,
  ean: "TSC440",
  icod: "01000001",
  branchCode: "01",
  branchName: "MEXICO",
  description1: "TUBO ACERO AL CARBON SIN COSTURA 4 PULGADAS CEDULA 40",
  description2: "",
  originalDescription: "TUBO ACERO AL CARBON SIN COSTURA 4 PULGADAS CEDULA 40",
  fam2: "TUBERIA",
  fam3: "SIN COSTURA",
  fam4: "ACERO AL CARBON",
  fam5: "BISELADO",
  fam7: "40",
  fam8: "4",
  famc: "NEGRO",
  unit: "METRO",
  isActive: true,
  sourceUpdatedAt: "2026-08-01T00:00:00.000Z",
};

class FakeAvailability implements ProductAvailabilityPort {
  public requestedEans: string[][] = [];

  constructor(private readonly items: ProductAvailability[]) {}

  public isEnabled(): boolean { return true; }

  public async findByEans(eans: string[]): Promise<ProductAvailability[]> {
    this.requestedEans.push(eans);
    return this.items;
  }
}

test("semantic ranking keeps only the highest-scoring vector for each EAN", () => {
  const ranked = SemanticCatalogRankingService.rank([
    { id: "variant-a1", score: 0.81, metadata: { ean: "750001", normalizedDescription: "TUBO A" } },
    { id: "variant-b", score: 0.87, metadata: { ean: "750002", normalizedDescription: "TUBO B" } },
    { id: "variant-a2", score: 0.93, metadata: { ean: "750001", normalizedDescription: "TUBO A MEJOR" } },
  ]);

  assert.equal(ranked.length, 2);
  assert.equal(ranked[0]?.id, "variant-a2");
  assert.equal(ranked[0]?.ean, "750001");
  assert.equal(ranked[0]?.rankingStrategy, "SEMANTIC_ONLY");
  assert.equal(ranked[1]?.ean, "750002");
});

test("hybrid ranking favors the requested technical attributes", () => {
  const query = TechnicalCatalogQueryParserService.parse(
    "TUBO ACERO AL CARBON SIN COSTURA 4 PULGADAS CEDULA 40",
  );
  const ranked = SemanticCatalogRankingService.rankHybrid([
    {
      id: "pipe-6",
      score: 0.84,
      metadata: {
        ean: "PIPE6",
        product: "TUBO",
        material: "ACERO AL CARBON",
        diameter: "6",
        ced: "40",
        costura: "SIN COSTURA",
        normalizedDescription: "TUBO ACERO 6 CED 40 SIN COSTURA",
      },
    },
    {
      id: "pipe-4",
      score: 0.81,
      metadata: {
        ean: "PIPE4",
        product: "TUBO",
        material: "ACERO AL CARBON",
        diameter: "4",
        ced: "40",
        costura: "SIN COSTURA",
        normalizedDescription: "TUBO ACERO 4 CED 40 SIN COSTURA",
      },
    },
  ], query);

  assert.equal(ranked[0]?.ean, "PIPE4");
  assert.equal(ranked[0]?.rankingStrategy, "PIPE");
  assert.ok(ranked[0]?.reasons.includes("diameter match"));
  assert.ok(ranked[1]?.reasons.includes("diameter mismatch"));
});

test("local product search canonicalizes accents and reuses the cached query", async () => {
  const embeddings = new FakeEmbeddings();
  const index = new FakeVectorIndex();
  index.matches = [{
    id: "local:product-1",
    score: 0.91,
    metadata: {
      source: "LOCAL_TEMP",
      productId: "product-1",
      description: "VALVULA DE COMPuERTA",
      unit: "PZA",
    },
  }];
  const useCase = new LocalProductSemanticUseCase(embeddings, index);

  const first = await useCase.search("valvula de compuerta", "pza", 8);
  const second = await useCase.search("VALVULA DE COMPUERTA", "PZA", 8);

  assert.deepEqual(second, first);
  assert.equal(embeddings.queryCalls.length, 1);
  assert.deepEqual(index.queries[0], { topK: 8, filter: { source: "LOCAL_TEMP" } });
});

test("local product lifecycle writes normalized vectors and deletes the same vector id", async () => {
  const embeddings = new FakeEmbeddings();
  const index = new FakeVectorIndex();
  const useCase = new LocalProductSemanticUseCase(embeddings, index);

  await useCase.upsert({
    productId: " product-9 ",
    description: " valvula esferica 2 pulgadas ",
    unit: " pza ",
    branchId: "branch-1",
  });
  await useCase.upsertMany([
    { productId: "product-10", description: "Tubo acero", unit: "M" },
    { productId: "product-11", description: "Codo acero", unit: "PZA" },
  ]);
  await useCase.delete("product-9");

  assert.equal(index.upserted[0]?.[0]?.id, "local:product-9");
  assert.deepEqual(index.upserted[0]?.[0]?.metadata, {
    source: "LOCAL_TEMP",
    productId: "product-9",
    description: "VALVULA ESFERICA 2 PULGADAS",
    unit: "PZA",
    branchId: "branch-1",
  });
  assert.equal(index.upserted[1]?.length, 2);
  assert.deepEqual(index.deleted, [["local:product-9"]]);
});

test("quote semantic response expands ERP codes with assigned warehouse, stock, currency and costs", async () => {
  const embeddings = new FakeEmbeddings();
  const index = new FakeVectorIndex();
  index.matches = [{
    id: "variant-1",
    score: 0.9,
    metadata: {
      ean: "750100",
      normalizedDescription: "TUBO ACERO AL CARBON",
      originalDescription: "TUBO ACERO",
    },
  }];
  const availability: ProductAvailability = {
    ean: "750100",
    productCode: "01300100",
    sourceProductCodes: ["01300100"],
    hasMultipleProductCodes: false,
    description: "TUBO ACERO",
    unit: "M",
    costs: { average: 100, last: 120, currency: "MXN", saleCurrency: "USD" },
    totalStock: 12,
    availableInAnyBranch: true,
    branches: [{ branchCode: "15", branchName: "RESGUARDO QUERETARO", stock: 12, available: true }],
    codes: [{
      icod: "01300100",
      homeBranchCode: "01",
      homeBranchName: "MEXICO",
      description: "TUBO ACERO ERP",
      unit: "M",
      costs: { average: 100, last: 120, currency: "MXN", saleCurrency: "USD" },
      totalStock: 12,
      availableInAnyBranch: true,
      branches: [{ branchCode: "15", branchName: "RESGUARDO QUERETARO", stock: 12, available: true }],
    }],
  };
  const useCase = new SearchSemanticCatalogUseCase(
    embeddings,
    index,
    new FakeAvailability([availability]),
  );
  const result = await useCase.execute({
    query: "tubo acero",
    candidateTopK: 30,
    limit: 10,
    filters: {},
    includeAvailability: true,
  });
  const response = SemanticCatalogPresenter.quoteSearch("proscai-catalog-v2", {
    query: "tubo acero",
    branchCode: "15",
    warehouseCodes: ["15"],
    authorizedWarehouseCodes: ["15"],
    candidateTopK: 30,
    limit: 10,
    filters: {},
  }, result);

  assert.equal(response.itemsCount, 1);
  assert.equal(response.items[0]?.rankingStrategy, "SEMANTIC_ONLY");
  assert.equal(response.items[0]?.branchProduct?.code, "01300100");
  assert.equal(response.items[0]?.branchProduct?.currency, "USD");
  assert.equal(response.items[0]?.branchProduct?.saleCurrency, "USD");
  assert.equal(response.items[0]?.branchProduct?.costCurrency, "MXN");
  assert.equal(response.items[0]?.branchProduct?.lastCost, 120);
  assert.equal(response.items[0]?.branchProduct?.branchCode, "15");
  assert.equal(response.items[0]?.branchProduct?.branchName, "RESGUARDO QUERETARO");
  assert.equal(response.items[0]?.authorized, true);
  assert.equal(response.items[0]?.stockAvailableInBranch, true);
});

test("catalog dry run detects changes without embedding or mutating Pinecone", async () => {
  const embeddings = new FakeEmbeddings();
  const index = new FakeManageableVectorIndex();
  const build = new BuildProscaiCatalogVariantsUseCase(
    new FakeVariantDatasource([catalogSourceRecord]),
    new ProscaiCatalogNormalizerService(),
  );
  const useCase = new SyncProscaiCatalogVariantsUseCase(
    build,
    embeddings,
    index,
    "voyage-test",
    "catalog-test",
  );

  const result = await useCase.execute({ maxVariants: 1, dryRun: true });

  assert.equal(result.changed, 1);
  assert.equal(result.unchanged, 0);
  assert.equal(result.embedded, 0);
  assert.equal(result.upserted, 0);
  assert.equal(result.deleted, 0);
  assert.equal(result.fullReconciliation, false);
  assert.equal(embeddings.documentCalls.length, 0);
  assert.equal(index.upserted.length, 0);
  assert.equal(index.deleted.length, 0);
});

test("full catalog synchronization keeps current vectors and deletes only stale ids", async () => {
  const embeddings = new FakeEmbeddings();
  const index = new FakeManageableVectorIndex();
  const build = new BuildProscaiCatalogVariantsUseCase(
    new FakeVariantDatasource([catalogSourceRecord]),
    new ProscaiCatalogNormalizerService(),
  );
  const projection = await build.execute(true);
  const variant = projection.variants[0]!;
  const document = CatalogVariantVectorDocumentMapper.toDocument(variant, "voyage-test");
  index.ids = [document.id, "proscai-stale"];
  index.metadata.set(document.id, document.metadata as unknown as VectorMetadata);
  const useCase = new SyncProscaiCatalogVariantsUseCase(
    build,
    embeddings,
    index,
    "voyage-test",
    "catalog-test",
  );

  const result = await useCase.execute({ dryRun: false, deleteStale: true });

  assert.equal(result.unchanged, 1);
  assert.equal(result.changed, 0);
  assert.equal(result.embedded, 0);
  assert.equal(result.upserted, 0);
  assert.equal(result.stale, 1);
  assert.equal(result.deleted, 1);
  assert.equal(result.fullReconciliation, true);
  assert.deepEqual(index.deleted, [["proscai-stale"]]);
});

test("catalog evaluation records parser, ranking and top-result accuracy", async () => {
  const embeddings = new FakeEmbeddings();
  const index = new FakeVectorIndex();
  index.matches = [{
    id: "pipe-carbon-4-sch10",
    score: 0.93,
    metadata: {
      ean: "TCC410",
      product: "TUBO",
      material: "ACERO AL CARBON",
      diameter: "4",
      ced: "10",
      costura: "CON COSTURA",
      unit: "METRO",
      normalizedDescription: "TUBO ACERO AL CARBON CON COSTURA 4 CEDULA 10",
    },
  }];
  const evaluation = new EvaluateProscaiCatalogSearchUseCase(
    new SearchSemanticCatalogUseCase(embeddings, index),
  );

  const result = await evaluation.execute({ caseIds: ["pipe-carbon-steel-4-sch10"] });

  assert.equal(result.totalCases, 1);
  assert.equal(result.completedCases, 1);
  assert.equal(result.summary.top1Hits, 1);
  assert.equal(result.summary.parserHits, 1);
  assert.equal(result.results[0]?.rankingStrategy, "PIPE");
  assert.equal(result.results[0]?.passed, true);
});

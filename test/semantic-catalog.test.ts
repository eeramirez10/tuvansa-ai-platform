import assert from "node:assert/strict";
import test from "node:test";
import { ProductAvailabilityPort } from "../src/modules/semantic-catalog/application/ports/product-availability.port";
import { TextEmbeddingPort } from "../src/modules/semantic-catalog/application/ports/text-embedding.port";
import { VectorIndexPort, VectorRecord } from "../src/modules/semantic-catalog/application/ports/vector-index.port";
import { SemanticCatalogRankingService } from "../src/modules/semantic-catalog/application/services/semantic-catalog-ranking.service";
import { LocalProductSemanticUseCase } from "../src/modules/semantic-catalog/application/use-cases/local-product-semantic.use-case";
import { SearchSemanticCatalogUseCase } from "../src/modules/semantic-catalog/application/use-cases/search-semantic-catalog.use-case";
import { ProductAvailability, VectorMatch } from "../src/modules/semantic-catalog/domain/semantic-catalog.types";
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

test("quote semantic response expands ERP codes with branch, stock, currency and costs", async () => {
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
    costs: { average: 100, last: 120, currency: "MXN" },
    totalStock: 12,
    availableInAnyBranch: true,
    branches: [{ branchCode: "01", branchName: "MEXICO", stock: 12, available: true }],
    codes: [{
      icod: "01300100",
      homeBranchCode: "01",
      homeBranchName: "MEXICO",
      description: "TUBO ACERO ERP",
      unit: "M",
      costs: { average: 100, last: 120, currency: "MXN" },
      totalStock: 12,
      availableInAnyBranch: true,
      branches: [{ branchCode: "01", branchName: "MEXICO", stock: 12, available: true }],
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
    branchCode: "01",
    candidateTopK: 30,
    limit: 10,
    filters: {},
  }, result);

  assert.equal(response.itemsCount, 1);
  assert.equal(response.items[0]?.rankingStrategy, "SEMANTIC_ONLY");
  assert.equal(response.items[0]?.branchProduct?.code, "01300100");
  assert.equal(response.items[0]?.branchProduct?.currency, "MXN");
  assert.equal(response.items[0]?.branchProduct?.lastCost, 120);
  assert.equal(response.items[0]?.stockAvailableInBranch, true);
});

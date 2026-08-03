import { SearchSemanticCatalogResult } from "../application/use-cases/search-semantic-catalog.use-case";
import {
  ProductCodeAvailability,
  SemanticCatalogMatch,
  VectorMetadata,
} from "../domain/semantic-catalog.types";
import { SemanticSearchRequestProps } from "./semantic-search-request.dto";

const BRANCH_NAMES: Record<string, string> = {
  "01": "MEXICO",
  "02": "MONTERREY",
  "03": "VERACRUZ",
  "04": "MEXICALI",
  "05": "QUERETARO",
  "06": "CANCUN",
  "07": "LOS CABOS",
};

export class SemanticCatalogPresenter {
  public static vectorSearch(
    index: string,
    request: SemanticSearchRequestProps,
    result: SearchSemanticCatalogResult,
  ) {
    return {
      source: "proscai-catalog-v2-semantic",
      index,
      query: request.query,
      branchCode: request.branchCode,
      topK: request.limit,
      filters: request.filters,
      rankingStrategy: "SEMANTIC_ONLY",
      availabilityStatus: result.availabilityStatus,
      availabilityError: result.availabilityError,
      itemsCount: result.matches.length,
      items: result.matches.map((match) => {
        const availability = result.availabilityByEan.get(match.ean) ?? null;
        const requestedBranch = request.branchCode
          ? availability?.branches.find((branch) => branch.branchCode === request.branchCode) ?? null
          : null;
        return {
          ean: match.ean,
          productId: match.id,
          description: this.metadataText(match.metadata, "normalizedDescription"),
          originalDescription: this.metadataText(match.metadata, "originalDescription"),
          semanticSimilarity: this.round(match.semanticSimilarity),
          semanticSimilarityPercent: this.percent(match.semanticSimilarity),
          finalSimilarity: this.round(match.semanticSimilarity),
          finalSimilarityPercent: this.percent(match.semanticSimilarity),
          similarity: this.round(match.semanticSimilarity),
          similarityPercent: this.percent(match.semanticSimilarity),
          confidence: match.confidence,
          rankingStrategy: match.rankingStrategy,
          reasons: match.reasons,
          icod: this.metadataText(match.metadata, "canonicalIcod")
            ?? this.metadataText(match.metadata, "icod"),
          availabilityStatus: result.availabilityStatus === "resolved"
            ? availability ? "resolved" : "not_found"
            : result.availabilityStatus,
          availability: availability ? { ...availability, requestedBranch } : null,
          metadata: match.metadata,
        };
      }),
    };
  }

  public static quoteSearch(
    index: string,
    request: SemanticSearchRequestProps,
    result: SearchSemanticCatalogResult,
  ) {
    const branchCode = request.branchCode!;
    const items: Array<
      ReturnType<typeof SemanticCatalogPresenter.quoteItem>
      | ReturnType<typeof SemanticCatalogPresenter.unresolvedQuoteItem>
    > = [];
    for (const match of result.matches) {
      const availability = result.availabilityByEan.get(match.ean) ?? null;
      const codes = availability?.codes ?? [];
      if (codes.length === 0) {
        items.push(this.unresolvedQuoteItem(match, branchCode));
        continue;
      }

      const eanTotalStock = availability?.totalStock ?? 0;
      items.push(...[...codes]
        .sort((left, right) => {
          const leftRequested = left.homeBranchCode === branchCode ? 1 : 0;
          const rightRequested = right.homeBranchCode === branchCode ? 1 : 0;
          return rightRequested - leftRequested || left.icod.localeCompare(right.icod);
        })
        .map((code) => this.quoteItem(match, code, branchCode, eanTotalStock)));
    }

    return {
      source: "proscai-catalog-v2-semantic",
      index,
      query: request.query,
      branchCode,
      availabilityStatus: result.availabilityStatus,
      availabilityError: result.availabilityError,
      semanticMatchesCount: result.matches.length,
      itemsCount: items.length,
      items,
    };
  }

  private static quoteItem(
    match: SemanticCatalogMatch,
    code: ProductCodeAvailability,
    requestedBranchCode: string,
    eanTotalStock: number,
  ) {
    const resolvedBranchCode = code.homeBranchCode ?? "";
    const resolvedBranchName = code.homeBranchName
      ?? BRANCH_NAMES[resolvedBranchCode]
      ?? "SUCURSAL DESCONOCIDA";
    const homeBranchStock = code.branches
      .find((branch) => branch.branchCode === resolvedBranchCode)?.stock ?? 0;
    const registeredInBranch = resolvedBranchCode === requestedBranchCode;
    const description = code.description
      || this.metadataText(match.metadata, "normalizedDescription")
      || "";
    const originalDescription = this.metadataText(match.metadata, "originalDescription") ?? "";

    return {
      ...this.quoteMatch(match, requestedBranchCode),
      description,
      originalDescription,
      branchProductCode: code.icod,
      availableInBranch: registeredInBranch,
      availableInAnyBranch: Boolean(resolvedBranchCode),
      registeredInBranch,
      stockAvailableInBranch: registeredInBranch && homeBranchStock > 0,
      stockAvailableInAnyBranch: code.totalStock > 0,
      resolvedBranchCode,
      codeTotalStock: code.totalStock,
      eanTotalStock,
      branches: code.branches,
      branchProduct: {
        branchCode: resolvedBranchCode,
        branchName: resolvedBranchName,
        id: `${match.id}:${code.icod}`,
        code: code.icod,
        ean: match.ean,
        description: code.description || originalDescription || description,
        stock: homeBranchStock,
        unit: code.unit,
        currency: code.costs.currency,
        averageCost: code.costs.average,
        lastCost: code.costs.last,
      },
    };
  }

  private static unresolvedQuoteItem(match: SemanticCatalogMatch, branchCode: string) {
    return {
      ...this.quoteMatch(match, branchCode),
      description: this.metadataText(match.metadata, "normalizedDescription") ?? "",
      originalDescription: this.metadataText(match.metadata, "originalDescription") ?? "",
      branchProductCode: "",
      availableInBranch: false,
      availableInAnyBranch: false,
      registeredInBranch: false,
      stockAvailableInBranch: false,
      stockAvailableInAnyBranch: false,
      resolvedBranchCode: "",
      codeTotalStock: 0,
      eanTotalStock: 0,
      branches: [],
      branchProduct: null,
    };
  }

  private static quoteMatch(match: SemanticCatalogMatch, branchCode: string) {
    return {
      source: "proscai-catalog-v2-semantic",
      ean: match.ean,
      productId: match.id,
      semanticSimilarity: this.round(match.semanticSimilarity),
      semanticSimilarityPercent: this.percent(match.semanticSimilarity),
      finalSimilarity: this.round(match.semanticSimilarity),
      finalSimilarityPercent: this.percent(match.semanticSimilarity),
      similarity: this.round(match.semanticSimilarity),
      similarityPercent: this.percent(match.semanticSimilarity),
      confidence: match.confidence,
      reasons: match.reasons,
      rankingStrategy: match.rankingStrategy,
      branchCode,
    };
  }

  private static metadataText(metadata: VectorMetadata, key: string): string | null {
    const value = metadata[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private static round(value: number): number {
    return Math.round(value * 1_000_000) / 1_000_000;
  }

  private static percent(value: number): number {
    return Math.round(value * 10_000) / 100;
  }
}

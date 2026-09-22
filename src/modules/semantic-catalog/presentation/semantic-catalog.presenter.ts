import { SearchSemanticCatalogResult } from "../application/use-cases/search-semantic-catalog.use-case";
import {
  ProductCodeAvailability,
  ProductBranchAvailability,
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
  "15": "RESGUARDO QUERETARO",
};

export class SemanticCatalogPresenter {
  public static vectorSearch(
    index: string,
    request: SemanticSearchRequestProps,
    result: SearchSemanticCatalogResult,
  ) {
    return this.vectorResponse("proscai-catalog-v2-semantic", index, request, result, true);
  }

  public static hybridVectorSearch(
    index: string,
    request: SemanticSearchRequestProps,
    result: SearchSemanticCatalogResult,
  ) {
    return this.vectorResponse("proscai-catalog-v2", index, request, result, false);
  }

  private static vectorResponse(
    source: "proscai-catalog-v2" | "proscai-catalog-v2-semantic",
    index: string,
    request: SemanticSearchRequestProps,
    result: SearchSemanticCatalogResult,
    semanticOnly: boolean,
  ) {
    return {
      source,
      index,
      query: request.query,
      branchCode: request.branchCode,
      warehouseCodes: request.warehouseCodes ?? [],
      authorizedWarehouseCodes: request.authorizedWarehouseCodes ?? [],
      topK: request.limit,
      filters: request.filters,
      ...(semanticOnly ? { rankingStrategy: "SEMANTIC_ONLY" } : {}),
      ...(result.parsedQuery ? { parsedQuery: result.parsedQuery } : {}),
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
          finalSimilarity: this.round(match.finalSimilarity),
          finalSimilarityPercent: this.percent(match.finalSimilarity),
          similarity: this.round(match.finalSimilarity),
          similarityPercent: this.percent(match.finalSimilarity),
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
    return this.quoteResponse("proscai-catalog-v2-semantic", index, request, result);
  }

  public static hybridQuoteSearch(
    index: string,
    request: SemanticSearchRequestProps,
    result: SearchSemanticCatalogResult,
  ) {
    return this.quoteResponse("proscai-catalog-v2", index, request, result);
  }

  private static quoteResponse(
    source: "proscai-catalog-v2" | "proscai-catalog-v2-semantic",
    index: string,
    request: SemanticSearchRequestProps,
    result: SearchSemanticCatalogResult,
  ) {
    const branchCode = request.branchCode!;
    const warehouseCodes = request.warehouseCodes?.length ? request.warehouseCodes : [branchCode];
    const authorizedWarehouseCodes = request.authorizedWarehouseCodes?.length
      ? request.authorizedWarehouseCodes
      : warehouseCodes;
    const authorized = new Set(authorizedWarehouseCodes);
    const items: Array<
      ReturnType<typeof SemanticCatalogPresenter.quoteItem>
      | ReturnType<typeof SemanticCatalogPresenter.unresolvedQuoteItem>
    > = [];
    for (const match of result.matches) {
      const availability = result.availabilityByEan.get(match.ean) ?? null;
      const codes = availability?.codes ?? [];
      if (codes.length === 0) {
        items.push(this.unresolvedQuoteItem(
          match,
          branchCode,
          source,
          result.availabilityStatus === "resolved" ? "NOT_FOUND" : "VALIDATION_UNAVAILABLE",
        ));
        continue;
      }

      const eanTotalStock = availability?.totalStock ?? 0;
      const resolvedItems = codes.flatMap((code) => code.branches
        .filter((warehouse) => warehouseCodes.includes(warehouse.branchCode))
        .map((warehouse) => this.quoteItem(
          match,
          code,
          warehouse,
          authorized.has(warehouse.branchCode),
          eanTotalStock,
          source,
        )))
        .sort((left, right) => {
          const leftAuthorized = left.authorized ? 1 : 0;
          const rightAuthorized = right.authorized ? 1 : 0;
          return rightAuthorized - leftAuthorized
            || (right.branchProduct?.stock ?? 0) - (left.branchProduct?.stock ?? 0)
            || left.branchProductCode.localeCompare(right.branchProductCode)
            || left.resolvedBranchCode.localeCompare(right.resolvedBranchCode);
        });
      if (resolvedItems.length > 0) items.push(...resolvedItems);
      else items.push(this.catalogOnlyQuoteItem(match, codes[0], authorized, branchCode, source));
    }

    return {
      source,
      index,
      query: request.query,
      branchCode,
      warehouseCodes,
      authorizedWarehouseCodes,
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
    warehouse: ProductBranchAvailability,
    authorized: boolean,
    eanTotalStock: number,
    source: "proscai-catalog-v2" | "proscai-catalog-v2-semantic",
  ) {
    const resolvedBranchCode = warehouse.branchCode;
    const resolvedBranchName = warehouse.branchName
      || BRANCH_NAMES[resolvedBranchCode]
      || `ALMACEN ${resolvedBranchCode}`;
    const homeBranchStock = warehouse.stock;
    const description = code.description
      || this.metadataText(match.metadata, "normalizedDescription")
      || "";
    const originalDescription = this.metadataText(match.metadata, "originalDescription") ?? "";
    const hasUsableCost = this.hasUsableCost(code);

    return {
      ...this.quoteMatch(match, resolvedBranchCode, source),
      description,
      originalDescription,
      branchProductCode: code.icod,
      availableInBranch: true,
      availableInAnyBranch: Boolean(resolvedBranchCode),
      registeredInBranch: true,
      stockAvailableInBranch: homeBranchStock > 0,
      stockAvailableInAnyBranch: code.totalStock > 0,
      resolvedBranchCode,
      codeTotalStock: code.totalStock,
      eanTotalStock,
      branches: code.branches,
      authorized,
      erpValidationStatus: hasUsableCost ? "FOUND_WITH_COST" : "FOUND_WITHOUT_COST",
      hasUsableCost,
      branchProduct: {
        branchCode: resolvedBranchCode,
        branchName: resolvedBranchName,
        id: `${match.id}:${code.icod}`,
        code: code.icod,
        ean: match.ean,
        description: code.description || originalDescription || description,
        stock: homeBranchStock,
        unit: code.unit,
        currency: code.costs.saleCurrency,
        saleCurrency: code.costs.saleCurrency,
        costCurrency: code.costs.currency,
        averageCost: code.costs.average,
        lastCost: code.costs.last,
        averageCostMxn: code.costs.average,
        lastCostMxn: code.costs.last,
        hasUsableCost,
        authorized,
      },
    };
  }

  private static catalogOnlyQuoteItem(
    match: SemanticCatalogMatch,
    code: ProductCodeAvailability,
    authorizedWarehouseCodes: ReadonlySet<string>,
    requestedBranchCode: string,
    source: "proscai-catalog-v2" | "proscai-catalog-v2-semantic",
  ) {
    const description = code.description
      || this.metadataText(match.metadata, "originalDescription")
      || this.metadataText(match.metadata, "normalizedDescription")
      || "";
    const hasUsableCost = this.hasUsableCost(code);
    const resolvedBranchCode = code.homeBranchCode ?? "";
    const resolvedBranchName = code.homeBranchName
      ?? BRANCH_NAMES[resolvedBranchCode]
      ?? "";
    const authorized = Boolean(resolvedBranchCode)
      && authorizedWarehouseCodes.has(resolvedBranchCode);
    const hasKnownHomeBranch = Boolean(resolvedBranchCode);
    return {
      ...this.quoteMatch(match, resolvedBranchCode || requestedBranchCode, source),
      description,
      originalDescription: this.metadataText(match.metadata, "originalDescription") ?? "",
      branchProductCode: code.icod,
      availableInBranch: false,
      availableInAnyBranch: false,
      registeredInBranch: false,
      stockAvailableInBranch: false,
      stockAvailableInAnyBranch: false,
      resolvedBranchCode,
      codeTotalStock: code.totalStock,
      eanTotalStock: code.totalStock,
      branches: [],
      authorized,
      erpValidationStatus: hasUsableCost && hasKnownHomeBranch
        ? "FOUND_WITH_COST"
        : hasUsableCost
          ? "FOUND_WITHOUT_WAREHOUSE"
          : "FOUND_WITHOUT_COST",
      hasUsableCost,
      branchProduct: {
        branchCode: resolvedBranchCode,
        branchName: resolvedBranchName,
        id: `${match.id}:${code.icod}`,
        code: code.icod,
        ean: match.ean,
        description,
        stock: 0,
        unit: code.unit,
        currency: code.costs.saleCurrency,
        saleCurrency: code.costs.saleCurrency,
        costCurrency: code.costs.currency,
        averageCost: code.costs.average,
        lastCost: code.costs.last,
        averageCostMxn: code.costs.average,
        lastCostMxn: code.costs.last,
        hasUsableCost,
        authorized,
      },
    };
  }

  private static unresolvedQuoteItem(
    match: SemanticCatalogMatch,
    branchCode: string,
    source: "proscai-catalog-v2" | "proscai-catalog-v2-semantic",
    erpValidationStatus: "NOT_FOUND" | "VALIDATION_UNAVAILABLE",
  ) {
    return {
      ...this.quoteMatch(match, branchCode, source),
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
      authorized: false,
      erpValidationStatus,
      hasUsableCost: false,
      branchProduct: null,
    };
  }

  private static hasUsableCost(code: ProductCodeAvailability): boolean {
    return code.costs.hasUsableCost
      ?? Math.max(code.costs.average, code.costs.last) > 0;
  }

  private static quoteMatch(
    match: SemanticCatalogMatch,
    branchCode: string,
    source: "proscai-catalog-v2" | "proscai-catalog-v2-semantic",
  ) {
    return {
      source,
      ean: match.ean,
      productId: match.id,
      semanticSimilarity: this.round(match.semanticSimilarity),
      semanticSimilarityPercent: this.percent(match.semanticSimilarity),
      finalSimilarity: this.round(match.finalSimilarity),
      finalSimilarityPercent: this.percent(match.finalSimilarity),
      similarity: this.round(match.finalSimilarity),
      similarityPercent: this.percent(match.finalSimilarity),
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

export type VectorMetadataValue = string | number | boolean | string[] | undefined;
export type VectorMetadata = Record<string, VectorMetadataValue>;

export interface VectorMatch {
  id: string;
  score?: number;
  metadata?: VectorMetadata;
}

export interface SemanticCatalogMatch {
  id: string;
  ean: string;
  metadata: VectorMetadata;
  semanticSimilarity: number;
  finalSimilarity: number;
  confidence: "high" | "medium" | "low";
  rankingStrategy: string;
  reasons: string[];
}

export type ProductAvailabilityCurrency = "MXN" | "USD";
export type ProductAvailabilityLookupStatus =
  | "not_requested"
  | "resolved"
  | "unavailable"
  | "disabled";

export interface ProductAvailabilityCosts {
  average: number;
  last: number;
  currency: ProductAvailabilityCurrency;
  saleCurrency: ProductAvailabilityCurrency;
  hasUsableCost?: boolean;
}

export interface ProductBranchAvailability {
  branchCode: string;
  branchName: string;
  stock: number;
  available: boolean;
}

export interface ProductCodeAvailability {
  icod: string;
  homeBranchCode: string | null;
  homeBranchName: string | null;
  description: string;
  unit: string;
  costs: ProductAvailabilityCosts;
  totalStock: number;
  availableInAnyBranch: boolean;
  branches: ProductBranchAvailability[];
}

export interface ProductAvailability {
  ean: string;
  productCode: string;
  sourceProductCodes: string[];
  hasMultipleProductCodes: boolean;
  description: string;
  unit: string;
  costs: ProductAvailabilityCosts;
  totalStock: number;
  availableInAnyBranch: boolean;
  branches: ProductBranchAvailability[];
  codes: ProductCodeAvailability[];
}

export interface LocalProductVectorMetadata extends VectorMetadata {
  source: "LOCAL_TEMP";
  productId: string;
  description: string;
  unit: string;
  branchId?: string;
}

export interface LocalProductVectorMatch {
  productId: string;
  score: number;
  metadata: LocalProductVectorMetadata;
}

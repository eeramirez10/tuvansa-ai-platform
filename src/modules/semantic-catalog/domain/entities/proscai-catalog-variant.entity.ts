export type ProscaiBranchCode = "01" | "02" | "03" | "04" | "05" | "06" | "07";

export type CatalogVariantStatus = "READY" | "REVIEW";

export interface CatalogVariantAttributes {
  category?: string;
  subcategory?: string;
  product?: string;
  tipo?: string;
  subtipo?: string;
  material?: string;
  diameter?: string;
  ced?: string;
  termino?: string;
  costura?: string;
  acabado?: string;
  figura?: string;
  radio?: string;
  angulo?: string;
  grado?: string;
  presion?: string;
  unit?: string;
}

export interface ProscaiCatalogVariantSourceRecord {
  iseq: number;
  ean?: string;
  icod: string;
  branchCode: ProscaiBranchCode;
  branchName: string;
  description1: string;
  description2: string;
  originalDescription: string;
  fam2: string;
  fam3: string;
  fam4: string;
  fam5: string;
  fam7: string;
  fam8: string;
  famc: string;
  unit: string;
  isActive: boolean;
  sourceUpdatedAt?: string;
  disabledAt?: string;
}

export interface ProscaiCatalogVariantRecord extends ProscaiCatalogVariantSourceRecord {
  normalizedDescription: string;
  attributes: CatalogVariantAttributes;
}

export interface ProscaiCatalogVariant {
  variantId: string;
  ean: string;
  fingerprint: string;
  status: CatalogVariantStatus;
  reviewReasons: string[];
  warnings: string[];
  canonicalIcod: string;
  canonicalBranchCode: ProscaiBranchCode;
  canonicalBranchName: string;
  originalDescription: string;
  normalizedDescription: string;
  attributes: CatalogVariantAttributes;
  sourceRecordCount: number;
  sourceBranches: Array<{ code: ProscaiBranchCode; name: string }>;
  sourceRecords: ProscaiCatalogVariantRecord[];
}

export interface ProscaiCatalogVariantProjection {
  generatedAt: string;
  sourceUpdatedAt?: string;
  variants: ProscaiCatalogVariant[];
  quarantinedRecords: ProscaiCatalogVariantSourceRecord[];
  summary: {
    sourceRecords: number;
    uniqueEans: number;
    variants: number;
    readyVariants: number;
    reviewVariants: number;
    singleVariantEans: number;
    multipleVariantEans: number;
    quarantinedRecords: number;
    variantsBySourceBranch: Array<{
      branchCode: ProscaiBranchCode;
      branchName: string;
      sourceRecords: number;
      representedVariants: number;
    }>;
    variantsPerEan: Array<{ variantCount: number; eans: number }>;
    reviewReasonDistribution: Array<{ reason: string; variants: number }>;
    warningDistribution: Array<{ warning: string; variants: number }>;
  };
}

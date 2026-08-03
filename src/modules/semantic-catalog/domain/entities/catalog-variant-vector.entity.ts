export interface CatalogVariantVectorMetadata {
  variantId: string;
  ean: string;
  canonicalIcod: string;
  canonicalBranchCode: string;
  originalDescription: string;
  normalizedDescription: string;
  status: string;
  reviewReasons: string[];
  warnings: string[];
  sourceBranches: string[];
  sourceRecordCount: number;
  isActive: boolean;
  contentHash: string;
  sourceFingerprint: string;
  embeddingModel: string;
  templateVersion: string;
  sourceUpdatedAt?: string;
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

export interface CatalogVariantVectorDocument {
  id: string;
  text: string;
  metadata: CatalogVariantVectorMetadata;
}

export interface CatalogVariantVector {
  id: string;
  values: number[];
  metadata: CatalogVariantVectorMetadata;
}

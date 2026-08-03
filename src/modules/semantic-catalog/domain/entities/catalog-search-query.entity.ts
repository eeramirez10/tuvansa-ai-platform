export type CatalogSearchFamily = "PIPE" | "FITTING" | "VALVE" | "FLANGE" | "GENERIC";

export interface ParsedCatalogSearchQuery {
  originalQuery: string;
  normalizedQuery: string;
  family: CatalogSearchFamily;
  category?: string;
  product?: string;
  material?: string;
  diameter?: string;
  ced?: string;
  costura?: string;
  termino?: string;
  acabado?: string;
  angulo?: string;
  presion?: string;
  norma?: string;
  unit?: string;
  figura?: string;
  radio?: string;
  connectionGender?: string;
  subtipo?: string;
  actuation?: string;
  tipo?: string;
  face?: string;
  grado?: string;
}

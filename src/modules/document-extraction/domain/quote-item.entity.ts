export type DetectedLanguage = "es" | "en" | "mixed";
export const ERP_MEASUREMENT_UNITS = [
  "PZ",
  "K",
  "M",
  "ML",
  "L",
  "TR",
  "SE",
  "ACT",
  "FT",
  "XRO",
  "UNO",
  "M2",
  "LOT",
  "CON",
] as const;
export type CanonicalUnit = (typeof ERP_MEASUREMENT_UNITS)[number];

export interface QuoteItemProps {
  descriptionOriginal: string;
  descriptionNormalized: string;
  quantity: number | null;
  originalUnit: string | null;
  normalizedUnit: CanonicalUnit | null;
  language: DetectedLanguage;
  requiresReview: boolean;
}

export class QuoteItem {
  constructor(private readonly props: QuoteItemProps) {
    if (!props.descriptionOriginal.trim()) {
      throw new Error("Quote item description is required.");
    }
  }

  public toPrimitives() {
    return {
      description_original: this.props.descriptionOriginal,
      description_normalizada: this.props.descriptionNormalized,
      cantidad: this.props.quantity,
      unidad_original: this.props.originalUnit,
      unidad_normalizada: this.props.normalizedUnit,
      idioma: this.props.language,
      requiere_revision: this.props.requiresReview,
    };
  }
}

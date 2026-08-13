export type QuoteCurrency = "MXN" | "USD";
export type QuotedExcelReviewReason =
  | "MISSING_DESCRIPTION"
  | "INVALID_QUANTITY"
  | "MISSING_UNIT"
  | "UNRECOGNIZED_UNIT"
  | "INVALID_UNIT_PRICE"
  | "INVALID_SUBTOTAL"
  | "MISSING_CURRENCY"
  | "MISSING_DELIVERY_TIME"
  | "SUBTOTAL_MISMATCH";

export interface QuotedExcelReviewInput {
  description: string;
  quantity: number | null;
  originalUnit: string | null;
  normalizedUnit: string | null;
  unitPrice: number | null;
  subtotal: number | null;
  currency: QuoteCurrency | null;
  deliveryTime: string | null;
}

export const getQuotedExcelReviewReasons = (input: QuotedExcelReviewInput): QuotedExcelReviewReason[] => {
  const reasons: QuotedExcelReviewReason[] = [];
  if (!input.description.trim()) reasons.push("MISSING_DESCRIPTION");
  if (input.quantity === null || input.quantity <= 0) reasons.push("INVALID_QUANTITY");
  if (!input.originalUnit?.trim()) reasons.push("MISSING_UNIT");
  else if (!input.normalizedUnit) reasons.push("UNRECOGNIZED_UNIT");
  if (input.unitPrice === null || input.unitPrice <= 0) reasons.push("INVALID_UNIT_PRICE");
  if (input.subtotal === null || input.subtotal <= 0) reasons.push("INVALID_SUBTOTAL");
  if (!input.currency) reasons.push("MISSING_CURRENCY");
  if (!input.deliveryTime?.trim()) reasons.push("MISSING_DELIVERY_TIME");

  if (input.quantity !== null && input.quantity > 0 && input.unitPrice !== null && input.unitPrice > 0
    && input.subtotal !== null && input.subtotal > 0) {
    const calculatedSubtotal = Number((input.quantity * input.unitPrice).toFixed(4));
    if (Math.abs(input.subtotal - calculatedSubtotal) > Math.max(0.05, calculatedSubtotal * 0.001)) {
      reasons.push("SUBTOTAL_MISMATCH");
    }
  }
  return reasons;
};

export interface QuotedExcelItemProps {
  descriptionOriginal: string;
  descriptionNormalized: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  subtotal: number | null;
  currency: QuoteCurrency | null;
  deliveryTime: string | null;
  requiresReview: boolean;
  reviewReasons?: QuotedExcelReviewReason[];
}

export class QuotedExcelItem {
  constructor(private readonly props: QuotedExcelItemProps) {
    if (!props.descriptionOriginal.trim()) {
      throw new Error("La descripcion de la partida importada es obligatoria.");
    }
  }

  public toPrimitives() {
    return {
      description_original: this.props.descriptionOriginal.trim(),
      description_normalizada: this.props.descriptionNormalized.trim().toUpperCase(),
      cantidad: this.props.quantity,
      unidad: this.props.unit?.trim() || null,
      precio_vendedor: this.props.unitPrice,
      subtotal: this.props.subtotal,
      moneda: this.props.currency,
      tiempo_entrega: this.props.deliveryTime?.trim() || null,
      requiere_revision: this.props.requiresReview,
      motivos_revision: this.props.reviewReasons ?? [],
    };
  }
}

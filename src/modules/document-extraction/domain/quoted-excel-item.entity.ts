export type QuoteCurrency = "MXN" | "USD";

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
    };
  }
}

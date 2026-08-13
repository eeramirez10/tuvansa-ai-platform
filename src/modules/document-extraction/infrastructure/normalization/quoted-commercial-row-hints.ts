import { QuoteCurrency } from "../../domain/quoted-excel-item.entity";

export interface QuotedCommercialRowHint {
  description: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  subtotal: number | null;
  currency: QuoteCurrency | null;
  deliveryTime: string | null;
}

export const parseQuotedCommercialRowHints = (text: string): QuotedCommercialRowHint[] => {
  if (!text.includes("QUOTED_COMMERCIAL_ROWS")) return [];

  return text
    .split(/\r?\n/)
    .filter((line) => /^ROW_\d+:\s*/.test(line))
    .map((line) => {
      const fields = new Map<string, string>();
      line.replace(/^ROW_\d+:\s*/, "").split(/\s+\|\s+/).forEach((part) => {
        const separator = part.indexOf("=");
        if (separator <= 0) return;
        fields.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
      });

      return {
        description: textValue(fields.get("DESCRIPTION")),
        unit: textValue(fields.get("UNIT")),
        quantity: numericValue(fields.get("QUANTITY")),
        unitPrice: numericValue(fields.get("UNIT_PRICE")),
        subtotal: numericValue(fields.get("SUBTOTAL")),
        currency: currencyValue(fields.get("CURRENCY")),
        deliveryTime: textValue(fields.get("DELIVERY_TIME")),
      };
    });
};

const textValue = (value: string | undefined): string | null => value?.trim() || null;

const numericValue = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const currencyValue = (value: string | undefined): QuoteCurrency | null => (
  value === "MXN" || value === "USD" ? value : null
);

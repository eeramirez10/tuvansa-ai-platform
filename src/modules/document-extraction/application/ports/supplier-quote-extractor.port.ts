import { AiUsage } from "./quote-text-extractor.port";
import { CanonicalUnit } from "../../domain/quote-item.entity";

export interface SupplierQuoteExtractedItem {
  lineNumber: string | null;
  supplierProductCode: string | null;
  alternateCodes: string[];
  description: string;
  quantity: number | null;
  unitOriginal: string | null;
  unit: CanonicalUnit | null;
  listUnitPrice: number | null;
  discountPct: number | null;
  netUnitPrice: number | null;
  subtotal: number | null;
  brand: string | null;
  origin: string | null;
  deliveryTime: string | null;
  availableDate: string | null;
  minimumQuantity: number | null;
  confidence: number;
  requiresReview: boolean;
  evidence: string | null;
}

export interface SupplierQuoteExtractedContact {
  channel: "EMAIL" | "PHONE";
  value: string;
  phoneKind: "LANDLINE" | "MOBILE" | "UNKNOWN" | null;
  extension: string | null;
  isWhatsApp: boolean;
  contactName: string | null;
  contactPosition: string | null;
  label: string | null;
  confidence: number;
  evidence: string | null;
}

export interface SupplierQuoteResult {
  fileName: string;
  supplier: {
    name: string | null;
    taxId: string | null;
    state: string | null;
    country: string | null;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    contacts: SupplierQuoteExtractedContact[];
    confidence: number;
    evidence: string | null;
  };
  header: {
    reference: string | null;
    quoteDate: string | null;
    validUntil: string | null;
    currency: "MXN" | "USD" | null;
    exchangeRate: number | null;
    paymentTerms: string | null;
    deliveryTerms: string | null;
  };
  totals: {
    subtotal: number | null;
    discount: number | null;
    freight: number | null;
    otherCharges: number | null;
    taxIncluded: boolean | null;
    taxRate: number | null;
    tax: number | null;
    total: number | null;
  };
  items: SupplierQuoteExtractedItem[];
  warnings: string[];
  requiresReview: boolean;
}

export interface SupplierQuoteExtraction {
  result: SupplierQuoteResult;
  usage: AiUsage;
}

export interface SupplierQuoteExtractorPort {
  extract(text: string, fileName: string): Promise<SupplierQuoteExtraction>;
}

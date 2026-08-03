export interface ExtractedPartyContact {
  name: string | null;
  position: string | null;
  label: string | null;
  email: string | null;
  landlinePhone: string | null;
  extension: string | null;
  whatsappPhone: string | null;
  confidence: number;
  evidence: string | null;
}

export interface ExtractedPartyData {
  partyType: "CUSTOMER" | "SUPPLIER";
  businessName: string | null;
  firstName: string | null;
  lastName: string | null;
  taxId: string | null;
  taxRegime: string | null;
  scope: "NATIONAL" | "INTERNATIONAL" | null;
  currency: "MXN" | "USD" | null;
  creditTerms: string | null;
  address: {
    street: string | null;
    exteriorNumber: string | null;
    interiorNumber: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  };
  contacts: ExtractedPartyContact[];
  notes: string | null;
  confidence: number;
  evidence: string | null;
}

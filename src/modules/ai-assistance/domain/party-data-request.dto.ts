import { AppError } from "../../../shared/domain/app-error";

export type PartyDataType = "CUSTOMER" | "SUPPLIER";

export interface PartyDataJobInput {
  partyType: PartyDataType;
  text: string;
}

export class PartyDataRequestDto {
  private constructor(private readonly input: PartyDataJobInput) {}

  public static create(value: unknown): PartyDataRequestDto {
    if (!value || typeof value !== "object") {
      throw new AppError("Invalid request body.", 400, "INVALID_PARTY_DATA_REQUEST");
    }
    const body = value as Record<string, unknown>;
    const partyType = typeof body.partyType === "string" ? body.partyType.trim().toUpperCase() : "";
    if (partyType !== "CUSTOMER" && partyType !== "SUPPLIER") {
      throw new AppError("partyType must be CUSTOMER or SUPPLIER.", 400, "INVALID_PARTY_TYPE");
    }
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 3) {
      throw new AppError("Text is required.", 400, "PARTY_TEXT_REQUIRED");
    }
    if (text.length > 20_000) {
      throw new AppError("Text cannot exceed 20000 characters.", 400, "PARTY_TEXT_TOO_LONG");
    }
    return new PartyDataRequestDto({ partyType, text });
  }

  public toJobInput(): PartyDataJobInput {
    return this.input;
  }
}

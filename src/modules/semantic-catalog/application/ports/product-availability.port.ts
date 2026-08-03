import { ProductAvailability } from "../../domain/semantic-catalog.types";

export abstract class ProductAvailabilityPort {
  public abstract isEnabled(): boolean;
  public abstract findByEans(eans: string[]): Promise<ProductAvailability[]>;
}

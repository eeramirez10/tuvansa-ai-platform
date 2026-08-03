import { ProscaiCatalogVariantSourceRecord } from "../entities/proscai-catalog-variant.entity";

export abstract class ProscaiCatalogVariantDatasource {
  public abstract findAllSourceRecords(): Promise<ProscaiCatalogVariantSourceRecord[]>;
  public abstract close(): Promise<void>;
}

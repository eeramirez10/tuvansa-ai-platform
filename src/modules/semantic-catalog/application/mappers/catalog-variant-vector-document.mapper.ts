import { createHash } from "node:crypto";

import {
  CatalogVariantVectorDocument,
  CatalogVariantVectorMetadata,
} from "../../domain/entities/catalog-variant-vector.entity";
import { ProscaiCatalogVariant } from "../../domain/entities/proscai-catalog-variant.entity";

export class CatalogVariantVectorDocumentMapper {
  public static readonly TEMPLATE_VERSION = "catalog-variant-v1";

  public static toDocument(
    variant: ProscaiCatalogVariant,
    embeddingModel: string,
  ): CatalogVariantVectorDocument {
    const canonical = variant.sourceRecords.find((record) => record.icod === variant.canonicalIcod);
    const sourceFingerprint = this.createSourceFingerprint(variant);
    const metadataWithoutHash: Omit<CatalogVariantVectorMetadata, "contentHash"> = {
      variantId: variant.variantId,
      ean: variant.ean,
      canonicalIcod: variant.canonicalIcod,
      canonicalBranchCode: variant.canonicalBranchCode,
      originalDescription: variant.originalDescription,
      normalizedDescription: variant.normalizedDescription,
      status: variant.status,
      reviewReasons: variant.reviewReasons,
      warnings: variant.warnings,
      sourceBranches: variant.sourceBranches.map((branch) => branch.code),
      sourceRecordCount: variant.sourceRecordCount,
      isActive: canonical?.isActive ?? false,
      sourceFingerprint,
      embeddingModel,
      templateVersion: this.TEMPLATE_VERSION,
      ...this.optional("sourceUpdatedAt", this.latestSourceUpdate(variant)),
      ...this.optional("category", variant.attributes.category),
      ...this.optional("subcategory", variant.attributes.subcategory),
      ...this.optional("product", variant.attributes.product),
      ...this.optional("tipo", variant.attributes.tipo),
      ...this.optional("subtipo", variant.attributes.subtipo),
      ...this.optional("material", variant.attributes.material),
      ...this.optional("diameter", variant.attributes.diameter),
      ...this.optional("ced", variant.attributes.ced),
      ...this.optional("termino", variant.attributes.termino),
      ...this.optional("costura", variant.attributes.costura),
      ...this.optional("acabado", variant.attributes.acabado),
      ...this.optional("figura", variant.attributes.figura),
      ...this.optional("radio", variant.attributes.radio),
      ...this.optional("angulo", variant.attributes.angulo),
      ...this.optional("grado", variant.attributes.grado),
      ...this.optional("presion", variant.attributes.presion),
      ...this.optional("unit", variant.attributes.unit),
    };
    const text = this.buildEmbeddingText(variant, metadataWithoutHash);
    const contentHash = createHash("sha256")
      .update(JSON.stringify({ text, metadata: metadataWithoutHash }))
      .digest("hex");

    return {
      id: variant.variantId,
      text,
      metadata: {
        ...metadataWithoutHash,
        contentHash,
      },
    };
  }

  private static buildEmbeddingText(
    variant: ProscaiCatalogVariant,
    metadata: Omit<CatalogVariantVectorMetadata, "contentHash">,
  ): string {
    const aliases = Array.from(new Set(
      variant.sourceRecords
        .map((record) => this.normalize(record.originalDescription))
        .filter((description) => description && description !== metadata.originalDescription),
    )).slice(0, 5);
    const sections = [
      this.section("Categoria", metadata.category),
      this.section("Subcategoria", metadata.subcategory),
      this.section("Producto", metadata.product),
      this.section("Descripcion normalizada", metadata.normalizedDescription),
      this.section("Descripcion original Proscai", metadata.originalDescription),
      aliases.length > 0 ? `Descripciones alternativas: ${aliases.join(" | ")}` : undefined,
      this.section("Tipo", metadata.tipo),
      this.section("Subtipo", metadata.subtipo),
      this.section("Material", metadata.material),
      this.section("Diametro nominal", metadata.diameter),
      this.section("Cedula", metadata.ced),
      this.section("Terminacion", metadata.termino),
      this.section("Costura", metadata.costura),
      this.section("Acabado", metadata.acabado),
      this.section("Figura", metadata.figura),
      this.section("Radio", metadata.radio),
      this.section("Angulo", metadata.angulo),
      this.section("Grado", metadata.grado),
      this.section("Presion", metadata.presion),
      this.section("Unidad comercial", metadata.unit),
    ];

    return sections.filter((section): section is string => Boolean(section)).join(". ");
  }

  private static createSourceFingerprint(variant: ProscaiCatalogVariant): string {
    const source = variant.sourceRecords
      .map((record) => ({
        iseq: record.iseq,
        icod: record.icod,
        branchCode: record.branchCode,
        description1: record.description1,
        description2: record.description2,
        isActive: record.isActive,
        sourceUpdatedAt: record.sourceUpdatedAt,
        attributes: record.attributes,
      }))
      .sort((first, second) => first.icod.localeCompare(second.icod));

    return createHash("sha256").update(JSON.stringify(source)).digest("hex");
  }

  private static latestSourceUpdate(variant: ProscaiCatalogVariant): string | undefined {
    return variant.sourceRecords
      .map((record) => record.sourceUpdatedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
  }

  private static section(label: string, value?: string): string | undefined {
    const normalized = this.normalize(value);
    return normalized ? `${label}: ${normalized}` : undefined;
  }

  private static optional(key: string, value?: string): Record<string, string> {
    const normalized = this.normalize(value);
    return normalized ? { [key]: normalized } : {};
  }

  private static normalize(value?: string): string {
    return (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }
}

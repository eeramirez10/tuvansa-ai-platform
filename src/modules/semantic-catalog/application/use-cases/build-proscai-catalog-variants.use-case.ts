import { createHash } from "node:crypto";

import { ProscaiCatalogVariantDatasource } from "../../domain/datasources/proscai-catalog-variant.datasource";
import {
  CatalogVariantAttributes,
  ProscaiBranchCode,
  ProscaiCatalogVariant,
  ProscaiCatalogVariantProjection,
  ProscaiCatalogVariantRecord,
  ProscaiCatalogVariantSourceRecord,
} from "../../domain/entities/proscai-catalog-variant.entity";
import { ProscaiCatalogNormalizerService } from "../../infrastructure/proscai-catalog-normalizer.service";

type CriticalAttribute =
  | "product"
  | "tipo"
  | "subtipo"
  | "material"
  | "diameter"
  | "ced"
  | "termino"
  | "costura"
  | "acabado"
  | "figura"
  | "radio"
  | "angulo"
  | "grado"
  | "presion"
  | "unit";

type VariantCluster = {
  attributes: CatalogVariantAttributes;
  records: ProscaiCatalogVariantRecord[];
  hasAmbiguousAssignment: boolean;
};

const CRITICAL_ATTRIBUTES: CriticalAttribute[] = [
  "product",
  "tipo",
  "subtipo",
  "material",
  "diameter",
  "ced",
  "termino",
  "costura",
  "acabado",
  "figura",
  "radio",
  "angulo",
  "grado",
  "presion",
  "unit",
];

const BRANCHES: Array<{ code: ProscaiBranchCode; name: string }> = [
  { code: "01", name: "MEXICO" },
  { code: "02", name: "MONTERREY" },
  { code: "03", name: "VERACRUZ" },
  { code: "04", name: "MEXICALI" },
  { code: "05", name: "QUERETARO" },
  { code: "06", name: "CANCUN" },
  { code: "07", name: "LOS CABOS" },
];

export class BuildProscaiCatalogVariantsUseCase {
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;
  private cachedProjection?: ProscaiCatalogVariantProjection;
  private cachedAt = 0;
  private buildingProjection?: Promise<ProscaiCatalogVariantProjection>;

  constructor(
    private readonly datasource: ProscaiCatalogVariantDatasource,
    private readonly productAnalysisService: ProscaiCatalogNormalizerService,
  ) {}

  public async execute(refresh = false): Promise<ProscaiCatalogVariantProjection> {
    const cacheIsValid = this.cachedProjection
      && Date.now() - this.cachedAt < BuildProscaiCatalogVariantsUseCase.CACHE_TTL_MS;

    if (!refresh && cacheIsValid) {
      return this.cachedProjection!;
    }

    if (this.buildingProjection) {
      return this.buildingProjection;
    }

    this.buildingProjection = this.buildProjection();

    try {
      const projection = await this.buildingProjection;
      this.cachedProjection = projection;
      this.cachedAt = Date.now();
      return projection;
    } finally {
      this.buildingProjection = undefined;
    }
  }

  private async buildProjection(): Promise<ProscaiCatalogVariantProjection> {
    const sourceRecords = await this.datasource.findAllSourceRecords();
    const quarantinedRecords = sourceRecords.filter((record) => !record.ean);
    const recordsByEan = this.groupByEan(sourceRecords.filter((record) => Boolean(record.ean)));
    const variants: ProscaiCatalogVariant[] = [];

    for (const [ean, records] of recordsByEan) {
      const normalizedRecords = records
        .map((record) => this.normalizeRecord(record))
        .sort((first, second) => this.scoreSourceRecord(second) - this.scoreSourceRecord(first));
      const clusters = this.buildClusters(normalizedRecords);
      const hasMultipleVariants = clusters.length > 1;

      for (const cluster of clusters) {
        variants.push(this.toVariant(ean, cluster, hasMultipleVariants));
      }
    }

    variants.sort((first, second) => (
      first.ean.localeCompare(second.ean)
      || first.variantId.localeCompare(second.variantId)
    ));

    return {
      generatedAt: new Date().toISOString(),
      sourceUpdatedAt: this.findLatestSourceUpdate(sourceRecords),
      variants,
      quarantinedRecords,
      summary: this.buildSummary(sourceRecords, variants, quarantinedRecords.length),
    };
  }

  private groupByEan(records: ProscaiCatalogVariantSourceRecord[]) {
    const grouped = new Map<string, ProscaiCatalogVariantSourceRecord[]>();

    for (const record of records) {
      const ean = this.normalizeValue(record.ean);
      if (!ean) continue;
      const values = grouped.get(ean) ?? [];
      values.push(record);
      grouped.set(ean, values);
    }

    return grouped;
  }

  private normalizeRecord(source: ProscaiCatalogVariantSourceRecord): ProscaiCatalogVariantRecord {
    const normalized = this.productAnalysisService.normalizeCatalogProduct({
      ean: source.ean ?? "",
      icod: source.icod,
      description1: source.description1,
      description2: source.description2,
      fam2: source.fam2,
      fam3: source.fam3,
      fam4: source.fam4,
      fam5: source.fam5,
      fam7: source.fam7,
      fam8: source.fam8,
      famc: source.famc,
      unit: source.unit,
    });

    const attributes = this.enrichAttributesFromDescription(
      this.normalizeAttributes({
        category: normalized.category,
        subcategory: normalized.subcategory,
        product: normalized.product,
        tipo: normalized.tipo,
        subtipo: normalized.subtipo,
        material: normalized.material,
        diameter: normalized.diameter,
        ced: normalized.ced,
        termino: normalized.termino,
        costura: normalized.costura,
        acabado: normalized.acabado,
        figura: normalized.figura,
        radio: normalized.radio,
        angulo: normalized.angulo,
        grado: normalized.grado,
        presion: normalized.presion,
        unit: normalized.unit,
      }),
      source.originalDescription,
    );

    return {
      ...source,
      normalizedDescription: this.normalizeValue(normalized.normalizedDescription)
        ?? this.normalizeValue(source.originalDescription)
        ?? "",
      attributes,
    };
  }

  private buildClusters(records: ProscaiCatalogVariantRecord[]): VariantCluster[] {
    const clusters: VariantCluster[] = [];

    for (const record of records) {
      const compatible = clusters
        .map((cluster) => ({ cluster, score: this.compatibilityScore(record, cluster) }))
        .filter(({ score }) => score >= 0)
        .sort((first, second) => second.score - first.score);

      if (compatible.length === 0) {
        clusters.push({
          attributes: { ...record.attributes },
          records: [record],
          hasAmbiguousAssignment: false,
        });
        continue;
      }

      const selected = compatible[0];
      const tied = compatible.length > 1 && compatible[1].score === selected.score;
      selected.cluster.records.push(record);
      selected.cluster.attributes = this.mergeAttributes(selected.cluster.attributes, record.attributes);
      selected.cluster.hasAmbiguousAssignment ||= tied || selected.score === 0;
    }

    return clusters;
  }

  private compatibilityScore(record: ProscaiCatalogVariantRecord, cluster: VariantCluster): number {
    let sharedAttributes = 0;

    for (const key of CRITICAL_ATTRIBUTES) {
      const recordValue = record.attributes[key];
      const clusterValue = cluster.attributes[key];

      if (recordValue && clusterValue && recordValue !== clusterValue) {
        return -1;
      }

      if (recordValue && clusterValue && recordValue === clusterValue) {
        sharedAttributes += 1;
      }
    }

    const canonicalDescription = cluster.records[0]?.normalizedDescription ?? "";
    const sourceSupport = Math.min(cluster.records.length, 5) * 2;
    return sharedAttributes * 10
      + sourceSupport
      + Math.round(this.descriptionSimilarity(record.normalizedDescription, canonicalDescription) * 5);
  }

  private mergeAttributes(
    current: CatalogVariantAttributes,
    incoming: CatalogVariantAttributes,
  ): CatalogVariantAttributes {
    const merged = { ...current };

    for (const [key, value] of Object.entries(incoming)) {
      const attribute = key as keyof CatalogVariantAttributes;
      if (!merged[attribute] && value) {
        merged[attribute] = value;
      }
    }

    return merged;
  }

  private toVariant(
    ean: string,
    cluster: VariantCluster,
    hasMultipleVariants: boolean,
  ): ProscaiCatalogVariant {
    const canonical = [...cluster.records].sort(
      (first, second) => this.scoreSourceRecord(second) - this.scoreSourceRecord(first),
    )[0];
    const fingerprint = this.buildFingerprint(cluster.attributes, canonical.normalizedDescription);
    const reviewReasons: string[] = [];
    const warnings: string[] = [];

    if (hasMultipleVariants) reviewReasons.push("EAN_HAS_MULTIPLE_VARIANTS");
    if (cluster.hasAmbiguousAssignment) reviewReasons.push("AMBIGUOUS_SOURCE_ASSIGNMENT");
    if (!cluster.attributes.product) reviewReasons.push("MISSING_PRODUCT_TYPE");
    if (!canonical.isActive) reviewReasons.push("CANONICAL_RECORD_INACTIVE");
    if (canonical.originalDescription.trim().length < 12) reviewReasons.push("DESCRIPTION_TOO_SHORT");
    if (!cluster.attributes.material) warnings.push("MISSING_MATERIAL");
    if (!cluster.attributes.diameter) warnings.push("MISSING_DIAMETER");
    if (!cluster.attributes.ced) warnings.push("MISSING_SCHEDULE");
    if (new Set(cluster.records.map((record) => record.normalizedDescription)).size > 1) {
      warnings.push("SOURCE_DESCRIPTION_VARIANTS");
    }

    const sourceBranches = BRANCHES.filter((branch) => (
      cluster.records.some((record) => record.branchCode === branch.code)
    ));

    return {
      variantId: this.createVariantId(ean, fingerprint),
      ean,
      fingerprint,
      status: reviewReasons.length > 0 ? "REVIEW" : "READY",
      reviewReasons,
      warnings,
      canonicalIcod: canonical.icod,
      canonicalBranchCode: canonical.branchCode,
      canonicalBranchName: canonical.branchName,
      originalDescription: canonical.originalDescription,
      normalizedDescription: canonical.normalizedDescription,
      attributes: cluster.attributes,
      sourceRecordCount: cluster.records.length,
      sourceBranches,
      sourceRecords: cluster.records.sort((first, second) => first.icod.localeCompare(second.icod)),
    };
  }

  private buildFingerprint(attributes: CatalogVariantAttributes, description: string): string {
    const technicalFingerprint = CRITICAL_ATTRIBUTES
      .map((key) => `${key}=${attributes[key] ?? ""}`)
      .join("|");
    const hasTechnicalIdentity = CRITICAL_ATTRIBUTES.some((key) => Boolean(attributes[key]));

    return hasTechnicalIdentity
      ? technicalFingerprint
      : `description=${description}`;
  }

  private createVariantId(ean: string, fingerprint: string): string {
    const hash = createHash("sha256")
      .update(`${ean}|${fingerprint}`)
      .digest("hex")
      .slice(0, 32);

    return `proscai-${hash}`;
  }

  private normalizeAttributes(attributes: CatalogVariantAttributes): CatalogVariantAttributes {
    const normalized: CatalogVariantAttributes = {};

    for (const [key, rawValue] of Object.entries(attributes)) {
      const value = this.normalizeAttributeValue(key as keyof CatalogVariantAttributes, rawValue);
      if (value) normalized[key as keyof CatalogVariantAttributes] = value;
    }

    return normalized;
  }

  private enrichAttributesFromDescription(
    attributes: CatalogVariantAttributes,
    description: string,
  ): CatalogVariantAttributes {
    const normalizedDescription = this.normalizeValue(description) ?? "";
    const enriched = { ...attributes };

    if (/\bACERO\s+ALEADO\b/.test(normalizedDescription)) {
      enriched.material = "ACERO ALEADO";
    }

    if (/\bGALVANIZAD[OA]\b/.test(normalizedDescription)) {
      enriched.acabado = "GALVANIZADO";
    }

    if (!enriched.termino && /\bROSCAD[OA]\b/.test(normalizedDescription)) {
      enriched.termino = "ROSCADO";
    }

    if (!enriched.termino && /\bBISELAD[OA]\b/.test(normalizedDescription)) {
      enriched.termino = "BISELADO";
    }

    if (!enriched.grado) {
      const alloyGrade = normalizedDescription.match(/\bX-\s?(\d{2,3})\b/);
      const stainlessGrade = normalizedDescription.match(/\bT[-\s]?(304|316|321|347)\b/);
      const astmGrade = normalizedDescription.match(/\bA[-\s]?(105|106|234|312|403)\b/);
      const grade = alloyGrade?.[1] ?? stainlessGrade?.[1] ?? astmGrade?.[1];
      if (grade) enriched.grado = grade;
    }

    return enriched;
  }

  private normalizeAttributeValue(
    key: keyof CatalogVariantAttributes,
    rawValue?: string,
  ): string | undefined {
    let value = this.normalizeValue(rawValue);
    if (!value || ["NO ASIGNADO", "SIN ASIGNAR", "GENERAL"].includes(value)) return undefined;

    if (key === "unit") {
      if (value === "METROS") value = "METRO";
      if (value === "TRAMO") value = "TRAMOS";
      if (["PZ", "PZA", "PIEZAS"].includes(value)) value = "PIEZA";
    }

    if (key === "diameter") {
      value = value
        .replace(/\bPULGADAS?\b/g, "")
        .replace(/["¨]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (key === "ced") {
      value = value.replace(/\b(?:CEDULA|CED|SCH)\.?\s*/g, "").trim();
    }

    return value || undefined;
  }

  private normalizeValue(value?: string): string | undefined {
    const normalized = (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

    return normalized || undefined;
  }

  private scoreSourceRecord(record: ProscaiCatalogVariantRecord): number {
    const attributeScore = CRITICAL_ATTRIBUTES.filter((key) => Boolean(record.attributes[key])).length * 10;
    const activeScore = record.isActive ? 100 : 0;
    const longDescriptionScore = record.description2 ? 15 : 0;
    const mexicoScore = record.branchCode === "01" ? 5 : 0;
    const descriptionScore = Math.min(Math.floor(record.originalDescription.length / 40), 5);
    const updateScore = record.sourceUpdatedAt
      ? Math.min(Math.floor(new Date(record.sourceUpdatedAt).getTime() / 1_000_000_000_000), 2)
      : 0;

    return activeScore + attributeScore + longDescriptionScore + mexicoScore + descriptionScore + updateScore;
  }

  private descriptionSimilarity(first: string, second: string): number {
    const firstTokens = this.tokenize(first);
    const secondTokens = this.tokenize(second);
    if (firstTokens.size === 0 || secondTokens.size === 0) return 0;

    let intersection = 0;
    for (const token of firstTokens) {
      if (secondTokens.has(token)) intersection += 1;
    }

    return intersection / new Set([...firstTokens, ...secondTokens]).size;
  }

  private tokenize(value: string): Set<string> {
    return new Set(
      value
        .split(/[^A-Z0-9/.-]+/g)
        .filter((token) => token.length >= 2),
    );
  }

  private buildSummary(
    sourceRecords: ProscaiCatalogVariantSourceRecord[],
    variants: ProscaiCatalogVariant[],
    quarantinedRecords: number,
  ): ProscaiCatalogVariantProjection["summary"] {
    const variantsByEan = new Map<string, number>();
    const reviewReasons = new Map<string, number>();
    const warnings = new Map<string, number>();

    for (const variant of variants) {
      variantsByEan.set(variant.ean, (variantsByEan.get(variant.ean) ?? 0) + 1);
      for (const reason of variant.reviewReasons) {
        reviewReasons.set(reason, (reviewReasons.get(reason) ?? 0) + 1);
      }
      for (const warning of variant.warnings) {
        warnings.set(warning, (warnings.get(warning) ?? 0) + 1);
      }
    }

    const variantCountDistribution = new Map<number, number>();
    for (const count of variantsByEan.values()) {
      variantCountDistribution.set(count, (variantCountDistribution.get(count) ?? 0) + 1);
    }

    return {
      sourceRecords: sourceRecords.length,
      uniqueEans: variantsByEan.size,
      variants: variants.length,
      readyVariants: variants.filter((variant) => variant.status === "READY").length,
      reviewVariants: variants.filter((variant) => variant.status === "REVIEW").length,
      singleVariantEans: Array.from(variantsByEan.values()).filter((count) => count === 1).length,
      multipleVariantEans: Array.from(variantsByEan.values()).filter((count) => count > 1).length,
      quarantinedRecords,
      variantsBySourceBranch: BRANCHES.map((branch) => ({
        branchCode: branch.code,
        branchName: branch.name,
        sourceRecords: sourceRecords.filter((record) => record.branchCode === branch.code).length,
        representedVariants: variants.filter((variant) => (
          variant.sourceBranches.some((sourceBranch) => sourceBranch.code === branch.code)
        )).length,
      })),
      variantsPerEan: Array.from(variantCountDistribution.entries())
        .sort(([first], [second]) => first - second)
        .map(([variantCount, eans]) => ({ variantCount, eans })),
      reviewReasonDistribution: this.sortDistribution(reviewReasons, "reason", "variants"),
      warningDistribution: this.sortDistribution(warnings, "warning", "variants"),
    };
  }

  private sortDistribution(
    distribution: Map<string, number>,
    labelKey: "reason" | "warning",
    countKey: "variants",
  ): Array<any> {
    return Array.from(distribution.entries())
      .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
      .map(([label, count]) => ({ [labelKey]: label, [countKey]: count }));
  }

  private findLatestSourceUpdate(records: ProscaiCatalogVariantSourceRecord[]): string | undefined {
    return records
      .map((record) => record.sourceUpdatedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
  }
}

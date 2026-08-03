import { detectProducto } from "./helpers/detect-product.helper";
import {
  buscarCostura,
  cleanDiameter,
  detectarMaterialPlastico,
  esPlasticoDesdeBD,
  extractAnguloRadio,
  extraerCedulaDeDescripcion,
  extraerFiguraDeDescripcion,
  extraerGradoMaterialBrida,
  extraerPresion,
  normalizarDescripcionSWPorCedula,
  normalizarGrados,
  normalizeValue,
  quitarPalabraBrida,
  sanitizeForDB,
  verifyData,
} from "./helpers/catalog-normalization.helpers";

export interface ProscaiCatalogSourceInput {
  ean: string;
  icod: string;
  description1: string;
  description2: string;
  fam2: string;
  fam3: string;
  fam4: string;
  fam5: string;
  fam7: string;
  fam8: string;
  famc: string;
  unit: string;
}

type QueryRow = Record<string, any>;

export class ProscaiCatalogNormalizerService {
  private readonly plasticMaterials = ["HDPE", "PVC", "PLASTICO", "CPVC", "PPR"];

  public normalizeCatalogProduct(source: ProscaiCatalogSourceInput) {
    const sourceDescription = source.description2.trim() || source.description1.trim();
    const categoryBucket = this.resolveCatalogCategoryBucket(source, sourceDescription);
    const preview = this.mapPreviewRow({
      ICOD: source.icod,
      ean: source.ean,
      description1: source.description1,
      description2: source.description2,
      source_description: sourceDescription,
      category_bucket: categoryBucket,
      fam2: source.fam2,
      fam3: source.fam3,
      fam4: source.fam4,
      fam5: source.fam5,
      fam7: source.fam7,
      fam8: source.fam8,
      famc: source.famc,
      unidad: source.unit,
    });
    const normalized = preview.normalized;
    const categoryInfo = this.resolveCategoryInfo(preview.categoryBucket, normalized);

    return {
      ean: this.requireCatalogValue(source.ean, "EAN"),
      icod: this.requireCatalogValue(source.icod, "ICOD"),
      originalDescription: sourceDescription,
      normalizedDescription: this.readCatalogValue(normalized.description) ?? sourceDescription,
      category: categoryInfo.category,
      subcategory: categoryInfo.subcategory,
      categoryBucket: preview.categoryBucket,
      product: this.readCatalogValue(normalized.product),
      tipo: this.readCatalogValue(normalized.tipo),
      subtipo: this.readCatalogValue(normalized.subtipo),
      material: this.readCatalogValue(normalized.material),
      diameter: this.readCatalogValue(normalized.diameter),
      ced: this.readCatalogValue(normalized.ced),
      termino: this.readCatalogValue(normalized.termino),
      costura: this.readCatalogValue(normalized.costura),
      acabado: this.readCatalogValue(normalized.acabado),
      figura: this.readCatalogValue(normalized.figura),
      radio: this.readCatalogValue(normalized.radio),
      angulo: this.readCatalogValue(normalized.angulo),
      grado: this.readCatalogValue(normalized.grado),
      presion: this.readCatalogValue(normalized.presion),
      unit: this.readCatalogValue(source.unit),
      isActive: true,
    };
  }

  private resolveCatalogCategoryBucket(source: ProscaiCatalogSourceInput, description: string): string {
    const ean = source.ean.trim().toUpperCase();
    const normalizedDescription = description.trim().toUpperCase();
    const material = source.fam4.trim().toUpperCase();

    if (ean.startsWith("V")) return "VALVULA";
    if (ean.startsWith("TSC") || ean.startsWith("TCC")) return "TUBO_ACERO";
    if (normalizedDescription.startsWith("CODO")) return "CODO";
    if (normalizedDescription.startsWith("BRIDA")) return "BRIDA";
    if (normalizedDescription.startsWith("TUB") && this.plasticMaterials.includes(material)) {
      return "TUBO_PLASTICO";
    }
    return "GENERAL";
  }

  private mapPreviewRow(row: QueryRow): { categoryBucket: string; normalized: QueryRow } {
    const categoryBucket = row.category_bucket;
    const sourceDescription = row.source_description;

    if (categoryBucket === "VALVULA" || categoryBucket === "CODO") {
      const diameter = row.fam8 ? cleanDiameter(row.fam8) : "";
      const cedOrSw = ((row.fam7 === "STD" || row.fam7 === "40") && row.fam7)
        ?? ((row.fam5 === "SW") && row.fam5);
      const figura = extraerFiguraDeDescripcion(sourceDescription) ?? "";
      const description = normalizarDescripcionSWPorCedula(sourceDescription, cedOrSw) ?? sourceDescription;
      const ced = row.fam7 && row.fam7.toUpperCase() !== "NO ASIGNADO" && row.fam7 !== ""
        ? row.fam7.toUpperCase()
        : extraerCedulaDeDescripcion(sourceDescription) ?? "";
      const common = {
        id: normalizarGrados(row.ean),
        product: categoryBucket === "VALVULA" ? "VALVULA" : "CODO",
        material: row.fam4 ? normalizeValue(row.fam4) : "",
        diameter,
        ced,
        termino: row.fam5 === "NO ASIGNADO" ? "" : row.fam5,
        acabado: row.famc === "NO ASIGNADO" ? "" : row.famc,
        figura,
        originalDescription: sourceDescription,
        ean: row.ean,
        description: normalizeValue(`${description} ${row.fam4 ? normalizeValue(row.fam4) : ""}`.trim()),
      };
      if (categoryBucket === "VALVULA") {
        return {
          categoryBucket,
          normalized: {
            ...common,
            subtipo: row.fam3 === "NO ASIGNADO" ? "" : row.fam3,
          },
        };
      }
      const { angulo, radio } = extractAnguloRadio(
        row.fam3 === "NO ASIGNADO" || !row.fam3 ? sourceDescription : row.fam3,
      );
      return {
        categoryBucket,
        normalized: { ...common, radio: radio ?? "", angulo: angulo ?? "" },
      };
    }

    if (categoryBucket === "BRIDA") {
      return {
        categoryBucket,
        normalized: {
          id: row.ean,
          product: "BRIDA",
          material: row.fam4 ? normalizeValue(row.fam4) : "",
          tipo: quitarPalabraBrida(row.fam3),
          grado: extraerGradoMaterialBrida(sourceDescription) ?? "",
          diameter: row.fam8 === "NO ASIGNADO" || !row.fam8 ? "" : cleanDiameter(row.fam8),
          presion: extraerPresion(sourceDescription) ?? "",
          ced: row.fam7 === "NO ASIGNADO" ? "" : row.fam7,
          acabado: row.famc === "NO ASIGNADO" ? "" : row.famc,
          termino: row.fam5 === "NO ASIGNADO" ? "" : row.fam5,
          originalDescription: sourceDescription,
          ean: row.ean,
          description: normalizeValue(sourceDescription),
        },
      };
    }

    if (categoryBucket === "TUBO_ACERO") {
      const material = this.resolveSteelMaterial(row.fam4, sourceDescription);
      const diameter = this.resolveSteelDiameter(row.fam8, sourceDescription);
      const ced = verifyData(row.fam7) ?? (extraerCedulaDeDescripcion(sourceDescription) ?? "");
      const costura = buscarCostura(normalizeValue(row.fam3) ?? "")
        ?? buscarCostura(normalizeValue(sourceDescription) ?? "")
        ?? "";
      const termino = verifyData(row.fam5) ?? "";
      const acabado = verifyData(row.famc) ?? "";
      const description = this.buildSteelPipeDescription({
        material,
        diameter,
        ced,
        costura,
        termino,
        acabado,
        unit: verifyData(row.unidad) ?? "",
        fallback: sourceDescription,
      });
      return {
        categoryBucket,
        normalized: {
          id: row.ean,
          product: "TUBO",
          costura,
          material,
          diameter,
          ced,
          termino,
          acabado,
          originalDescription: sourceDescription,
          ean: row.ean,
          description: normalizeValue(description),
        },
      };
    }

    if (categoryBucket === "TUBO_PLASTICO") {
      const ced = verifyData(row.fam7) ?? (extraerCedulaDeDescripcion(sourceDescription) ?? "");
      const termino = verifyData(row.fam5) ?? "";
      return {
        categoryBucket,
        normalized: {
          id: row.ean,
          product: "TUBO",
          tipo: "PLASTICO",
          costura: "",
          material: row.fam4 ? normalizeValue(row.fam4) : "",
          diameter: row.fam8 === "NO ASIGNADO" || !row.fam8 ? "" : cleanDiameter(row.fam8),
          termino,
          ced,
          originalDescription: sourceDescription,
          ean: row.ean,
          description: normalizeValue(`${sourceDescription} en ${row.unidad}`),
        },
      };
    }

    const product = detectProducto(sourceDescription);
    const diameter = row.fam8 ? cleanDiameter(row.fam8) : "";
    const plasticMaterial = esPlasticoDesdeBD(row.fam4)
      ? detectarMaterialPlastico(sourceDescription) || row.fam4
      : row.fam4;
    const { angulo, radio } = extractAnguloRadio(
      row.fam3 === "NO ASIGNADO" || !row.fam3 ? sourceDescription : row.fam3,
    );
    return {
      categoryBucket,
      normalized: {
        id: sanitizeForDB(normalizarGrados(row.ean)),
        product,
        material: plasticMaterial === "NO ASIGNADO" ? "" : normalizeValue(plasticMaterial),
        diameter: diameter === "NO ASIGNADO" ? "" : diameter,
        ced: extraerCedulaDeDescripcion(sourceDescription) ?? "",
        termino: row.fam5 === "NO ASIGNADO" ? "" : row.fam5,
        acabado: row.famc === "NO ASIGNADO" ? "" : row.famc,
        subtipo: row.fam3 === "NO ASIGNADO" ? "" : row.fam3,
        figura: extraerFiguraDeDescripcion(sourceDescription) ?? "",
        radio: radio ?? "",
        angulo: angulo ?? "",
        costura: buscarCostura(row.fam3 ? normalizeValue(row.fam3) ?? "" : "") ?? "",
        tipo: row.fam2,
        grado: extraerGradoMaterialBrida(sourceDescription) ?? "",
        presion: extraerPresion(sourceDescription) ?? "",
        originalDescription: sourceDescription,
        ean: row.ean,
        description: normalizarDescripcionSWPorCedula(sourceDescription, row.fam7) ?? sourceDescription,
      },
    };
  }

  private resolveSteelMaterial(familyMaterial: string, description: string): string {
    const normalizedDescription = normalizeValue(description) ?? "";
    if (/\b(A\/INOX|ACERO\s+INOX(?:IDABLE)?)\b/.test(normalizedDescription)) {
      return "ACERO INOXIDABLE";
    }
    if (/\b(A\/CARBON|ACERO\s+AL\s+CARBON)\b/.test(normalizedDescription)) {
      return "ACERO AL CARBON";
    }
    return verifyData(familyMaterial) ? (normalizeValue(familyMaterial) ?? "") : "";
  }

  private resolveSteelDiameter(familyDiameter: string, description: string): string {
    const assignedDiameter = verifyData(familyDiameter);
    if (assignedDiameter) return cleanDiameter(assignedDiameter);
    const match = description.match(/\b(\d+(?:\s+\d+\/\d+|\/\d+)?)\s*["¨]/);
    return match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  }

  private buildSteelPipeDescription(values: {
    material: string;
    diameter: string;
    ced: string;
    costura: string;
    termino: string;
    acabado: string;
    unit: string;
    fallback: string;
  }): string {
    const technicalParts = [
      "TUBO",
      values.material ? `DE ${values.material}` : "",
      values.costura ? `(${values.costura})` : "",
      values.diameter || values.ced ? `(${[values.diameter, values.ced].filter(Boolean).join(" ")})` : "",
      values.unit ? `EN ${values.unit}` : "",
      values.termino,
      values.acabado,
    ].filter(Boolean);
    return technicalParts.length <= 2
      ? normalizeValue(values.fallback) ?? ""
      : normalizeValue(technicalParts.join(" ")) ?? "";
  }

  private resolveCategoryInfo(categoryBucket: string, normalized: QueryRow) {
    if (categoryBucket === "VALVULA") return { category: "VALVULAS", subcategory: normalized.subtipo || "VALVULA" };
    if (categoryBucket === "TUBO_ACERO") return { category: "TUBERIA", subcategory: "TUBO_ACERO" };
    if (categoryBucket === "TUBO_PLASTICO") return { category: "TUBERIA", subcategory: "TUBO_PLASTICO" };
    if (categoryBucket === "CODO") return { category: "CONEXIONES", subcategory: "CODO" };
    if (categoryBucket === "BRIDA") return { category: "CONEXIONES", subcategory: normalized.tipo || "BRIDA" };
    return {
      category: this.resolveGeneralCategory(normalized.product),
      subcategory: normalized.product || "GENERAL",
    };
  }

  private resolveGeneralCategory(product?: string): string {
    const normalized = (product ?? "").toUpperCase();
    if (normalized === "TUBO") return "TUBERIA";
    if (["VALVULA", "LLAVE", "HIDRANTE"].includes(normalized)) return "VALVULAS";
    if ([
      "CODO", "BRIDA", "TEE", "YEE", "CRUZ", "CURVA", "REDUCCION", "COPLE", "NIPLE",
      "TAPON", "ADAPTADOR", "CONECTOR", "UNION", "OLET", "SWAGE", "STUB-END", "MANGUITO",
      "CONTRABRIDA", "INSERTO", "MONTURA",
    ].includes(normalized)) return "CONEXIONES";
    if (["SOPORTE", "ESPARRAGO", "TUERCA", "TORNILLO", "ARANDELA", "BARRA", "PERFIL"].includes(normalized)) {
      return "SOPORTERIA";
    }
    return "ACCESORIOS";
  }

  private requireCatalogValue(value: string, field: string): string {
    const normalized = value.trim();
    if (!normalized) throw new Error(`Producto Proscai sin ${field}.`);
    return normalized;
  }

  private readCatalogValue(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const normalized = value.trim();
    return normalized && normalized.toUpperCase() !== "NO ASIGNADO" ? normalized : undefined;
  }
}

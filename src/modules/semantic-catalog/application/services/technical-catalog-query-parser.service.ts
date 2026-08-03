import { ParsedCatalogSearchQuery } from "../../domain/entities/catalog-search-query.entity";

export class TechnicalCatalogQueryParserService {
  public static parse(query: string): ParsedCatalogSearchQuery {
    const normalizedQuery = this.normalize(query);
    const product = this.extractProduct(normalizedQuery);
    const family = this.resolveFamily(product);

    return {
      originalQuery: query,
      normalizedQuery,
      family,
      ...(family === "PIPE" ? { category: "TUBERIA" } : {}),
      ...(family === "FITTING" ? { category: "CONEXIONES" } : {}),
      ...(family === "VALVE" ? { category: "VALVULAS" } : {}),
      ...(family === "FLANGE" ? { category: "CONEXIONES" } : {}),
      ...this.optional("product", product),
      ...this.optional("material", this.extractMaterial(normalizedQuery)),
      ...this.optional("diameter", this.extractDiameter(normalizedQuery)),
      ...this.optional("ced", this.extractCed(normalizedQuery)),
      ...this.optional("costura", this.extractCostura(normalizedQuery)),
      ...this.optional("termino", this.extractTermino(normalizedQuery)),
      ...this.optional("acabado", this.extractAcabado(normalizedQuery)),
      ...this.optional("angulo", this.extractAngulo(normalizedQuery)),
      ...this.optional("presion", this.extractPresion(normalizedQuery)),
      ...this.optional("norma", this.extractNorma(normalizedQuery)),
      ...this.optional("unit", this.extractUnit(normalizedQuery)),
      ...this.optional("figura", this.extractFigura(normalizedQuery)),
      ...this.optional("radio", this.extractRadio(normalizedQuery)),
      ...this.optional("connectionGender", this.extractConnectionGender(normalizedQuery)),
      ...this.optional("subtipo", this.extractValveSubtype(normalizedQuery)),
      ...this.optional("actuation", this.extractValveActuation(normalizedQuery)),
      ...this.optional("tipo", this.extractFlangeType(normalizedQuery)),
      ...this.optional("face", this.extractFlangeFace(normalizedQuery)),
      ...this.optional("grado", this.extractGrade(normalizedQuery)),
    };
  }

  private static resolveFamily(product?: string): "PIPE" | "FITTING" | "VALVE" | "FLANGE" | "GENERIC" {
    if (product === "TUBO") return "PIPE";
    if (product === "VALVULA") return "VALVE";
    if (product === "BRIDA") return "FLANGE";
    if ([
      "CODO",
      "TEE",
      "YEE",
      "REDUCCION",
      "NIPLE",
      "COPLE",
      "UNION",
      "ADAPTADOR",
      "CRUZ",
      "TAPON",
      "PORTABRIDA",
    ].includes(product ?? "")) return "FITTING";

    return "GENERIC";
  }

  private static extractProduct(query: string): string | undefined {
    const products: Array<[RegExp, string]> = [
      [/\b(?:TUBERIA|TUBOS?)\b/, "TUBO"],
      [/\bVALV(?:ULA)?\b/, "VALVULA"],
      [/\bBRIDAS?\b/, "BRIDA"],
      [/\bCODOS?\b/, "CODO"],
      [/\bTEES?\b/, "TEE"],
      [/\b(?:REDUCCION(?:ES)?|REDUCTOR(?:ES)?)\b/, "REDUCCION"],
      [/\bNIPLES?\b/, "NIPLE"],
      [/\bCOPLES?\b/, "COPLE"],
      [/\bUNION(?:ES)?\b/, "UNION"],
      [/\bADAPTADORES?\b/, "ADAPTADOR"],
      [/\b(?:CRUZ|CRUCES)\b/, "CRUZ"],
      [/\b(?:TAPON|TAPONES)\b/, "TAPON"],
      [/\b(?:PORTA\s*BRIDA|PORTABRIDAS?)\b/, "PORTABRIDA"],
      [/\bYEES?\b/, "YEE"],
    ];

    return products.find(([pattern]) => pattern.test(query))?.[1];
  }

  private static extractMaterial(query: string): string | undefined {
    const materials: Array<[RegExp, string]> = [
      [/\b(?:ACERO\s+(?:AL\s+)?CARBON|A\s*\/\s*C)\b/, "ACERO AL CARBON"],
      [/\b(?:ACERO\s+INOXIDABLE|ACERO\s+INOX|INOXIDABLE|A\s*\/\s*INOX)\b/, "ACERO INOXIDABLE"],
      [/\b(?:HIERRO\s+DUCTIL|HIERRO\s+FUNDIDO)\b/, "HIERRO"],
      [/\bHIERRO\b/, "HIERRO"],
      [/\bACERO\b/, "ACERO"],
      [/\bCPVC\b/, "CPVC"],
      [/\bPVC\b/, "PVC"],
      [/\bPPR(?:C)?\b/, "PPR"],
      [/\b(?:HDPE|PEAD)\b/, "HDPE"],
      [/\bCOBRE\b/, "COBRE"],
      [/\bBRONCE\b/, "BRONCE"],
      [/\bLATON\b/, "LATON"],
    ];

    return materials.find(([pattern]) => pattern.test(query))?.[1];
  }

  private static extractDiameter(query: string): string | undefined {
    const numeric = query.match(
      /(?:^|\s)(\d+(?:\.\d+)?(?:\s+\d+\s*\/\s*\d+|\s*\/\s*\d+)?)\s*(?:["¨]|PULG(?:ADA|ADAS)?\b|INCH(?:ES)?\b|IN\b)/,
    );
    if (numeric?.[1]) {
      return numeric[1].replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();
    }

    const fraction = query.match(/(?:^|\s)(\d+(?:\s+\d+)?\s*\/\s*\d+)(?=\s|$)/);
    if (fraction?.[1]) {
      return fraction[1].replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();
    }

    const words: Record<string, string> = {
      MEDIA: "1/2",
      MEDIO: "1/2",
      UNA: "1",
      UNO: "1",
      DOS: "2",
      TRES: "3",
      CUATRO: "4",
      CINCO: "5",
      SEIS: "6",
      OCHO: "8",
      DIEZ: "10",
      DOCE: "12",
    };
    const written = query.match(
      /\b(MEDIA|MEDIO|UNA|UNO|DOS|TRES|CUATRO|CINCO|SEIS|OCHO|DIEZ|DOCE)\s+PULG(?:ADA|ADAS)?\b/,
    );

    return written?.[1] ? words[written[1]] : undefined;
  }

  private static extractCed(query: string): string | undefined {
    return query.match(/\b(?:CED(?:ULA)?|SCH(?:EDULE)?)\.?\s*(\d+|STD|XS|XXS)\b/)?.[1];
  }

  private static extractCostura(query: string): string | undefined {
    if (/\bSIN\s+COSTURA\b|\bS\s*\/\s*C\b/.test(query)) return "SIN COSTURA";
    if (/\bCON\s+COSTURA\b|\bC\s*\/\s*C\b/.test(query)) return "CON COSTURA";
    return undefined;
  }

  private static extractTermino(query: string): string | undefined {
    const terms: Array<[RegExp, string]> = [
      [/\bRANURAD[OA]S?\b/, "RANURADO"],
      [/\bBRIDAD[OA]S?\b/, "BRIDADO"],
      [/\bWAFER\b/, "WAFER"],
      [/\bLUG\b/, "LUG"],
      [/\bBISELAD[OA]S?\b/, "BISELADO"],
      [/\bROSCAD[OA]S?\b/, "ROSCADO"],
      [/\b(?:ROSCA|CUERDA)\s+(?:INTERIOR|EXTERIOR)\b/, "ROSCADO"],
      [/\b(?:BUTT\s*WELD|B\s*\/\s*W|BW)\b/, "SOLDABLE A TOPE"],
      [/\b(?:SOLDABLE|SOLDAR)\s+A\s+TOPE\b/, "SOLDABLE A TOPE"],
      [/\b(?:SOLDABLE|SOLDAR|SOCKET\s*WELD|S\s*\/\s*W|SW)\b/, "SOLDABLE"],
      [/\bCEMENTAR\b/, "CEMENTAR"],
      [/\b(?:LISO|PLANO)S?\b/, "PLANO"],
      [/\bCAMPANA\b/, "CAMPANA"],
    ];

    return terms.find(([pattern]) => pattern.test(query))?.[1];
  }

  private static extractAcabado(query: string): string | undefined {
    const finishes: Array<[RegExp, string]> = [
      [/\bGALVANIZAD[OA]S?\b|\bGALV\.?\b/, "GALVANIZADO"],
      [/\bNEGROS?\b/, "NEGRO"],
      [/\bEPOX(?:ICO|ICA)?\b/, "EPOXICO"],
      [/\bPINTAD[OA]S?\b/, "PINTADO"],
    ];

    return finishes.find(([pattern]) => pattern.test(query))?.[1];
  }

  private static extractAngulo(query: string): string | undefined {
    return query.match(/\b(\d{2,3})\s*(?:GRADOS?\b|°)/)?.[1];
  }

  private static extractPresion(query: string): string | undefined {
    const pressure = query.match(/\b(\d+(?:\.\d+)?)\s*(PSI|LBS?|BAR)\b/);
    if (pressure) return `${pressure[1]} ${pressure[2].replace(/^LB$/, "LBS")}`;

    const reversedPressure = query.match(/\b(PSI|LBS?|BAR)\s*(\d+(?:\.\d+)?)\b/);
    if (reversedPressure) {
      return `${reversedPressure[2]} ${reversedPressure[1].replace(/^LB$/, "LBS")}`;
    }

    const pressureClass = query.match(/\b(?:CLASE|CLASS)\s*(\d+)\b/);
    return pressureClass?.[1] ? `CLASE ${pressureClass[1]}` : undefined;
  }

  private static extractNorma(query: string): string | undefined {
    return query.match(/\b(ASTM\s*[- ]?\s*[A-Z]?\s*\d+[A-Z]?)\b/)?.[1]
      ?.replace(/\s+/g, " ")
      .replace("ASTM-", "ASTM ");
  }

  private static extractUnit(query: string): string | undefined {
    if (/\b(?:EN\s+)?METROS?\b/.test(query)) return "METRO";
    if (/\bTRAMOS?\b/.test(query)) return "TRAMO";
    if (/\bPIEZAS?\b/.test(query)) return "PIEZA";
    return undefined;
  }

  private static extractFigura(query: string): string | undefined {
    const figure = query.match(/\b(?:FIGURA|FIG\.?|F\.?)\s*[-.]?\s*([0-9][A-Z0-9-]*)\b/)?.[1];
    if (figure) return figure;
    if (/\bCONCENTRIC[OA]\b/.test(query)) return "CONCENTRICA";
    if (/\bEXCENTRIC[OA]\b/.test(query)) return "EXCENTRICA";
    if (/\bRECT[OA]\b/.test(query)) return "RECTA";
    return undefined;
  }

  private static extractRadio(query: string): string | undefined {
    if (/\b(?:RADIO\s+LARGO|LONG\s+RADIUS|LR)\b/.test(query)) return "RADIO LARGO";
    if (/\b(?:RADIO\s+CORTO|SHORT\s+RADIUS|SR)\b/.test(query)) return "RADIO CORTO";
    return undefined;
  }

  private static extractConnectionGender(query: string): string | undefined {
    if (/\b(?:CUERDA|ROSCA)\s+INTERIOR\b|\bHEMBRA\b|\bHH\b/.test(query)) return "INTERIOR";
    if (/\b(?:CUERDA|ROSCA)\s+EXTERIOR\b|\bMACHO\b|\bMM\b/.test(query)) return "EXTERIOR";
    return undefined;
  }

  private static extractValveSubtype(query: string): string | undefined {
    const subtypes: Array<[RegExp, string]> = [
      [/\bCOMPUERTA\b/, "COMPUERTA"],
      [/\bGLOBO\b/, "GLOBO"],
      [/\bMARIPOSA\b/, "MARIPOSA"],
      [/\b(?:CHECK|RETENCION)\b/, "CHECK"],
      [/\bBOLA\b/, "BOLA"],
      [/\bAGUJA\b/, "AGUJA"],
      [/\bDIAFRAGMA\b/, "DIAFRAGMA"],
      [/\bMACHO\b/, "MACHO"],
      [/\bALIVIO\b/, "ALIVIO"],
      [/\bSEGURIDAD\b/, "SEGURIDAD"],
    ];

    return subtypes.find(([pattern]) => pattern.test(query))?.[1];
  }

  private static extractValveActuation(query: string): string | undefined {
    const actuations: Array<[RegExp, string]> = [
      [/\bPALANCA\b/, "PALANCA"],
      [/\bVOLANTE\b/, "VOLANTE"],
      [/\b(?:ENGRANAJE|GEAR)\b/, "ENGRANAJE"],
      [/\bACTUADOR\s+ELECTRIC[OA]\b|\bMOTORIZAD[OA]\b/, "ACTUADOR ELECTRICO"],
      [/\bACTUADOR\s+NEUMATIC[OA]\b/, "ACTUADOR NEUMATICO"],
      [/\bSOLENOIDE\b/, "SOLENOIDE"],
    ];

    return actuations.find(([pattern]) => pattern.test(query))?.[1];
  }

  private static extractFlangeType(query: string): string | undefined {
    const types: Array<[RegExp, string]> = [
      [/\b(?:WELD\s+NECK|WN|CUELLO\s+SOLDABLE|CON\s+CUELLO)\b/, "CON CUELLO"],
      [/\b(?:SLIP\s+ON|SO|DESLIZABLE|SIN\s+CUELLO)\b/, "SIN CUELLO"],
      [/\b(?:BRIDA\s+)?(?:CIEGA|BLIND)\b/, "CIEGA"],
      [/\b(?:SOCKET\s+WELD|SW)\b/, "SOCKET WELD"],
      [/\b(?:ROSCADA|THREADED)\b/, "ROSCADA"],
      [/\b(?:LAP\s+JOINT|LJ)\b/, "LAP JOINT"],
      [/\b(?:ORIFICIO|ORIFICE)\b/, "ORIFICIO"],
    ];

    return types.find(([pattern]) => pattern.test(query))?.[1];
  }

  private static extractFlangeFace(query: string): string | undefined {
    if (/\b(?:RTJ|R\s*\.\s*T\s*\.\s*J|RING\s+TYPE\s+JOINT)\b/.test(query)) return "RTJ";
    if (/\b(?:RF|CARA\s+REALZADA|C\s*\.\s*R)\b/.test(query)) return "RF";
    if (/\b(?:FF|CARA\s+PLANA|C\s*\.\s*P)\b/.test(query)) return "FF";
    return undefined;
  }

  private static extractGrade(query: string): string | undefined {
    const astmGrade = query.match(/\bA\s*[- ]?\s*(\d{3})(?:\s*[- ]?\s*(LF\d))?\b/);
    if (astmGrade) return `A${astmGrade[1]}${astmGrade[2] ? ` ${astmGrade[2]}` : ""}`;

    const alloyGrade = query.match(/\b([FT])\s*[- ]?\s*(\d{3}L?)\b/);
    return alloyGrade ? `${alloyGrade[1]}${alloyGrade[2]}` : undefined;
  }

  private static optional(key: string, value?: string): Record<string, string> {
    return value ? { [key]: value } : {};
  }

  private static normalize(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .toUpperCase()
      .trim();
  }
}

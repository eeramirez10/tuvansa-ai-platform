export interface PdfPositionedLineToken {
  text: string;
  x: number;
}

export class PdfDigitalReconciliationService {
  private readonly unitTokens: Set<string>;
  private readonly noisePatterns: RegExp[];
  private readonly domainHintTokens: string[];

  constructor() {
    this.unitTokens = new Set<string>([
      "pzas",
      "pza",
      "pz",
      "pieza",
      "piezas",
      "kg",
      "kgs",
      "k",
      "kilo",
      "m",
      "mt",
      "mtr",
      "ft",
      "tr",
      "tramo",
      "tramos",
      "tmo",
      "tmos",
      "se",
      "servicio",
      "servicios",
      "l",
      "lt",
      "lts",
      "litro",
      "litros",
      "act",
      "actividad",
      "ft",
      "pie",
      "pies",
      "xro",
      "rollo",
      "rollos",
      "uno",
      "unidad",
      "m2",
      "mt2",
      "mts2",
      "lot",
      "lote",
      "con",
      "conjunto",
    ]);

    this.noisePatterns = [
      /^solicitud de compra de materiales/i,
      /^litos monterrey/i,
      /^red de hidrantes interiores/i,
      /^especificaciones$/i,
      /^sci$/i,
      /^instalacion de hidrantes interiores/i,
      /^inocencio alvarado/i,
      /^lista de materiales requeridos$/i,
      /^croquis o plano de ubicacion$/i,
      /^fecha:/i,
      /^parque:/i,
      /^proceso:/i,
      /^area o depto:/i,
      /^supervisor y\/o residente:/i,
      /^descripcion del producto/i,
    ];

    this.domainHintTokens = [
      "tubo",
      "acero",
      "valvula",
      "válvula",
      "cople",
      "codo",
      "reduccion",
      "reducción",
      "te ",
      "tee",
      "adaptador",
      "niple",
      "brida",
      "flange",
      "ranurado",
      "roscado",
      "astm",
      "ul",
      "victaulic",
      "mca.",
      "serie",
      "estilo",
      "fig.",
    ];
  }

  public reconcilePage(
    pageText: string,
    positionedLines: PdfPositionedLineToken[][] = [],
  ): string {
    const lines = this.toLines(pageText);
    const tableRows = this.extractStructuredTableRows(positionedLines);
    if (tableRows.length > 0) {
      return `${lines.join("\n")}\n\nEXTRACTION_HINTS\nSTRUCTURED_TABLE_ROWS\n${tableRows.join("\n")}`.trim();
    }

    const quantityLines = this.extractAllQuantityLines(lines);
    const descriptionLines = this.extractDescriptionCandidates(lines);
    const structuredLines = this.buildStructuredBlock(quantityLines, descriptionLines);

    if (structuredLines.length === 0) {
      return lines.join("\n");
    }

    return `${lines.join("\n")}\n\nEXTRACTION_HINTS\n${structuredLines.join("\n")}`.trim();
  }

  private extractStructuredTableRows(lines: PdfPositionedLineToken[][]): string[] {
    const headerIndex = lines.findIndex((line) => this.isTechnicalTableHeader(line));
    if (headerIndex < 0) return [];

    const header = lines[headerIndex]!;
    const columns = this.resolveColumns(header);
    if (!columns.description || !columns.unit || !columns.quantity) return [];

    const technicalColumns = Object.entries(columns)
      .filter(([key]) => !["ident", "description", "unit", "quantity"].includes(key))
      .map(([key, column]) => ({ key, ...column! }))
      .sort((a, b) => a.x - b.x);
    const firstTechnicalX = technicalColumns[0]?.x ?? columns.unit.x;
    const rows: string[] = [];

    for (const line of lines.slice(headerIndex + 1)) {
      const unit = this.valueInColumn(line, columns.unit.x, columns.quantity.x);
      const quantity = this.valueInColumn(line, columns.quantity.x, Number.POSITIVE_INFINITY);
      if (!unit || !this.isNumeric(quantity)) continue;

      const leadingText = line
        .filter((token) => token.x < firstTechnicalX - 2)
        .sort((a, b) => a.x - b.x)
        .map((token) => token.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const { sourceId, description } = this.splitSourceId(leadingText, Boolean(columns.ident));
      if (!description) continue;

      const parts = [
        sourceId ? `SOURCE_ID=${sourceId}` : null,
        `DESCRIPTION=${description}`,
      ];
      const technicalValues: Record<string, string> = {};
      for (let index = 0; index < technicalColumns.length; index += 1) {
        const column = technicalColumns[index]!;
        const nextX = technicalColumns[index + 1]?.x ?? columns.unit.x;
        const value = this.normalizeTechnicalValue(this.valueInColumn(line, column.x, nextX));
        if (value) technicalValues[column.key] = value;
      }
      const descriptionSuffix = this.buildNaturalDescriptionSuffix(technicalValues);
      if (descriptionSuffix) parts.push(`DESCRIPTION_SUFFIX=${descriptionSuffix}`);
      parts.push(`UNIT=${unit}`, `QUANTITY=${quantity}`);
      rows.push(`ROW_${rows.length + 1}: ${parts.filter(Boolean).join(" | ")}`);
    }

    return rows.slice(0, 200);
  }

  private isTechnicalTableHeader(line: PdfPositionedLineToken[]): boolean {
    const normalized = line.map((token) => this.normalizeHeader(token.text));
    return normalized.some((value) => value.includes("DESCRIPCION")) &&
      normalized.some((value) => value.includes("UNIDAD")) &&
      normalized.some((value) => value.includes("CANTIDAD")) &&
      normalized.some((value) => /DIAM|SCH|CEDULA|ESPESOR|NORMA|PRESION|CLASE|BORE/.test(value));
  }

  private resolveColumns(line: PdfPositionedLineToken[]): Record<string, { x: number; header: string } | undefined> {
    const columns: Record<string, { x: number; header: string } | undefined> = {};
    for (const token of [...line].sort((a, b) => a.x - b.x)) {
      const header = this.normalizeHeader(token.text);
      const key = this.columnKey(header);
      if (key && !columns[key]) columns[key] = { x: token.x, header };
    }
    return columns;
  }

  private columnKey(header: string): string | null {
    if (/^(IDENT|ID|CODIGO|COD)$/.test(header)) return "ident";
    if (header.includes("DESCRIPCION")) return "description";
    if (header.includes("UNIDAD") || header === "UM" || header === "U M") return "unit";
    if (header.includes("CANTIDAD") || header === "CANT") return "quantity";
    if (/DIAM(?:ETRO)?\s*1/.test(header)) return "diameter1";
    if (/DIAM(?:ETRO)?\s*2/.test(header)) return "diameter2";
    if (/^(SCH|SCH1|CED|CEDULA)/.test(header)) return "schedule";
    if (header.includes("NORMA") || header.includes("STANDARD")) return "standard";
    if (header.includes("ESPESOR") || header.includes("THICKNESS")) return "thickness";
    if (header.includes("PRESION") || header.includes("PRESSURE")) return "pressure";
    if (header.includes("CLASE") || header.includes("CLASS")) return "class";
    if (header.includes("BORE")) return "bore";
    if (header.includes("MATERIAL")) return "material";
    if (header.includes("MARCA") || header.includes("BRAND")) return "brand";
    return null;
  }

  private valueInColumn(line: PdfPositionedLineToken[], startX: number, endX: number): string {
    return line
      .filter((token) => token.x >= startX - 2 && token.x < endX - 2)
      .sort((a, b) => a.x - b.x)
      .map((token) => token.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private splitSourceId(value: string, hasIdentColumn: boolean): { sourceId: string | null; description: string } {
    if (!hasIdentColumn) return { sourceId: null, description: value };
    const match = value.match(/^(\S+)\s+(.+)$/);
    return match
      ? { sourceId: match[1]!, description: match[2]!.trim() }
      : { sourceId: null, description: value };
  }

  private normalizeTechnicalValue(value: string): string | null {
    const normalized = value.trim();
    if (!normalized || /^[-–—]+$/.test(normalized) || /^0(?:\.0+)?$/.test(normalized)) return null;
    return normalized.startsWith(".") ? `0${normalized}` : normalized;
  }

  private buildNaturalDescriptionSuffix(values: Record<string, string>): string {
    const parts: string[] = [];
    const diameters = [values.diameter1, values.diameter2]
      .filter((value): value is string => Boolean(value))
      .map((value) => `${value.replace(/\s*(?:PULG(?:ADAS?)?|IN(?:CH(?:ES)?)?|["”])$/i, "")}"`);
    if (diameters.length > 0) parts.push(diameters.join(" X "));

    if (values.schedule) {
      const schedule = values.schedule
        .replace(/^(?:S-|SCH(?:EDULE)?\.?\s*|CED(?:ULA)?\.?\s*)/i, "")
        .trim();
      if (schedule) parts.push(`CED. ${schedule}`);
    }

    ["standard", "material", "thickness", "pressure"].forEach((key) => {
      if (values[key]) parts.push(values[key]);
    });
    if (values.class) parts.push(`CLASE ${values.class}`);
    if (values.bore) parts.push(`BORE ${values.bore}`);
    if (values.brand) parts.push(values.brand);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  private normalizeHeader(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[()./_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  private isNumeric(value: string): boolean {
    return /^\d+(?:[.,]\d+)?$/.test(value.replace(/,/g, ""));
  }

  private toLines(text: string): string[] {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private extractAllQuantityLines(lines: string[]): string[] {
    return lines.filter((line) => this.isQuantityLine(line));
  }

  private extractDescriptionCandidates(lines: string[]): string[] {
    const quantityIndexSet = new Set<number>();
    lines.forEach((line, index) => {
      if (this.isQuantityLine(line)) {
        quantityIndexSet.add(index);
      }
    });

    const markerIndex = lines.findIndex((line) => /lista de materiales requeridos/i.test(line));
    const sourceLines = markerIndex >= 0 ? lines.slice(markerIndex + 1) : lines;

    const candidateLines = sourceLines.filter((line, sourceIndex) => {
      const globalIndex = markerIndex >= 0 ? sourceIndex + markerIndex + 1 : sourceIndex;

      if (quantityIndexSet.has(globalIndex)) {
        return false;
      }

      if (this.isNoiseLine(line)) {
        return false;
      }

      return true;
    });

    const grouped = this.groupDescriptions(candidateLines).filter((line) =>
      this.looksLikeProductDescription(line),
    );
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const line of grouped) {
      const key = line.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      unique.push(line);
    }

    return unique;
  }

  private isQuantityLine(line: string): boolean {
    const tokens = line.split(/\s+/);
    if (tokens.length < 3) {
      return false;
    }

    const quantityToken = tokens[tokens.length - 1]?.replace(/,/g, "") ?? "";
    if (!/^\d+(?:[.,]\d+)?$/.test(quantityToken)) {
      return false;
    }

    const unitTokenRaw = tokens[tokens.length - 2] ?? "";
    const unitToken = unitTokenRaw.toLowerCase().replace(/[.,]/g, "");
    return this.unitTokens.has(unitToken);
  }

  private isNoiseLine(line: string): boolean {
    return this.noisePatterns.some((pattern) => pattern.test(line));
  }

  private groupDescriptions(lines: string[]): string[] {
    const grouped: string[] = [];
    let current = "";

    for (const line of lines) {
      if (!current) {
        current = line;
        continue;
      }

      if (this.shouldAppendToCurrent(current, line)) {
        current = `${current} ${line}`.replace(/\s+/g, " ").trim();
        continue;
      }

      grouped.push(current);
      current = line;
    }

    if (current) {
      grouped.push(current);
    }

    return grouped;
  }

  private looksLikeProductDescription(line: string): boolean {
    if (line.length < 10) {
      return false;
    }

    if (/^\d+([.,]\d+)?$/.test(line)) {
      return false;
    }

    if (!/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(line)) {
      return false;
    }

    const normalized = line.toLowerCase();
    if (this.domainHintTokens.some((token) => normalized.includes(token))) {
      return true;
    }

    const words = line.split(/\s+/);
    return words.length >= 4;
  }

  private shouldAppendToCurrent(current: string, next: string): boolean {
    if (/,\s*$/.test(current)) {
      return true;
    }

    if (this.hasUnclosedParenthesis(current)) {
      return true;
    }

    if (/^(mca\.|ul,|cedula|certificado|cuerda|manguera|grease|\(|\d)/i.test(next)) {
      return true;
    }

    return false;
  }

  private hasUnclosedParenthesis(text: string): boolean {
    const openCount = (text.match(/\(/g) ?? []).length;
    const closeCount = (text.match(/\)/g) ?? []).length;
    return openCount > closeCount;
  }

  private buildStructuredBlock(quantityLines: string[], descriptions: string[]): string[] {
    if (quantityLines.length === 0 || descriptions.length === 0) {
      return [];
    }

    const lines: string[] = [];
    lines.push("CANDIDATE_QTY_UNIT_LINES");
    quantityLines.slice(0, 200).forEach((line, index) => {
      lines.push(`Q${index + 1}: ${line}`);
    });

    lines.push("CANDIDATE_DESCRIPTION_LINES");
    descriptions.slice(0, 200).forEach((line, index) => {
      lines.push(`D${index + 1}: ${line}`);
    });

    return lines;
  }
}

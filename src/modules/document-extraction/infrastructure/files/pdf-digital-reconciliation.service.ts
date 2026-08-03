export class PdfDigitalReconciliationService {
  private readonly unitTokens: Set<string>;
  private readonly noisePatterns: RegExp[];
  private readonly domainHintTokens: string[];

  constructor() {
    this.unitTokens = new Set<string>([
      "pzas",
      "pza",
      "pz",
      "mpz",
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

  public reconcilePage(pageText: string): string {
    const lines = this.toLines(pageText);
    const quantityLines = this.extractAllQuantityLines(lines);
    const descriptionLines = this.extractDescriptionCandidates(lines);
    const structuredLines = this.buildStructuredBlock(quantityLines, descriptionLines);

    if (structuredLines.length === 0) {
      return lines.join("\n");
    }

    return `${lines.join("\n")}\n\nEXTRACTION_HINTS\n${structuredLines.join("\n")}`.trim();
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

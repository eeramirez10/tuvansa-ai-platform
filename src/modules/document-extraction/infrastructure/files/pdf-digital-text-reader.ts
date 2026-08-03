import path from "node:path";
import {
  PdfDigitalReconciliationService,
  PdfPositionedLineToken,
} from "./pdf-digital-reconciliation.service";

export interface PdfDigitalTextReadResult {
  textContent: string;
  extractionHints: string | null;
}

interface PositionedToken {
  text: string;
  x: number;
  y: number;
}

interface PdfTextItemLike {
  str?: unknown;
  transform?: unknown;
}

export class PdfDigitalTextReader {
  private readonly lineTolerance = 2;

  constructor(private readonly reconciler: PdfDigitalReconciliationService) {}

  public async read(buffer: Buffer): Promise<PdfDigitalTextReadResult> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const standardFontsPath = `${path.join(
      path.dirname(require.resolve("pdfjs-dist/package.json")),
      "standard_fonts",
    )}${path.sep}`;
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      disableFontFace: true,
      standardFontDataUrl: standardFontsPath,
    });

    try {
      const pdf = await loadingTask.promise;
      const pageTexts: string[] = [];
      const pageHints: string[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const positionedLines = this.buildPositionedLines(textContent.items as PdfTextItemLike[]);
        const pageText = this.buildPageText(positionedLines);
        if (pageText) pageTexts.push(pageText);

        const hint = this.extractHints(
          this.reconciler.reconcilePage(pageText, positionedLines),
          pageNumber,
        );
        if (hint) pageHints.push(hint);
      }

      return {
        textContent: pageTexts.join("\n\n").trim(),
        extractionHints: pageHints.length > 0 ? pageHints.join("\n\n") : null,
      };
    } finally {
      await loadingTask.destroy();
    }
  }

  private buildPositionedLines(items: PdfTextItemLike[]): PositionedToken[][] {
    const tokens = items
      .map((item) => this.toToken(item))
      .filter((token): token is PositionedToken => token !== null)
      .sort((a, b) => {
        const sameLine = Math.abs(a.y - b.y) <= this.lineTolerance;
        return sameLine ? a.x - b.x : b.y - a.y;
      });
    if (tokens.length === 0) return [];

    const lines: PositionedToken[][] = [];
    let currentLineTokens: PositionedToken[] = [];
    let currentLineY = tokens[0]!.y;

    for (const token of tokens) {
      if (Math.abs(token.y - currentLineY) > this.lineTolerance) {
        lines.push(currentLineTokens);
        currentLineTokens = [token];
        currentLineY = token.y;
      } else {
        currentLineTokens.push(token);
      }
    }
    if (currentLineTokens.length > 0) lines.push(currentLineTokens);
    return lines;
  }

  private buildPageText(lines: PdfPositionedLineToken[][]): string {
    return lines
      .map((line) => this.joinLineTokens(line))
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
  }

  private toToken(item: PdfTextItemLike): PositionedToken | null {
    const text = typeof item?.str === "string" ? item.str.trim() : "";
    if (!text || !Array.isArray(item.transform) || item.transform.length < 6) return null;
    const x = Number(item.transform[4]);
    const y = Number(item.transform[5]);
    return Number.isFinite(x) && Number.isFinite(y) ? { text, x, y } : null;
  }

  private joinLineTokens(tokens: PdfPositionedLineToken[]): string {
    const ordered = [...tokens].sort((a, b) => a.x - b.x);
    const parts: string[] = [];
    for (const token of ordered) {
      if (parts.length === 0) {
        parts.push(token.text);
        continue;
      }
      const previous = parts[parts.length - 1]!;
      const needsSpace = !/[(/-]$/.test(previous) && !/^[,.;:)]/.test(token.text);
      parts.push(needsSpace ? ` ${token.text}` : token.text);
    }
    return parts.join("");
  }

  private extractHints(reconciledPageText: string, pageNumber: number): string | null {
    const marker = "\n\nEXTRACTION_HINTS\n";
    const markerIndex = reconciledPageText.indexOf(marker);
    if (markerIndex < 0) return null;
    const hints = reconciledPageText.slice(markerIndex + marker.length).trim();
    return hints ? `PAGE_${pageNumber}\n${hints}` : null;
  }
}

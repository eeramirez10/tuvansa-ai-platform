import * as XLSX from "xlsx";

export class XlsxTextReader {
  public read(buffer: Buffer): string {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const lines: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
      });

      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        const line = row
          .map((cell) => String(cell ?? "").trim())
          .filter(Boolean)
          .join(" | ");
        if (line) lines.push(line);
      }
    }

    return lines.join("\n");
  }
}

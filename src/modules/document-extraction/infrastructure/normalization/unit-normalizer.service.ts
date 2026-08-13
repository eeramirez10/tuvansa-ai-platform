import { CanonicalUnit } from "../../domain/quote-item.entity";

export class UnitNormalizerService {
  private readonly unitMap = new Map<string, CanonicalUnit>([
    ["pz", "PZ"], ["pza", "PZ"], ["pzas", "PZ"], ["pieza", "PZ"], ["piezas", "PZ"],
    ["pc", "PZ"], ["pcs", "PZ"], ["piece", "PZ"], ["pieces", "PZ"],
    ["k", "K"], ["kg", "K"], ["kgs", "K"], ["kilo", "K"], ["kilos", "K"],
    ["kilogramo", "K"], ["kilogramos", "K"], ["kilogram", "K"], ["kilograms", "K"],
    ["m", "M"], ["mt", "M"], ["mts", "M"], ["mtr", "M"], ["mtrs", "M"],
    ["metro", "M"], ["metros", "M"],
    ["ml", "ML"], ["m l", "ML"], ["mtl", "ML"], ["mtls", "ML"],
    ["metro lineal", "ML"], ["metros lineales", "ML"],
    ["l", "L"], ["lt", "L"], ["lts", "L"], ["ltr", "L"], ["litro", "L"], ["litros", "L"],
    ["tr", "TR"], ["tmo", "TR"], ["tmos", "TR"], ["tramo", "TR"], ["tramos", "TR"],
    ["se", "SE"], ["serv", "SE"], ["servicio", "SE"], ["servicios", "SE"], ["service", "SE"],
    ["act", "ACT"], ["actividad", "ACT"], ["actividades", "ACT"], ["activity", "ACT"],
    ["ft", "FT"], ["fts", "FT"], ["pie", "FT"], ["pies", "FT"], ["foot", "FT"], ["feet", "FT"],
    ["xro", "XRO"], ["rll", "XRO"], ["rlls", "XRO"], ["rollo", "XRO"], ["rollos", "XRO"], ["roll", "XRO"],
    ["uno", "UNO"], ["un", "UNO"], ["und", "UNO"], ["unid", "UNO"], ["unidad", "UNO"],
    ["unidades", "UNO"], ["ea", "UNO"], ["each", "UNO"],
    ["m2", "M2"], ["mt2", "M2"], ["mts2", "M2"], ["metro cuadrado", "M2"],
    ["metros cuadrados", "M2"], ["sqm", "M2"],
    ["lot", "LOT"], ["lote", "LOT"], ["lotes", "LOT"],
    ["con", "CON"], ["conj", "CON"], ["conjunto", "CON"], ["conjuntos", "CON"],
    ["jgo", "CON"], ["juego", "CON"], ["juegos", "CON"], ["set", "CON"], ["sets", "CON"],
  ]);

  public normalize(input: unknown): CanonicalUnit | null {
    if (typeof input !== "string") return null;
    const cleaned = this.clean(input);
    if (!cleaned) return null;
    return this.unitMap.get(cleaned) ?? this.unitMap.get(cleaned.replace(/\s+/g, "")) ?? null;
  }

  public detectFromDescription(description: string): CanonicalUnit | null {
    const cleaned = this.clean(description);
    const explicitWords = [
      "pieza", "piezas", "pza", "pzas", "kilo", "kilos", "kilogramo", "kilogramos",
      "metro lineal", "metros lineales", "metro", "metros", "litro", "litros", "tramo", "tramos", "tmo", "tmos",
      "servicio", "servicios", "actividad", "actividades", "pie", "pies", "rollo", "rollos",
      "unidad", "unidades", "metro cuadrado", "metros cuadrados", "lote", "lotes",
      "conjunto", "conjuntos", "juego", "juegos",
    ];
    for (const alias of explicitWords.sort((left, right) => right.length - left.length)) {
      if (new RegExp(`(?:^|\\s)${alias.replace(/\s+/g, "\\s+")}(?:$|\\s)`).test(cleaned)) {
        return this.normalize(alias);
      }
    }

    const quantityAndUnit = cleaned.match(
      /(?:^|\s)\d+(?:[.,]\d+)?\s*(pz(?:as?)?|pcs?|kg?s?|k|ml|m(?:ts?|trs?)?|l(?:ts?|tr)?|tr|ft?s?|xro|uno|m2|lot|con|se|act)(?:$|\s)/,
    );
    if (quantityAndUnit?.[1]) {
      return this.normalize(quantityAndUnit[1]);
    }
    return null;
  }

  private clean(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[²]/g, "2")
      .replace(/\^2/g, "2")
      .toLowerCase()
      .trim()
      .replace(/[.,;:()"'`]/g, "")
      .replace(/[\/_-]+/g, " ")
      .replace(/\s+/g, " ");
  }
}

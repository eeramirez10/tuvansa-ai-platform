export interface RadioAngulo {
  angulo: string | null; // Ejemplo: "45", "90", etc.
  radio: "LARGO" | "CORTO" | null;
}

export function extractAnguloRadio(descripcion: string): RadioAngulo {

  if (!descripcion) return { angulo: null, radio: null }
  // Extrae el ángulo: número seguido de o, O, ° o grados (también soporta "GRADOS" o "grados")
  const anguloMatch = descripcion.match(/(\d+(?:\.\d+)?)\s*(?:[oO°]|GRADOS?)/i);

  // Extrae radio largo/corto: RL, RC, RADIO LARGO, RADIO CORTO
  const radioMatch = descripcion.match(/\b(RL|RC|RADIO\s*LARGO|RADIO\s*CORTO)\b/i);

  let angulo: string | null = null;
  if (anguloMatch) {
    angulo = anguloMatch[1];
  }

  let radio: "LARGO" | "CORTO" | null = null;
  if (radioMatch) {
    const match = radioMatch[1].toUpperCase().replace(/\s+/g, '');
    if (match === "RL" || match === "RADIOLARGO") {
      radio = "LARGO";
    } else if (match === "RC" || match === "RADIOCORTO") {
      radio = "CORTO";
    }
  }

  return { angulo, radio };
}

export function normalizarDescripcionSWPorCedula(
  descripcion: string,
  cedula: string | null | undefined
): string | null {

  if (!descripcion) return null

  // Regex para variantes de SW (SW, S.W., S W, etc.)
  const swRegex = /\bS[\s\.]?W[\s\.]?\b/gi;

  const descMayus = descripcion.toUpperCase().trim();
  const cedulaMayus = (cedula || '').toUpperCase().trim();

  // Si la cédula es STD o STANDARD, SW en la descripción es cédula STD
  if (cedulaMayus === 'STD' || cedulaMayus === 'STANDARD') {
    return descMayus.replace(swRegex, 'STD');
  }
  // Si no, cualquier SW es SOCKET WELD
  return descMayus.replace(swRegex, ' SOCKET WELD ');
}



export function extraerCedulaDeDescripcion(descripcion: string): string | null {
  if (!descripcion) return null
  const desc = descripcion.toUpperCase();

  // Busca coincidencias: CED, CED., CEDULA, SCH seguidas de valor (numérico o STD)
  const regex = /\b(CED\.?|CEDULA|SCH)\s*\.?\s*(STD|\d+)\b/;
  const match = desc.match(regex);

  if (match) {
    return match[2]; // El valor de la cédula ("40", "STD", etc.)
  }

  // Si no encuentra, busca solo "STD" (estándar)
  const stdRegex = /\bSTD\b/;
  if (desc.match(stdRegex)) {
    return "STD";
  }

  return null;
}

export function extraerFiguraDeDescripcion(descripcion: string): string | null {

  if (!descripcion) return null

  const desc = descripcion.toUpperCase();

  // Busca FIGURA, FIG., FIG, F., F seguidos (con o sin espacios/puntos/guiones) de la figura (debe iniciar con número)
  const patron = /\b(?:FIGURA|FIG\.?|F\.?)[\s\-.]*([0-9][A-Z0-9\-]*)/;

  const match = desc.match(patron);
  if (match) {
    return match[1].replace(/\./g, '').replace(/\s+/g, '').trim();
  }

  return null;
}

export function normalizarGrados(descripcion: string): string {
  if (descripcion.includes('°')) {
    // Si contiene el símbolo de grados, lo reemplaza por "O"
    return descripcion.replace(/°/g, 'O');
  }
  // Si no contiene el símbolo, regresa igual
  return descripcion;
}

export function normalizeValue(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  // Quita acentos, convierte a mayúsculas y limpia espacios extras
  return value
    .normalize("NFD")                      // Quita diacríticos
    .replace(/[\u0300-\u036f]/g, "")       // Quita tildes
    .replace(/\s+/g, " ")                  // Un solo espacio
    .trim()
    .toUpperCase();
}

export function cleanDiameter(diametro: string): string {
  // Quita comillas dobles, simples y espacios alrededor
  return diametro.replace(/["']/g, '').trim();
}

export function extraerPresion(descripcion: string): string | null {
  if (!descripcion) return null
  const desc = descripcion.toUpperCase();

  // Busca presiones tipo "150 LBS", "150 PSI", "150LB", "LBS 150", etc.
  const regex = /\b(\d{2,5}(?:\.\d{1,2})?)\s*(LBS?|LB|LIBRAS?|PSI|POUNDS?|PRESSURE)\b|\b(LBS?|LB|LIBRAS?|PSI|POUNDS?|PRESSURE)[\s\-:]*(\d{2,5}(?:\.\d{1,2})?)\b/;
  const match = desc.match(regex);

  // El número estará en el grupo 1 o grupo 4
  if (match) {
    return match[1] || match[4] || null;
  }
  return null;
}


export function quitarPalabraBrida(texto: string): string {
  // Normalizamos acentos para evitar problemas con 'BRÍDA'
  const textoNormalizado = texto.normalize('NFD').replace(/[\u0301\u0308]/g, '');
  // Reemplazamos cualquier aparición de "BRIDA" o "BRIDAS" (sing/plur) como palabra completa
  const textoSinBrida = textoNormalizado.replace(/\bbridas?\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  return textoSinBrida;
}

export function extraerGradoMaterialBrida(descripcion: string): string | null {
  if (!descripcion) return null
  // Busca T-304, T-304L, T304, T316, T-316L, etc.
  const patron = /\bT[-\s]?(\d{3}[A-Z]*)\b/gi;
  const desc = descripcion.toUpperCase();
  const match = patron.exec(desc);

  if (match) {
    // Devuelve en formato estándar, por ejemplo: T-304L
    // Si venía como T304L, lo formatea a T-304L
    const grado = match[1];
    const gradoFormateado = `T-${grado}`;
    return gradoFormateado;
  }
  return null;
}


export const verifyData = (value: string): string | null => {

  if (value === 'NO ASIGNADO' || !value) return null

  return value

}


export function buscarCostura(texto: string): "CON COSTURA" | "SIN COSTURA" | null {

  if(!texto ) return null
  const normalizado = texto.toUpperCase();

  if (/SIN\s+COSTURA/.test(normalizado)) {
    return "SIN COSTURA";
  }
  if (/CON\s+COSTURA/.test(normalizado)) {
    return "CON COSTURA";
  }

  return null;
}


type MaterialPrincipal =
  | "CPVC"
  | "PVC"
  | "PEX"
  | "PE-RT"
  | "HDPE"
  | "LDPE"
  | "PE"
  | "PP"
  | "PB-1"
  | "ABS"
  | "Multicapa";

export function detectarMaterialPlastico(texto: string): MaterialPrincipal | null {

  if (!texto) return null
  // Normaliza a mayúsculas y quita acentos básicos
  const normalizado = quitarAcentos(texto).toUpperCase();

  // Orden IMPORTANTE: primero lo más específico, luego lo genérico
  const reglas: Array<{ principal: MaterialPrincipal; rx: RegExp }> = [
    // --- PVC y CPVC ---
    { principal: "CPVC", rx: /\bC[-\s\.]*PVC\b|\bPVC[-\s\.]*C\b|\bCP[-\s\.]*VC\b/ },
    { principal: "PVC", rx: /\bPVC\b|\bPOLI\s*CLORURO\s*DE\s*VINILO\b/ },

    // --- PEX / PE-RT / Multicapa ---
    { principal: "PE-RT", rx: /\bPE[-\s\.]*RT\b|\bPOLIETILENO\s*DE\s*TEMPERATURA\s*ELEVADA\b/ },
    { principal: "PEX", rx: /\bPEX(?:[-\s]*[AB])?\b|\bPOLIETILENO\s*RETICULADO\b/ },
    { principal: "Multicapa", rx: /\bMULTICAPA\b|\bPEX[-\s]*AL[-\s]*PEX\b|\bPERT[-\s]*AL[-\s]*PERT\b|\bMLC\b|\bAL[-\s]*PEX\b/ },

    // --- Polietileno: HDPE / LDPE / genérico PE ---
    { principal: "HDPE", rx: /\bHDPE\b|\bPE[-\s]*AD\b|\bPEAD\b|\bPOLIETILENO\s*DE\s*ALTA\s*DENSIDAD\b/ },
    { principal: "LDPE", rx: /\bLDPE\b|\bPE[-\s]*BD\b|\bPEBD\b|\bPOLIETILENO\s*DE\s*BAJA\s*DENSIDAD\b/ },
    // PE genérico: sólo si no menciona ya variantes (HDPE/LDPE/PEX/PE-RT)
    { principal: "PE", rx: /\bPE\b|\bPOLIETILENO\b/ },

    // --- Polipropileno ---
    { principal: "PP", rx: /\bPP\b|\bPPR\b|\bPP[-\s]*R\b|\bPPH\b|\bPOLIPROPILENO\b/ },

    // --- Polibutileno ---
    { principal: "PB-1", rx: /\bPB[-\s]*1\b|\bPB1\b|\bPOLIBUTILENO\b/ },

    // --- ABS ---
    { principal: "ABS", rx: /\bABS\b|\bACRILONITRILO\s*BUTADIENO\s*ESTIRENO\b/ },
  ];

  // Para evitar que "PE" capte cosas si ya hay más específicas,
  // hacemos un primer pase SIN la regla de "PE" genérico
  for (const { principal, rx } of reglas.filter(r => r.principal !== "PE")) {
    if (rx.test(normalizado)) return principal;
  }

  // Segundo pase para "PE" genérico
  const reglaPE = reglas.find(r => r.principal === "PE")!;
  if (reglaPE.rx.test(normalizado)) {
    // Evita falsos positivos tipo "PERSONA", "PESO", etc. (palabra aislada o contexto claro)
    const peAislado =
      /\bPE\b/.test(normalizado) ||
      /\bPOLIETILENO\b/.test(normalizado);
    if (peAislado) return "PE";
  }

  return null;
}

function quitarAcentos(s: string): string {

  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/* ===== Ejemplos =====
detectarMaterial("CODO 45° de CPVC cementar 2\" CED.80")        // "CPVC"
detectarMaterial("Tubo PVC Sanitario 4\"")                       // "PVC"
detectarMaterial("Tubería PEX-AL-PEX 20mm")                      // "Multicapa"
detectarMaterial("Tubo PEX clase A")                             // "PEX"
detectarMaterial("Polietileno de alta densidad PEAD SDR11")      // "HDPE"
detectarMaterial("LDPE agrícola 1\"")                            // "LDPE"
detectarMaterial("PE-RT para ACS")                               // "PE-RT"
detectarMaterial("COPLE PPR 25mm")                               // "PP"
detectarMaterial("PB-1 calefacción")                             // "PB-1"
detectarMaterial("Cople ABS DWV")                                // "ABS"
detectarMaterial("Tubo de Polietileno 1\"")                      // "PE"
detectarMaterial("Tubo sanitario sin material declarado")        // null
*/


export function esPlasticoDesdeBD(materialDb: string): boolean {
  if (!materialDb) return false;

  const normalizado = quitarAcentos(materialDb)
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

  // Plásticos EXACTOS según tu BD
  const PLASTICOS_BD = new Set([
    "CPVC",
    "HDPE",
    "PPR",
    "PVC",
    "PLASTICO"
  ]);

  return PLASTICOS_BD.has(normalizado);
}






/**
 * Sanea una cadena para guardarla en BD:
 * - Normaliza (NFKD) y elimina diacríticos (á -> a, ñ -> n).
 * - Convierte comillas/guiones “tipográficos” a ASCII.
 * - Elimina caracteres de control y emojis.
 * - (Opcional) Restringe a ASCII y trunca por longitud.
 * - Aplica whitelist de caracteres seguros por defecto.
 */
export function sanitizeForDB(
  raw: unknown,
  opts?: {
    asciiOnly?: boolean;     // true = fuerza ASCII (quita todo lo no-ASCII). Default: true
    allowNewlines?: boolean; // permite \n y \r. Default: false
    maxLength?: number;      // recorta si excede
    whitelist?: RegExp;      // override de whitelist de caracteres permitidos
  }
): string {
  const {
    asciiOnly = true,
    allowNewlines = false,
    maxLength,
    whitelist
  } = opts || {};

  // 1) A texto
  let s = String(raw ?? "");

  // 2) Normaliza y elimina diacríticos (incluye Ñ -> N, ñ -> n)
  //    NFKD separa base + diacrítico; luego removemos \p{M} (marcas).
  s = s.normalize("NFKD").replace(/\p{M}+/gu, "");

  // 3) Homologa comillas/guiones “tipográficos” a ASCII
  const replacements: Record<string, string> = {
    "’": "'",
    "‘": "'",
    "‚": "'",
    "“": '"',
    "”": '"',
    "„": '"',
    "—": "-",
    "–": "-",
    "‐": "-",
    "·": ".",
    "…": "...",
  };
  s = s.replace(/['’‘‚"“”„—–‐·…]/g, ch => replacements[ch] ?? ch);

  // 4) Si no queremos saltos de línea, los convertimos a espacio
  if (!allowNewlines) {
    s = s.replace(/[\r\n]+/g, " ");
  }

  // 5) Elimina caracteres de control (excepto tab si lo quisieras; aquí también lo quitamos)
  //    Rango: 0x00–0x1F y 0x7F
  s = s.replace(/[\x00-\x1F\x7F]/g, " ");

  // 6) Opcional: forzar ASCII (quita emojis y cualquier no-ASCII)
  if (asciiOnly) {
    s = s.replace(/[^\x20-\x7E]/g, ""); // deja solo ASCII imprimible
  }

  // 7) Aplica whitelist (por defecto: letras/números/espacio y algunos signos comunes)
  //    Ajusta según tus necesidades (añade más símbolos si los usas).
  const defaultWhitelist = /[^A-Za-z0-9 .,_\-:;#()\/+*&%="'\[\]]+/g;
  s = s.replace(whitelist ?? defaultWhitelist, " ");

  // 8) Compacta espacios y recorta
  s = s.replace(/\s+/g, " ").trim();

  // 9) Trunca si se pidió
  if (typeof maxLength === "number" && maxLength > 0 && s.length > maxLength) {
    s = s.slice(0, maxLength);
  }

  return s;
}

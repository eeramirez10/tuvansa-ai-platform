export function detectProducto(texto: string | null | undefined): string | null {
  if (!texto) return null;

  // --- normalización global ---
  const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let T = strip(String(texto)).toUpperCase()
    .replace(/[°º"'´`′″¨×.]/g, " ")   // separa VALV.CHECK, MOD., etc.
    .replace(/[(),:;!?]/g, " ")
    .replace(/[\/_-]/g, " ")          // OUTLET-T, V_SEN, VIC-LET, SNAP-LET
    .replace(/\s+/g, " ")
    .trim();

  if (!T) return null;

  // Omite solo estos (más metatokens frecuentes que no son producto)
  const STOP = new Set(["DE","CON","X","COD","COD.","ART","ART.","COT","COT."]);

  // Normaliza token por token (abreviaturas/sinónimos)
  const normWord = (w: string) => {
    if (!w) return w;
    if (w === "VALV" || w === "VALV.") return "VALVULA";
    if (w === "VAL"  || w === "VAL.")  return "VALVULA";
    if (w === "RED"  || w === "RED.")  return "REDUCCION";
    if (w === "REST" || w === "REST.") return "RESTRICTOR";
    if (w === "TE") return "TEE";
    if (w === "YE") return "YEE";
    if (w === "TUBERIA") return "TUBO";
    if (w === "STUBEND" || w === "STUB-END") return "STUB"; // se arma como "STUB END"
    if (w === "PORTBR") return "PORTA";                     // "PORTA BRIDA"
    if (w === "APERSOR") return "ASPERSOR";
    if (w === "CONDULETS") return "CONDULET";
    if (w === "THREDOLET" || w === "THREADOLET") return "THREDOLET";
    if (w === "ACOPLE") return "COPLE";
    if (w === "MILTICONDUCTOR") return "MULTICONDUCTOR";    // typo frecuente
    if (w === "HRVALV") return "VALVULA";
    if (w === "SENAL") return "SEÑAL";                      // por si no quitas diacríticos
    if (w === "TUPOPLUS") return "TUBOPLUS";
    if (w === "MCA") return "MCA"; // maneja BATERIAS MCA (sin punto)
    return w;
  };

  const tokens = T.split(" ")
    .map(normWord)
    .filter(t => t && !STOP.has(t));

  if (tokens.length === 0) return null;

  // utilitario: ¿es producto?
  const isProd = (p: string) => PRODUCTS.has(p) || CANON[p] !== undefined;

  // --- 1) FRASES (bigrams) en cualquier parte ---
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i], b = tokens[i + 1];

    // Genéricas y previas
    if (a === "STUB"      && b === "END")        return "STUB-END";
    if (a === "PORTA"     && b === "BRIDA")      return "PORTABRIDA";
    if (a === "TUERCA"    && b === "UNION")      return "UNION";
    if (a === "Y"         && b === "TIPO")       return "YEE";
    if (a === "MJ"        && b === "TUBO")       return "TUBO";
    if (a === "SWAGE"     && b === "NIPLE")      return "NIPLE";
    if (a === "ABORT"     && b === "STATION")    return "ABORT STATION";
    if (a === "AGENT"     && b === "RELEASE")    return "AGENT RELEASE";
    if (a === "FLOW"      && b === "SWITCH")     return "SWITCH";
    if (a === "COVER"     && b === "PLATE")      return "CHAPETON";

    // *** NUEVAS REGLAS que pediste ***
    // AC [producto]  (AC REDUCCION / AC TE / AC VALVULA)
    if (a === "AC" && isProd(b))                 return CANON[b] ?? b;

    // ACC. GIRATORIO
    if (a === "ACCESORIO" && b === "GIRATORIO")  return "ACCESORIO";

    // BATERIAS MCA. / BATTERY SET
    if (a === "BATERIAS" && b === "MCA")         return "BATERIA";
    if (a === "BATTERY"  && b === "SET")         return "BATERIA";

    // HID. CAMPANA / HID. ESPIGA  -> HIDRANTE
    if ((a === "HID" || a === "HIDRANTE") && (b === "CAMPANA" || b === "ESPIGA")) return "HIDRANTE";

    // MOD. MONITOREO -> MODULO
    if ((a === "MOD" || a === "MODULO" || a === "MOD.") && b === "MONITOREO") return "MODULO";

    // OUTLET-T RAN  (tras normalizar: OUTLET T RAN)
    if (a === "OUTLET" && (b === "T" || b === "RAN")) return "OUTLET";

    // RAIN R
    if (a === "RAIN" && b === "R")               return "RAIN";

    // RED.xxx  -> REDUCCION
    if (a === "REDUCCION")                       return "REDUCCION";
    if (a === "RED" || a.startsWith("RED"))      return "REDUCCION";

    // REGULAR CLEAR (pegamentos)
    if (a === "REGULAR" && b === "CLEAR")        return "PEGAMENTO";

    // SALIDA VIC-LET  / SNAP-LET SALIDA
    if (a === "SNAP" && b === "LET")             return "SALIDA";
    if (a === "VIC"  && b === "LET")             return "SALIDA";

    // SEÑAL MODELO
    if ((a === "SEÑAL" || a === "SENAL") && b === "MODELO") return "SEÑAL";
  }

  // --- 2) UNIGRAMAS (izq→der; primera coincidencia gana) ---
  for (const tk of tokens) {
    // Variantes útiles
    if (tk.includes("VALV"))                     return "VALVULA";  // HRVALV, VALV, etc.
    if (tk.startsWith("RED"))                    return "REDUCCION";
    if (tk === "HYDRANT")                        return "HIDRANTE"; // TWO-WAY HYDRANT
    if (tk === "OUTLET")                         return "OUTLET";
    if (tk === "RAIN")                           return "RAIN";
    if (tk === "VARILLA" || tk === "VARILLAS")   return "VARILLA";
    if (tk === "WAGE")                           return "SWAGE";     // SWAGE cortado
    if (tk === "TUBOPLUS")                       return "TUBO";
    if (tk === "SNAPLET" || tk === "VICLET")     return "SALIDA";    // por si llega junto

    if (PRODUCTS.has(tk))                        return CANON[tk] ?? tk;
  }

  // --- 3) Fallback regex MUY simple ---
  if (/\bROCIADOR\b/.test(T)) return "ROCIADOR";
  if (/\bCODO\b/.test(T))     return "CODO";
  if (/\bTUBO\b|\bTUBERIA\b/.test(T)) return "TUBO";
  if (/\bSALIDA\b/.test(T))   return "SALIDA";

  return null;
}

// Sinónimos → forma canónica
const CANON: Record<string,string> = {
  "ACOPLE":"COPLE",
  "CONDULETS":"CONDULET",
  "THREDOLET":"THREDOLET",
  "THREADOLET":"THREDOLET",
  "BATTERY":"BATERIA",
};

// Catálogo de productos (unigramas REALES — sin metatokens)
const PRODUCTS = new Set<string>([
  // Core
  "CODO","VALVULA","TEE","YEE","TUBO","BRIDA","COPLE","UNION","ADAPTADOR","CONECTOR",
  "ABRAZADERA","CURVA","CIEGA","COLA","CRUZ","NIPLE","MANGUERA","MANGUITO","RESTRICTOR","REDUCCION",
  "TAPON","TAPA","ROCIADOR","LATROLET","GLANDULA","LLAVE","PEGAMENTO","CEMENTO","PRIMER",
  "LIMPIADOR","BROCHA","CAJA","REGISTRO","SALIDA","EMPAQUE","FLOTADOR","SILICON","TIJERAS",
  "KIT","JUEGO","MAQUINA","MATRICES","MONTURA","CONTRABRIDA","COLADERA","PORTABRIDA",
  "STUB-END","ASPERSOR","ACOPLAMIENTO","ACCESORIO","ACTUADOR","ANCLAJE","ANGULO","ANILLO",
  "ARANDELA","ARCO","AUMENTADOR","BALERO","BANDEJA","BARANDAL","BARRA","BASCULA","BASE",
  "BATERIA","BOMBA","BOQUILLA","BOTA","BOTE","BOTELLA","BOTIQUIN","SOPORTE","JUNTA",
  "MANOMETRO","GABINETE","TUERCA","HIDRANTE","TAQUETE","DETECTOR","TORNILLO","ESPARRAGO",
  "SELLADOR","CARRETE","CINTA","EQUIPO","FILTRO","TANQUE","TERMOMETRO","CINCHO","COLGADOR",
  "CONTACTO","GLAND","GUANTE","INSERTO","MOTOBOMBA","MOTOR","EXTINTOR","CHAPETON","BROCAL",
  "CABEZAL","CABLE","CALCA","CAMARA","CAMPANA","CANAL","CANDADO","CARRETILLA","CEDAZO",
  "CERTIFICADO","CHALUPA","CHAPADO","CHAVETA","CHIFLON","CISTERNA","CLAVIJA","CLAVO","CLIP",
  "COLECTOR","COLGANTE","COMPRESOR","CONDULET","CONJUNTO","CONVERSION","CORTE","CUADRO",
  "CUBETA","CUELLO","CUERDA","CUÑA","DADO","DIAFRAGMA","DIFUSOR","DISCO","ECO","ELBOLET",
  "ELECTRODO","EMISOR","ENSAMBLE","ENTRADA","ESCALON","ESPATULA","ESTACION","ESTROBO",
  "ETIQUETA","FERULA","FIBRA","FORJA","FUENTE","GARRA","GRANADA","GRAPA","GRASA","GUARDA",
  "HIERRO","HILO","HOJA","IMPERMEABLE","IMPULSOR","INTERRUPTOR","JUNTAS","KIT","KOIL",
  "LAMINA","LAMPARA","LATA","LATERAL","LIJA","LIMA","LINER","LIQUIDO","LOCAL","LOTE",
  "LUBRICANTE","MACHETE","MALETA","MANIFOLD","VACUOMETRO","MANOVACUOMETRO","MEDIDOR","MESA",
  "MEZCLADOR","MODULO","MONITOR","MORDAZA","MUESTRA","NIPOLET","NOZZLE","OPERADOR","OPTICAL",
  "OUTLET","PALA","PALETA","PANEL","PARED","PERFIL","PERNO","PIJA","PIPE","PISTOLA","PLACA",
  "PLATO","PLAYERA","SISTEMA","POLVO","POSTE","PPRC","PQS","PRESOSTATO","RACK","RANURADORA",
  "RASTRILLO","REGULADOR","REPUESTO","RESISTENCIA","RETENCION","RODILLO","ROLDANA","ROLLO",
  "ROTOR","RUEDA","SEGUETA","SEGURO","SELLO","SEÑAL","SEPARADOR","SET","SIFON","SILLETA",
  "SIRENA","SNAPLET","VICLET","SOCKOLET","SOLDADURA","SOLENOID","SOLERA","SOLVENTE","SOMBRERO",
  "SUAJE","SWAGE","SWITCH","TABLERO","TAPPING","TARJETA","TELA","TERMINAL","TERMO","TERMOPOZO",
  "TERMOSTATO","TERRAJA","THINNER","THREDOLET","TINACO","TOBERA","TOMA","TRAMO","TRAMPA","TRIM",
  "TTEE","TUBING","UNICANAL","UNIVERSAL","VIDRIO","VIGA","VOLANTE","WELDOLET","RAIN","OUTLET"
]);

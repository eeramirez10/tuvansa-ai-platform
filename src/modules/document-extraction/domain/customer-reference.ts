const referenceFields = [
  /(?:referencia\s+(?:del\s+cliente|cliente)|(?:su|mi|nuestra)\s+referencia|customer\s+(?:reference|ref\.?))\s*(?::|=|\||\bes\b|\r?\n)\s*([^\r\n|;]+)/giu,
  /\b(?:rfq|solicitud|requisici[oó]n)(?:\s+(?:n[úu]m(?:ero)?\.?|no\.?|n[°º]))?\s*(?::|=|#|\||\r?\n)\s*([^\r\n|;]+)|\brfq[ \t]+([A-Z0-9/-]*\d[A-Z0-9/-]*)\b/giu,
  /\b(?:proyecto|project)\s*(?::|=|\||\r?\n)\s*([^\r\n|;]+)/giu,
];

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

export function groundedCustomerReference(value: unknown, source: string): string | null {
  if (typeof value !== "string") return null;
  const candidate = clean(value);
  if (!candidate || candidate.length > 120 || /[\u0000-\u001f\u007f]/.test(candidate)) return null;
  const document = source.split(/\r?\nEXTRACTION_HINTS\r?\n/, 1)[0];
  // Prefer an explicit customer reference over request numbers or project names.
  for (const field of referenceFields) {
    const values = new Map([...document.matchAll(field)].map(match => {
      const original = clean((match[1] ?? match[2]).split(/[.!?]\s+/u, 1)[0]);
      return [original.toUpperCase(), original] as const;
    }));
    if (!values.size) continue;
    if (values.size !== 1) return null;
    const [original] = values.values();
    if (/^[-–—]+$|^(?:n\/?a|sin referencia|no aplica)$/i.test(original)) return null;
    if (original.toUpperCase() === candidate.toUpperCase()) return original;
    if (original.replace(/[.!]+$/, "").toUpperCase() === candidate.toUpperCase()) return original.slice(0, candidate.length);
    return null;
  }
  return null;
}

// Normalización y similitud de texto. Funciones puras.

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

const SUFIJOS_SOCIETARIOS = /\b(s\.?\s?a\.?\s?s\.?|s\.?\s?a\.?\s?c\.?|s\.?\s?a\.?|s\.? de r\.?\s?l\.?|ltda\.?)\s*$/

/** "Industrias Delta S.A.S." → "industrias-delta" (convención de carpetas del maestro). */
export function slug(texto: string): string {
  return normalizar(texto)
    .replace(SUFIJOS_SOCIETARIOS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "y", "para", "en", "con", "por", "a", "un", "una"])

function tokens(texto: string): Set<string> {
  return new Set(
    normalizar(texto)
      .replace(/[^a-z0-9 ]/g, " ")
      .split(" ")
      .filter((t) => t.length > 1 && !VACIAS.has(t)),
  )
}

/** Coeficiente de Dice sobre tokens significativos, en [0, 1]. */
export function similitud(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let comunes = 0
  for (const t of ta) if (tb.has(t)) comunes++
  return (2 * comunes) / (ta.size + tb.size)
}

/** Divide un documento en párrafos (separados por línea en blanco). */
export function parrafos(texto: string): string[] {
  return texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function recortar(texto: string, max: number): string {
  if (texto.length <= max) return texto
  const corte = texto.slice(0, max - 1)
  return corte.slice(0, corte.lastIndexOf(" ")).replace(/[,;:.]$/, "") + "…"
}

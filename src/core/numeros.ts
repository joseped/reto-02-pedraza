// R-05 · Montos con separadores latinos o anglosajones.

/**
 * El último separador con 1–2 dígitos a su derecha es decimal; los demás son de miles.
 * "265.000.000" → 265000000 · "120,000.00" → 120000 · "1.500,5" → 1500.5
 */
export function parseMonto(crudo: string): number | null {
  const limpio = crudo.replace(/[^\d.,]/g, "")
  if (!/\d/.test(limpio)) return null

  const ultimo = Math.max(limpio.lastIndexOf("."), limpio.lastIndexOf(","))
  const decimales = ultimo >= 0 ? limpio.slice(ultimo + 1) : ""
  const esDecimal = ultimo >= 0 && decimales.length >= 1 && decimales.length <= 2

  const entera = (esDecimal ? limpio.slice(0, ultimo) : limpio).replace(/[.,]/g, "")
  const numero = Number(esDecimal ? `${entera}.${decimales}` : entera)
  return Number.isFinite(numero) ? numero : null
}

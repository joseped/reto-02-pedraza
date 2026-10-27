// R-06 · Fechas escritas en español jurídico.

import { normalizar } from "./texto.ts"

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

const pad = (n: number) => String(n).padStart(2, "0")

export function isoDe(anio: number, mes: number, dia: number): string | null {
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  const valida = d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
  return valida ? `${anio}-${pad(mes)}-${pad(dia)}` : null
}

export function esIsoValida(fecha: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  return m !== null && isoDe(Number(m[1]), Number(m[2]), Number(m[3])) !== null
}

/** Todas las fechas completas del texto: "primero (1) de agosto de 2026", "15 de mayo de 2026". */
export function fechasEnTexto(texto: string): string[] {
  const t = normalizar(texto)
  const patron = /(?:\((\d{1,2})\)|\b(\d{1,2}))\s+de\s+([a-z]+)\s+de\s+(\d{4})/g
  const fechas: string[] = []
  for (const m of t.matchAll(patron)) {
    const mes = MESES[m[3] ?? ""]
    const dia = Number(m[1] ?? m[2])
    if (!mes) continue
    const iso = isoDe(Number(m[4]), mes, dia)
    if (iso) fechas.push(iso)
  }
  return fechas
}

/** Fecha de firma: completa ("a los treinta (30) días del mes de julio de 2026") o solo mes ("en el mes de agosto de 2026"). */
export function fechaFirma(texto: string): { fecha: string; soloMes: boolean } | null {
  const t = normalizar(texto)
  const completa = /a los [a-z ]*\((\d{1,2})\) dias del mes de ([a-z]+) de (\d{4})/.exec(t)
  if (completa) {
    const iso = isoDe(Number(completa[3]), MESES[completa[2] ?? ""] ?? 0, Number(completa[1]))
    if (iso) return { fecha: iso, soloMes: false }
  }
  const mes = /en el mes de ([a-z]+) de (\d{4})/.exec(t)
  if (mes) {
    const iso = isoDe(Number(mes[2]), MESES[mes[1] ?? ""] ?? 0, 1)
    if (iso) return { fecha: iso, soloMes: true }
  }
  return null
}

/** Plazo en meses: "doce (12) meses" → 12. */
export function plazoMeses(texto: string): number | null {
  const m = /\((\d{1,3})\)\s*meses/.exec(normalizar(texto))
  return m ? Number(m[1]) : null
}

/** Fin de un plazo de n meses que empieza en `inicio`: inicio + n meses − 1 día. */
export function finDePlazo(inicio: string, meses: number): string {
  const [a, m, d] = inicio.split("-").map(Number) as [number, number, number]
  const fin = new Date(Date.UTC(a, m - 1 + meses, d - 1))
  return fin.toISOString().slice(0, 10)
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Fecha de referencia del sistema (R-17): FECHA_HOY permite ejecuciones deterministas. */
export function hoyReferencia(): string {
  const env = process.env.FECHA_HOY
  return env && esIsoValida(env) ? env : new Date().toISOString().slice(0, 10)
}

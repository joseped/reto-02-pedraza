// Maestro de contratos en CSV (PRD §7.2). La primera lectura copia el fixture a out/ (RN6).

import { existsSync, readFileSync } from "node:fs"
import { COLUMNAS, Fila } from "./schema.ts"
import { copiarArchivo, escribirAtomico, rutas, type Ctx } from "./store.ts"

function parsearLinea(linea: string): string[] {
  const celdas: string[] = []
  let actual = ""
  let comillas = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (comillas && c === '"' && linea[i + 1] === '"') { actual += '"'; i++ }
    else if (c === '"') comillas = !comillas
    else if (c === "," && !comillas) { celdas.push(actual); actual = "" }
    else actual += c
  }
  celdas.push(actual)
  return celdas
}

const celda = (v: string | number | boolean) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function aFila(encabezados: string[], celdas: string[]): Fila {
  const crudo = Object.fromEntries(encabezados.map((h, i) => [h, celdas[i] ?? ""]))
  return Fila.parse({ ...crudo, valor: Number(crudo.valor), requiere_poliza: crudo.requiere_poliza === "true" })
}

export function leerMaestro(ctx: Ctx): Fila[] {
  const r = rutas(ctx)
  if (!existsSync(r.maestro)) copiarArchivo(r.maestroFixture, r.maestro)
  const [cabecera, ...lineas] = readFileSync(r.maestro, "utf8").split(/\r?\n/).filter(Boolean)
  const encabezados = parsearLinea(cabecera ?? "")
  return lineas.map((l) => aFila(encabezados, parsearLinea(l)))
}

export function escribirMaestro(ctx: Ctx, filas: Fila[]): void {
  const lineas = filas.map((f) => COLUMNAS.map((c) => celda(f[c])).join(","))
  escribirAtomico(rutas(ctx).maestro, [COLUMNAS.join(","), ...lineas].join("\n") + "\n")
}

/** Inserta o reemplaza por id_contrato. Nunca deja dos filas con el mismo id (O2). */
export function guardarFila(ctx: Ctx, fila: Fila): void {
  const filas = leerMaestro(ctx)
  const i = filas.findIndex((f) => f.id_contrato === fila.id_contrato)
  if (i >= 0) filas[i] = fila
  else filas.push(fila)
  escribirMaestro(ctx, filas)
}

/** AUTO-<año>-<secuencia> para contratos sin número (PRD §7.2). */
export function siguienteAutoId(filas: Fila[], anio: string): string {
  const usados = filas.map((f) => /^AUTO-(\d{4})-(\d+)$/.exec(f.id_contrato)).filter((m) => m?.[1] === anio).map((m) => Number(m?.[2]))
  return `AUTO-${anio}-${String(Math.max(0, ...usados) + 1).padStart(3, "0")}`
}

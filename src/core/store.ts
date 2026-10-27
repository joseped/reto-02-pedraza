// Rutas y archivos de trabajo. fixtures/ es solo lectura (RN6); todo se escribe en out/.

import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { Comercial, Correo } from "./schema.ts"

export type Ctx = { directory: string; sessionId: string }

export const rutas = (ctx: Ctx) => {
  const fx = join(ctx.directory, "fixtures", "reto-02")
  const out = join(ctx.directory, "out")
  return {
    buzon: join(fx, "buzon"),
    maestroFixture: join(fx, "maestro-contratos.csv"),
    comerciales: join(fx, "comerciales.json"),
    out,
    sharepoint: join(out, "sharepoint"),
    maestro: join(out, "sharepoint", "maestro-contratos.csv"),
    historial: join(out, "sharepoint", "historial.jsonl"),
    procesados: join(out, "procesados.json"),
    log: join(out, "log.jsonl"),
    alertas: join(out, "alertas.md"),
  }
}

/** Escritura atómica: archivo temporal + rename (P4). */
export function escribirAtomico(ruta: string, contenido: string): void {
  mkdirSync(dirname(ruta), { recursive: true })
  const tmp = `${ruta}.tmp`
  writeFileSync(tmp, contenido, "utf8")
  renameSync(tmp, ruta)
}

export function agregarLinea(ruta: string, registro: object): void {
  mkdirSync(dirname(ruta), { recursive: true })
  appendFileSync(ruta, JSON.stringify(registro) + "\n", "utf8")
}

export function leerJsonl<T>(ruta: string): T[] {
  if (!existsSync(ruta)) return []
  return readFileSync(ruta, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T)
}

export function copiarArchivo(origen: string, destino: string): void {
  mkdirSync(dirname(destino), { recursive: true })
  copyFileSync(origen, destino)
}

export function limpiarOut(ctx: Ctx): void {
  rmSync(rutas(ctx).out, { recursive: true, force: true })
}

// ── Buzón ────────────────────────────────────────────────────────────────

/** El id viene de la carpeta; se valida para impedir rutas fuera del buzón. */
export function idSeguro(id: string): string | null {
  return /^[a-zA-Z0-9_-]+$/.test(id) ? id : null
}

export function listarMensajes(ctx: Ctx): string[] {
  const dir = rutas(ctx).buzon
  return existsSync(dir) ? readdirSync(dir).filter((d) => idSeguro(d)).sort() : []
}

export function leerCorreo(ctx: Ctx, id: string): Correo | null {
  const ruta = join(rutas(ctx).buzon, id, "correo.json")
  if (!idSeguro(id) || !existsSync(ruta)) return null
  const r = Correo.safeParse(JSON.parse(readFileSync(ruta, "utf8")))
  return r.success ? r.data : null
}

export const esAdjuntoContrato = (nombre: string) => /^(contrato|otros[ií])/i.test(nombre)

export function rutaAdjunto(ctx: Ctx, id: string, adjunto: string): string {
  return join(rutas(ctx).buzon, id, adjunto)
}

export function leerAdjunto(ctx: Ctx, id: string, adjunto: string): string | null {
  const ruta = rutaAdjunto(ctx, id, adjunto)
  return existsSync(ruta) ? readFileSync(ruta, "utf8") : null
}

export function leerComerciales(ctx: Ctx): Comercial[] {
  return Comercial.array().parse(JSON.parse(readFileSync(rutas(ctx).comerciales, "utf8")))
}

// ── Procesados ───────────────────────────────────────────────────────────

export type Procesado = { mensaje_id: string; clasificacion: string; id_contrato: string | null; ts: string }

export function leerProcesados(ctx: Ctx): Procesado[] {
  const ruta = rutas(ctx).procesados
  return existsSync(ruta) ? (JSON.parse(readFileSync(ruta, "utf8")) as Procesado[]) : []
}

export function marcarProcesado(ctx: Ctx, p: Procesado): void {
  const lista = leerProcesados(ctx).filter((x) => x.mensaje_id !== p.mensaje_id)
  escribirAtomico(rutas(ctx).procesados, JSON.stringify([...lista, p], null, 2))
}

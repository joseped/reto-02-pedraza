// Sesiones en memoria con respaldo en out/sessions/ (sobreviven a un reinicio del proceso).

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { Turno } from "../llm/adapter.ts"
import { escribirAtomico } from "../core/store.ts"

export type LlamadaVisible = { nombre: string; args: unknown; ok: boolean; resumen: string; resultado: unknown }

export type EntradaChat =
  | { rol: "usuario"; texto: string; ts: string }
  | { rol: "agente"; texto: string; ts: string; toolCalls: LlamadaVisible[]; needsConfirmation: boolean; error?: string }

export type Sesion = {
  id: string
  turno: number
  tokens: number
  /** Turnos para el modelo (incluye contenido nativo del proveedor). */
  turnos: Turno[]
  /** Historial visible para la usuaria (GET /api/sessions/:id). */
  chat: EntradaChat[]
  /** mensaje_id → turno en que quedó pendiente de confirmación (R-21). */
  pendientes: Record<string, number>
}

const memoria = new Map<string, Sesion>()
const ID_VALIDO = /^[a-zA-Z0-9_-]{1,64}$/

export const idSesionValido = (id: string) => ID_VALIDO.test(id)

const ruta = (dir: string, id: string) => join(dir, "out", "sessions", `${id}.json`)

export function obtenerSesion(dir: string, id: string): Sesion {
  const enMemoria = memoria.get(id)
  if (enMemoria) return enMemoria
  const archivo = ruta(dir, id)
  const sesion: Sesion = existsSync(archivo)
    ? (JSON.parse(readFileSync(archivo, "utf8")) as Sesion)
    : { id, turno: 0, tokens: 0, turnos: [], chat: [], pendientes: {} }
  memoria.set(id, sesion)
  return sesion
}

export function guardarSesion(dir: string, s: Sesion): void {
  escribirAtomico(ruta(dir, s.id), JSON.stringify(s))
}

export function borrarSesiones(): void {
  memoria.clear()
}

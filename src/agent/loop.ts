// Ciclo del agente: prompt → modelo → herramientas → respuesta (PRD §6.3, R-20..R-22).

import { agregarLinea, rutas, type Ctx } from "../core/store.ts"
import { ErrorLlm, type LlamadaHerramienta, type LlmAdapter, type ResultadoHerramienta } from "../llm/adapter.ts"
import { HERRAMIENTAS, buscarHerramienta } from "../tools/registry.ts"
import { guardarSesion, type EntradaChat, type LlamadaVisible, type Sesion } from "./sessions.ts"

export type Config = { maxIteraciones: number; maxTokensSesion: number }
export type RespuestaChat = { reply: string; toolCalls: LlamadaVisible[]; needsConfirmation: boolean; error?: string }

/** Señales de que la usuaria confirma; la guardia exige además que la pregunta sea de un turno anterior. */
const AFIRMACION = /\b(confirm\w*|s[ií]|ok|adelante|aprueb\w*|de acuerdo|procede|registra\w*|dale|correcto)\b/i

export async function procesarMensaje(sesion: Sesion, mensaje: string, llm: LlmAdapter, system: string, ctx: Ctx, cfg: Config): Promise<RespuestaChat> {
  sesion.turno++
  sesion.turnos.push({ rol: "usuario", texto: mensaje })
  sesion.chat.push({ rol: "usuario", texto: mensaje, ts: new Date().toISOString() })
  const confirmaEsteTurno = AFIRMACION.test(mensaje)
  const llamadas: LlamadaVisible[] = []
  const textos: string[] = []
  let error: string | undefined

  for (let i = 0; ; i++) {
    if (i >= cfg.maxIteraciones) {
      textos.push(`Alcancé el límite de ${cfg.maxIteraciones} pasos en este turno. Arriba está lo que alcancé a hacer; pídeme continuar para seguir con lo pendiente.`)
      break
    }
    if (sesion.tokens >= cfg.maxTokensSesion) {
      error = `Se agotó el presupuesto de tokens de esta sesión (${cfg.maxTokensSesion}). Abre una sesión nueva para continuar.`
      break
    }
    let r
    try {
      r = await llm.enviar(system, sesion.turnos, HERRAMIENTAS.map((h) => h.definicion))
    } catch (e) {
      error = `No pude consultar el modelo: ${e instanceof ErrorLlm ? e.message : "error desconocido"}. La sesión sigue activa; intenta de nuevo.`
      break
    }
    sesion.tokens += r.tokens
    sesion.turnos.push({ rol: "asistente", texto: r.texto, llamadas: r.llamadas, crudo: r.crudo })
    if (r.texto) textos.push(r.texto)
    if (r.fin === "rechazo") error = "El modelo declinó responder esta solicitud."
    if (r.llamadas.length === 0) break

    const resultados: ResultadoHerramienta[] = []
    for (const l of r.llamadas) {
      const { resultado, visible } = await ejecutarLlamada(l, sesion, ctx, confirmaEsteTurno)
      resultados.push(resultado)
      llamadas.push(visible)
    }
    sesion.turnos.push({ rol: "resultados", resultados })
  }

  // R-22: hay confirmación pendiente si alguna herramienta dejó un mensaje en revisión (dato, no texto del modelo).
  const needsConfirmation = Object.keys(sesion.pendientes).length > 0
  const reply = textos.join("\n\n")
  const entrada: EntradaChat = { rol: "agente", texto: reply, ts: new Date().toISOString(), toolCalls: llamadas, needsConfirmation, ...(error ? { error } : {}) }
  sesion.chat.push(entrada)
  guardarSesion(ctx.directory, sesion)
  return { reply, toolCalls: llamadas, needsConfirmation, ...(error ? { error } : {}) }
}

async function ejecutarLlamada(l: LlamadaHerramienta, sesion: Sesion, ctx: Ctx, confirmaEsteTurno: boolean) {
  const h = buscarHerramienta(l.nombre)
  const fallo = (msg: string) => {
    const contenido = JSON.stringify({ ok: false, error: msg })
    // CA4: también quedan en el log las llamadas rechazadas antes de ejecutarse.
    agregarLinea(rutas(ctx).log, { ts: new Date().toISOString(), herramienta: l.nombre, mensaje_id: null, ok: false, resumen: msg })
    return { resultado: { id: l.id, contenido, error: true }, visible: { nombre: l.nombre, args: l.args, ok: false, resumen: msg, resultado: null } }
  }
  if (!h) return fallo(`la herramienta ${l.nombre} no existe`)

  const parsed = h.esquema.safeParse(l.args)
  if (!parsed.success) return fallo(`argumentos inválidos: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`)

  const args = aplicarGuardia(l.nombre, parsed.data, sesion, confirmaEsteTurno)
  const contenido = await h.ejecutar(args, ctx)
  const salida = JSON.parse(contenido) as { ok: boolean; data?: Record<string, unknown>; error?: string }
  actualizarPendientes(l.nombre, args, salida, sesion)
  return {
    resultado: { id: l.id, contenido, error: !salida.ok },
    visible: { nombre: l.nombre, args, ok: salida.ok, resumen: resumir(l.nombre, salida), resultado: salida.ok ? salida.data : salida.error },
  }
}

/**
 * Guardia de confirmación (constitución P3): `confirmado=true` solo se respeta si la revisión quedó
 * pendiente en un turno ANTERIOR y el mensaje actual de la usuaria es una afirmación. Si no, se anula.
 */
function aplicarGuardia(nombre: string, args: Record<string, unknown>, sesion: Sesion, confirmaEsteTurno: boolean): Record<string, unknown> {
  if (nombre !== "contratos_registrar" || args.confirmado !== true) return args
  const id = String(args.mensaje_id)
  const pendienteAntes = sesion.pendientes[id] !== undefined && (sesion.pendientes[id] ?? 0) < sesion.turno
  if (pendienteAntes && confirmaEsteTurno) return args
  const { correcciones: _c, ...resto } = args
  return { ...resto, confirmado: false }
}

function actualizarPendientes(nombre: string, args: Record<string, unknown>, salida: { ok: boolean; data?: Record<string, unknown>; error?: string }, sesion: Sesion): void {
  const id = typeof args.mensaje_id === "string" ? args.mensaje_id : null
  if (!id) return
  const enRevision =
    (nombre === "contratos_validar" && salida.ok && Array.isArray(salida.data?.requiere_revision) && salida.data.requiere_revision.length > 0) ||
    (nombre === "contratos_registrar" && !salida.ok && (salida.error ?? "").startsWith("requiere revisión"))
  if (enRevision && sesion.pendientes[id] === undefined) sesion.pendientes[id] = sesion.turno
  if (nombre === "contratos_registrar" && salida.ok) delete sesion.pendientes[id]
}

function resumir(nombre: string, s: { ok: boolean; data?: Record<string, unknown>; error?: string }): string {
  if (!s.ok) return s.error ?? "error"
  const d = s.data ?? {}
  if (nombre === "contratos_leer_buzon") return `${(d.mensajes as unknown[] | undefined)?.length ?? 0} mensajes pendientes`
  if (nombre === "contratos_validar") {
    const rev = (d.requiere_revision as string[] | undefined) ?? []
    return `${String(d.clasificacion)}${rev.length ? ` · revisión: ${rev.join(", ")}` : ""}`
  }
  if (nombre === "contratos_registrar") return `${String(d.accion)} ${String(d.id_contrato ?? "")}`.trim()
  if (nombre === "contratos_alertas") return `alertas en ${String(d.ruta)}`
  if (nombre === "contratos_extraer") return `extraído ${String((d.id_contrato as { valor?: string } | undefined)?.valor ?? "")}`
  return "ok"
}
